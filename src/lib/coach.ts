// Personal coach, powered by Gemini with the user's own key.
//
//  1. Weekly review: reads the log, weigh-ins and meal timing, and adjusts the daily targets.
//     Gemini proposes numbers and explains them, but the code below decides what is ALLOWED:
//     calories only move in the direction the weight trend supports, by at most MAX_STEP,
//     at most once a week, and protein and fat stay inside safe ranges. Carbs are always
//     recomputed so the four numbers add up.
//  2. Meal ideas: 5, 10 and 20 minute options for what's left today, liquid foods and shakes first.
//  3. Ask the coach: short answers to questions, grounded in the same snapshot of the log.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppData, Entry, Macros } from './types';
import { addDays, daysBetween, keyOf, todayKey } from './dates';
import { dayTotals, entryMacros, r1 } from './nutrition';
import { trendLine, weeklyRate } from './targets';
import { AiError, DEFAULT_MODEL, callWithFallback } from './gemini';
import { dataOf, useStore } from './store';

// ----- Snapshot: what the coach gets to see ---------------------------------------

export interface DaySummary extends Macros {
  date: string;
  items: number;
  /** Eating occasions: entries less than 45 min apart count as one. */
  meals: number;
  /** Share of the day's kcal eaten before 3 pm, 0–1. */
  beforeThree: number;
  /** Clock time of the first and last food, e.g. "7:40". */
  first: string;
  last: string;
}

export interface Snapshot {
  today: string;
  /** Local clock time, e.g. "16:05". */
  now: string;
  weekday: string;
  atSchool: boolean;
  profile: { age: number; sex: string; heightCm: number; weightKg: number; goalKg: number | null; activity: string };
  targets: Macros;
  gainPerWeek: { low: number; high: number };
  wheyOk: boolean;
  daysSinceTargetChange: number | null;
  /** Fully logged past days, newest first (today is in `soFar`). */
  days: DaySummary[];
  loggedDays7: number;
  avg7: Macros | null;
  avg14: Macros | null;
  /** Average kcal on school days vs weekends over the last 14 days. */
  weekdayKcal: number | null;
  weekendKcal: number | null;
  weighIns: { date: string; kg: number; trend: number }[];
  /** kg per week, from the weigh-ins. */
  rate: number | null;
  soFar: Macros;
  left: Macros;
  /** The foods logged most often in the last 28 days. */
  usualFoods: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
};
const avg = (xs: Macros[]): Macros | null =>
  xs.length
    ? {
        kcal: Math.round(xs.reduce((s, x) => s + x.kcal, 0) / xs.length),
        protein: r1(xs.reduce((s, x) => s + x.protein, 0) / xs.length),
        carbs: r1(xs.reduce((s, x) => s + x.carbs, 0) / xs.length),
        fat: r1(xs.reduce((s, x) => s + x.fat, 0) / xs.length),
      }
    : null;

function summarise(date: string, entries: Entry[]): DaySummary {
  const t = dayTotals({ entries, water: 0, checks: {} });
  const sorted = [...entries].sort((a, b) => a.at - b.at);
  let meals = 0;
  let prev = -Infinity;
  let early = 0;
  for (const e of sorted) {
    if (e.at - prev > 45 * 60_000) meals++;
    prev = e.at;
    if (new Date(e.at).getHours() < 15) early += entryMacros(e).kcal;
  }
  return {
    date,
    kcal: Math.round(t.kcal),
    protein: r1(t.protein),
    carbs: r1(t.carbs),
    fat: r1(t.fat),
    items: entries.length,
    meals,
    beforeThree: t.kcal ? Math.round((early / t.kcal) * 100) / 100 : 0,
    first: sorted.length ? clock(sorted[0].at) : '',
    last: sorted.length ? clock(sorted[sorted.length - 1].at) : '',
  };
}

export function snapshot(d: AppData, now = new Date()): Snapshot {
  const today = keyOf(now);
  const past = Array.from({ length: 14 }, (_, i) => addDays(today, -i - 1));
  const days = past.filter((k) => d.days[k]?.entries.length).map((k) => summarise(k, d.days[k].entries));
  const last7 = days.filter((x) => daysBetween(x.date, today) <= 7);
  const isWeekend = (k: string) => [0, 6].includes(new Date(`${k}T12:00:00`).getDay());
  const wk = days.filter((x) => !isWeekend(x.date));
  const we = days.filter((x) => isWeekend(x.date));

  const counts = new Map<string, number>();
  for (let i = 0; i < 28; i++)
    for (const e of d.days[addDays(today, -i)]?.entries ?? []) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  const usualFoods = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n]) => n);

  const lastChange = d.targetChanges[d.targetChanges.length - 1];
  const soFar = dayTotals(d.days[today]);
  const T = d.settings.targets;
  const latest = d.weighIns[d.weighIns.length - 1];
  const hour = now.getHours();
  const weekdayNum = now.getDay();

  return {
    today,
    now: `${hour}:${pad(now.getMinutes())}`,
    weekday: now.toLocaleDateString('en-AU', { weekday: 'long' }),
    atSchool: weekdayNum >= 1 && weekdayNum <= 5 && hour >= 8 && hour < 15,
    profile: {
      age: d.profile.age,
      sex: d.profile.sex,
      heightCm: d.profile.heightCm,
      weightKg: latest?.kg ?? d.profile.weightKg,
      goalKg: d.profile.goalKg,
      activity: d.profile.activity,
    },
    targets: T,
    gainPerWeek: { low: d.settings.gainLow, high: d.settings.gainHigh },
    wheyOk: d.settings.wheyOk,
    daysSinceTargetChange: lastChange ? daysBetween(lastChange.date, today) : null,
    days,
    loggedDays7: last7.length,
    avg7: avg(last7),
    avg14: avg(days),
    weekdayKcal: avg(wk)?.kcal ?? null,
    weekendKcal: avg(we)?.kcal ?? null,
    weighIns: trendLine(d.weighIns)
      .filter((w) => daysBetween(w.date, today) <= 35)
      .map((w) => ({ date: w.date, kg: w.kg, trend: r1(w.trend) })),
    rate: (() => {
      const r = weeklyRate(d.weighIns, today);
      return r === null ? null : Math.round(r * 100) / 100;
    })(),
    soFar: { kcal: Math.round(soFar.kcal), protein: r1(soFar.protein), carbs: r1(soFar.carbs), fat: r1(soFar.fat) },
    left: {
      kcal: Math.max(0, Math.round(T.kcal - soFar.kcal)),
      protein: Math.max(0, r1(T.protein - soFar.protein)),
      carbs: Math.max(0, r1(T.carbs - soFar.carbs)),
      fat: Math.max(0, r1(T.fat - soFar.fat)),
    },
    usualFoods,
  };
}

// ----- Guardrails -----------------------------------------------------------------

/** Biggest calorie change in one weekly review. */
export const MAX_STEP = 250;
/** Days the body needs to show the effect of a change on the scale before another one. */
export const MIN_DAYS_BETWEEN = 7;
const KCAL_MIN = 1800;
const KCAL_MAX = 4500;

export interface Allowed {
  up: boolean;
  down: boolean;
  /** What the data says, decided in code so the label always matches the numbers. */
  status: Status;
  /** Why calories may or may not move; also shown to the model. */
  why: string;
}

/** Which way calories may move, decided from the data alone. */
export function allowedChange(s: Snapshot): Allowed {
  const r = s.rate;
  const { low, high } = s.gainPerWeek;
  const ate = s.avg7 ? s.avg7.kcal / s.targets.kcal : 0;
  const pct = Math.round(ate * 100);
  const fixed = (status: Status, why: string): Allowed => ({ up: false, down: false, status, why });
  if (r === null) return fixed('need-data', 'Not enough weigh-ins to know the weight trend (needs 2+ weigh-ins at least a week apart).');
  if (s.loggedDays7 < 4) return fixed('need-data', `Only ${s.loggedDays7} of the last 7 days were logged, so intake is unknown.`);
  const status: Status = r < low ? (ate < 0.9 ? 'eat-more' : 'too-slow') : r > high ? 'too-fast' : 'on-track';
  if (s.daysSinceTargetChange !== null && s.daysSinceTargetChange < MIN_DAYS_BETWEEN)
    return fixed(status, `Targets changed ${s.daysSinceTargetChange} day${s.daysSinceTargetChange === 1 ? '' : 's'} ago; the scale needs at least ${MIN_DAYS_BETWEEN} days to show the effect.`);
  if (status === 'eat-more') return fixed(status, `Gaining ${r} kg/week, under the ${low}–${high} range, but you ate only ${pct}% of the target. Eating the current target comes first.`);
  if (status === 'too-slow') return { up: true, down: false, status, why: `Gaining ${r} kg/week, under the ${low}–${high} range, while eating ${pct}% of the target.` };
  if (status === 'too-fast') return { up: false, down: true, status, why: `Gaining ${r} kg/week, above the ${high} kg upper limit.` };
  return fixed(status, `Gaining ${r} kg/week, inside the ${low}–${high} range.`);
}

/** The exact calorie range a check-in may pick from. */
export function kcalBounds(cur: number, allowed: Pick<Allowed, 'up' | 'down'>): [number, number] {
  const lo = Math.max(KCAL_MIN, allowed.down ? cur - MAX_STEP : cur);
  const hi = Math.min(KCAL_MAX, allowed.up ? cur + MAX_STEP : cur);
  // Outside the absolute range already (set by hand in Profile): leave it alone.
  return lo <= hi ? [lo, hi] : [cur, cur];
}

export const proteinBounds = (weightKg: number): [number, number] => [round(1.6 * weightKg, 5), round(2.2 * weightKg, 5)];

const round = (n: number, to: number) => Math.round(n / to) * to;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Turn whatever the model proposed into safe, consistent targets. */
export function guardTargets(cur: Macros, proposed: Partial<Macros>, weightKg: number, allowed: Pick<Allowed, 'up' | 'down'>): Macros {
  const want = Number.isFinite(proposed.kcal) ? (proposed.kcal as number) : cur.kcal;
  const [lo, hi] = kcalBounds(cur.kcal, allowed);
  const kcal = lo === hi ? lo : clamp(round(clamp(want, lo, hi), 50), lo, hi);
  // Protein 1.6–2.2 g per kg, which covers what a growing, training teen can use.
  const [pLo, pHi] = proteinBounds(weightKg);
  const protein = clamp(round(Number.isFinite(proposed.protein) ? (proposed.protein as number) : cur.protein, 5), pLo, pHi);
  // Fat 20–35% of energy.
  const fat = Math.round(clamp(Number.isFinite(proposed.fat) ? (proposed.fat as number) : cur.fat, (kcal * 0.2) / 9, (kcal * 0.35) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

// ----- Prompts --------------------------------------------------------------------

const WHO = [
  'You are the personal nutrition coach inside Fuel Log, a food tracker used by ONE person: a teenage boy in Australia who is tall and lean for his height and is trying to gain weight healthily (a lean bulk) while growing and going to the gym.',
  'He is vegetarian: eggs and dairy are fine, but never meat, fish, seafood, gelatine or anything made from them. He eats a lot of Gujarati/Indian home food (rotli, dal, shaak, thepla, rice, kadhi, poha, upma) and normal Australian supermarket food.',
  'His biggest problem is getting ENOUGH food in: big meals fill him up, so calorie-dense and drinkable food works best for him.',
  'Speak to him directly as "you", like a supportive but honest coach. Plain Australian English, short sentences, no jargon, no emojis, no markdown headings. Talk about food and habits, never about his body or how he looks, and never call him "underweight" or "skinny".',
  'Use only the data you are given. Never make up numbers. If the data is thin, say so.',
  'Safety: food only. Never recommend supplements other than food (no creatine, mass gainers, pills, pre-workout, SARMs, steroids or anything similar); whey only when the data says wheyOk is true. No caffeine: no coffee, energy drinks or caffeinated drinks. Never suggest skipping meals, fasting, or losing weight. Never put raw eggs in drinks. If something sounds medical (dizziness, weight dropping while eating more, pain, allergies or intolerances, disordered eating), tell him to talk to a parent and his GP.',
];

const LEGEND = [
  'SNAPSHOT LEGEND: kcal = kilocalories; protein, carbs and fat are grams. now = local 24 h time.',
  'targets = his current daily goals. soFar = eaten today so far; left = targets minus soFar, never below 0.',
  'days = past days that have food logged (newest first, today excluded; unlogged days are missing, not zero). meals = eating occasions (items within 45 min count as one). beforeThree = fraction 0–1 of that day\'s kcal eaten before 3 pm. first/last = clock time of the first and last food.',
  'avg7 / avg14 = averages over logged days only. loggedDays7 = how many of the last 7 days were logged. weekdayKcal / weekendKcal = average kcal Mon–Fri vs Sat–Sun (Mon–Fri may include school holidays).',
  'weighIns.kg = scale weight; weighIns.trend = 7-day smoothed weight. rate = change in smoothed weight in kg per week (null = not enough weigh-ins). gainPerWeek = his target range in kg per week.',
  'usualFoods = the foods he logged most in the last 4 weeks.',
].join(' ');

export const REVIEW_PROMPT = [
  ...WHO,
  'TASK: the weekly check-in. Read the snapshot of his log and set his daily targets for the next week.',
  'The app has already decided, from the weight trend, what is ALLOWED this week (the "allowed" block): status, the exact kcal range kcalMin–kcalMax and the protein range proteinMin–proteinMax. targets.kcal MUST be inside kcalMin–kcalMax, rounded to 50. When kcalMin equals kcalMax, use exactly that. When a rise is allowed, pick the top of the range if he is far under his gain range and the middle if he is close.',
  'Protein: about 1.8–2 g per kg, inside the protein range, rounded to 5 g. Fat: 25–30% of calories. The app works carbs out itself, so put any sensible number there.',
  'Look for patterns that explain the result: days not logged, weekdays vs weekends, eating late, most food after 3 pm, too few eating occasions (under 4 a day), protein short even when calories are hit. Name the ONE thing that would help most.',
  'headline: max 10 words, matching allowed.status. summary: 2–3 sentences that quote what HAPPENED (his average intake vs target, his rate vs range) and say which way the targets move and why. Do NOT state the new kcal, protein, carbs or fat numbers in the text: the app shows them right next to it.',
  'focus: exactly 3 specific actions for this week that fit HIS foods and his school day (e.g. "Drink a 500 ml milk, banana and oats shake at recess", not "eat more"). At least one must be a drink or shake, because liquids are the easiest way for him to add calories.',
].join('\n');

export const IDEAS_PROMPT = [
  ...WHO,
  'TASK: suggest what he can have to close today\'s gap (the "left" block). These are 6 ALTERNATIVES: he will pick ONE, so size each idea on its own, never split the gap across them.',
  'Fill three groups by total time (prep + cooking): five = 2 ideas taking 5 minutes, ten = 2 ideas taking 10 minutes, twenty = 2 ideas taking 20 minutes.',
  'PRIORITY: LIQUID FOOD FIRST. Shakes, smoothies, lassis, milky drinks, hot chocolate made on milk, and drinkable soups and dals are the easiest way for him to get calories in without feeling stuffed. five: both are shakes or smoothies. ten: the first is liquid. twenty: the first is liquid (e.g. a thick dal or soup, a kheer-style milk drink, a hot milky drink). That makes at least 4 liquid ideas out of 6.',
  'Calorie-dense add-ins that work: full cream milk, rolled oats, peanut butter, banana, dates, honey, Greek yoghurt, ice cream, nuts and nut butters, milk powder, cocoa, avocado, ghee, paneer, cheese, eggs (cooked only).',
  'Size: each idea 30–60% of left.kcal, at least 300 and at most 900 kcal, with as much protein as fits. If left.kcal is under 300, make each a 250–400 kcal snack.',
  'Use ingredients from an Australian supermarket or a Gujarati home kitchen. Prefer foods he already eats (usualFoods). Do not repeat the same base twice (e.g. not two banana-oat shakes).',
  'If atSchool is true, every idea must be something he can make at home in the morning and drink or eat cold at school from a bottle or container; the minutes are morning prep time, and the steps say how to pack it.',
  'Every idea: exact amounts in ingredients (grams, ml, cups, tbsp), 2–4 short steps, and realistic macros for the WHOLE serving worked out from the actual ingredient amounts (include oil, ghee and milk). why: one short sentence on why it suits him right now.',
].join('\n');

export const CHAT_PROMPT = [
  ...WHO,
  'TASK: answer his question using the snapshot of his log below. Be specific to his numbers and foods.',
  'Keep answers under 120 words. Use short paragraphs or a few "- " bullet lines. When you suggest food, prefer drinks and shakes first, and give amounts and rough kcal/protein.',
  'You cannot change his targets from chat; if he asks, explain what the weekly check-in on the Coach tab will look at.',
].join('\n');

const MACROS_SCHEMA = {
  type: 'object',
  properties: {
    kcal: { type: 'number', description: 'kilocalories per day' },
    protein: { type: 'number', description: 'grams per day' },
    carbs: { type: 'number', description: 'grams per day' },
    fat: { type: 'number', description: 'grams per day' },
  },
  required: ['kcal', 'protein', 'carbs', 'fat'],
} as const;

export const STATUSES = ['on-track', 'too-slow', 'too-fast', 'eat-more', 'need-data'] as const;
export type Status = (typeof STATUSES)[number];

// Numbers come before the text, so the model writes its explanation after it has picked them.
export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    targets: MACROS_SCHEMA,
    headline: { type: 'string' },
    summary: { type: 'string' },
    focus: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
  },
  required: ['targets', 'headline', 'summary', 'focus'],
} as const;

export const IDEA_KINDS = ['shake', 'smoothie', 'drink', 'soup', 'food'] as const;
export type IdeaKind = (typeof IDEA_KINDS)[number];

const ideaItem = (kinds: readonly string[]) => ({
  type: 'object',
  properties: {
    name: { type: 'string' },
    kind: { type: 'string', enum: [...kinds], description: 'shake, smoothie, drink and soup are liquid' },
    serving: { type: 'string', description: 'e.g. "1 large glass (~500 ml)"' },
    kcal: { type: 'number' },
    protein: { type: 'number' },
    carbs: { type: 'number' },
    fat: { type: 'number' },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    why: { type: 'string' },
  },
  required: ['name', 'kind', 'serving', 'kcal', 'protein', 'carbs', 'fat', 'ingredients', 'steps', 'why'],
});

/** One slot per time; the 5-minute slot can only hold shakes and smoothies. */
export const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    five: { type: 'array', items: ideaItem(['shake', 'smoothie']), minItems: 2, maxItems: 2 },
    ten: { type: 'array', items: ideaItem(IDEA_KINDS), minItems: 2, maxItems: 2 },
    twenty: { type: 'array', items: ideaItem(IDEA_KINDS), minItems: 2, maxItems: 2 },
  },
  required: ['five', 'ten', 'twenty'],
} as const;

// ----- Parsing --------------------------------------------------------------------

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** A number in 0..max, or undefined when missing or not a number. */
const num = (v: unknown, max: number) => {
  const x = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : undefined;
};
const n = (v: unknown, max: number) => num(v, max) ?? 0;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const json = (s: string) => JSON.parse(s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()) as unknown;

export interface Review {
  date: string;
  status: Status;
  headline: string;
  summary: string;
  focus: string[];
  /** Targets before and after (after = guarded). */
  from: Macros;
  to: Macros;
  allowed: Allowed;
  applied: boolean;
  model: string;
}

export function parseReview(raw: string, cur: Macros, s: Snapshot, model: string): Review {
  const r = obj(json(raw));
  const t = obj(r.targets);
  // A reply without real numbers must never move the targets (0 would read as "as low as allowed").
  const proposed = { kcal: num(t.kcal, 10000), protein: num(t.protein, 500), fat: num(t.fat, 500) };
  if (proposed.kcal === undefined || proposed.protein === undefined || proposed.fat === undefined) throw new Error('No targets');
  const allowed = allowedChange(s);
  const to = guardTargets(cur, proposed, s.profile.weightKg, allowed);
  return {
    date: s.today,
    status: allowed.status,
    headline: text(r.headline, 90) || 'Weekly check-in',
    summary: text(r.summary, 600),
    focus: (Array.isArray(r.focus) ? r.focus : []).map((x) => text(x, 200)).filter(Boolean).slice(0, 3),
    from: cur,
    to,
    allowed,
    applied: false,
    model,
  };
}

export interface Idea extends Macros {
  name: string;
  minutes: 5 | 10 | 20;
  kind: IdeaKind;
  liquid: boolean;
  serving: string;
  ingredients: string[];
  steps: string[];
  why: string;
}

const SLOTS = [
  ['five', 5],
  ['ten', 10],
  ['twenty', 20],
] as const;

export function parseIdeas(raw: string, wheyOk: boolean): Idea[] {
  const r = obj(json(raw));
  return SLOTS.flatMap(([slot, minutes]) => (Array.isArray(r[slot]) ? (r[slot] as unknown[]) : []).map((x) => ({ ...obj(x), minutes })))
    .map((i: Record<string, unknown> & { minutes: Idea['minutes'] }): Idea => {
      const kind = IDEA_KINDS.includes(i.kind as IdeaKind) ? (i.kind as IdeaKind) : 'food';
      const protein = r1(n(i.protein, 300));
      const carbs = r1(n(i.carbs, 500));
      const fat = r1(n(i.fat, 300));
      // If the stated energy doesn't match its own macros, trust the macros.
      const fromMacros = protein * 4 + carbs * 4 + fat * 9;
      const stated = n(i.kcal, 3000);
      return {
        name: text(i.name, 70) || 'Idea',
        minutes: i.minutes,
        kind,
        liquid: kind !== 'food',
        serving: text(i.serving, 60) || '1 serve',
        kcal: Math.round(fromMacros && Math.abs(stated - fromMacros) / fromMacros > 0.2 ? fromMacros : stated),
        protein,
        carbs,
        fat,
        ingredients: (Array.isArray(i.ingredients) ? i.ingredients : []).map((x) => text(x, 120)).filter(Boolean).slice(0, 12),
        steps: (Array.isArray(i.steps) ? i.steps : []).map((x) => text(x, 240)).filter(Boolean).slice(0, 6),
        why: text(i.why, 200),
      };
    })
    .filter((i) => i.kcal > 0 && (wheyOk || !/whey|protein powder/i.test(`${i.name} ${i.ingredients.join(' ')}`)))
    .sort((a, b) => a.minutes - b.minutes || Number(b.liquid) - Number(a.liquid))
    .slice(0, 6);
}

// ----- Calls ----------------------------------------------------------------------

const snapText = (s: object) => `${LEGEND}\n\nSNAPSHOT (JSON):\n${JSON.stringify(s)}`;

async function ask(key: string, model: string, body: unknown): Promise<[string, string]> {
  if (!key.trim()) throw new AiError('no-key', 'No key');
  return callWithFallback(key.trim(), model || DEFAULT_MODEL, body);
}

// Temperature is left at Gemini's default: current Flash models are tuned for it.

export async function runReview(key: string, model: string, d: AppData): Promise<Review> {
  const s = snapshot(d);
  const a = allowedChange(s);
  const [kcalMin, kcalMax] = kcalBounds(s.targets.kcal, a);
  const [proteinMin, proteinMax] = proteinBounds(s.profile.weightKg);
  const body = {
    system_instruction: { parts: [{ text: REVIEW_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: `${snapText({ ...s, allowed: { status: a.status, reason: a.why, kcalMin, kcalMax, proteinMin, proteinMax } })}\n\nDo my weekly check-in.` }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: REVIEW_SCHEMA },
  };
  const [raw, used] = await ask(key, model, body);
  try {
    return parseReview(raw, d.settings.targets, s, used);
  } catch {
    throw new AiError('bad-reply', 'Unreadable reply');
  }
}

export async function runIdeas(key: string, model: string, d: AppData, note = ''): Promise<{ ideas: Idea[]; model: string }> {
  const s = snapshot(d);
  // Only what matters for right now; the history isn't needed and costs tokens.
  const { now, weekday, atSchool, targets, soFar, left, usualFoods, wheyOk } = s;
  const body = {
    system_instruction: { parts: [{ text: IDEAS_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: `${snapText({ now, weekday, atSchool, targets, soFar, left, usualFoods, wheyOk })}\n\nWhat should I have now?${note.trim() ? ` Note from me: ${note.trim().slice(0, 200)}` : ''}` }],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: IDEAS_SCHEMA },
  };
  const [raw, used] = await ask(key, model, body);
  let ideas: Idea[];
  try {
    ideas = parseIdeas(raw, d.settings.wheyOk);
  } catch {
    throw new AiError('bad-reply', 'Unreadable reply');
  }
  if (!ideas.length) throw new AiError('bad-reply', 'No ideas');
  return { ideas, model: used };
}

export interface ChatMsg {
  role: 'user' | 'model';
  text: string;
}

export async function runChat(key: string, model: string, d: AppData, history: ChatMsg[]): Promise<string> {
  const body = {
    system_instruction: { parts: [{ text: `${CHAT_PROMPT}\n\n${snapText(snapshot(d))}` }] },
    contents: history.slice(-12).map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
  };
  const [raw] = await ask(key, model, body);
  return raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').trim();
}

// ----- Coach state (this device only; targets themselves sync as usual) ----------

interface CoachState {
  /** Apply the weekly check-in's targets without asking. */
  auto: boolean;
  review: Review | null;
  /** Epoch ms of the last automatic attempt, so a failing one doesn't retry on every open. */
  tried: number;
  ideas: { date: string; at: number; list: Idea[]; model: string } | null;
  chat: ChatMsg[];
  set: (patch: Partial<Omit<CoachState, 'set'>>) => void;
}

export const useCoach = create<CoachState>()(
  persist(
    (set) => ({
      auto: true,
      review: null,
      tried: 0,
      ideas: null,
      chat: [],
      set: (patch) => set(patch),
    }),
    { name: 'fuel-log-coach', version: 1, partialize: ({ set: _set, ...rest }) => rest },
  ),
);

const same = (a: Macros, b: Macros) => a.kcal === b.kcal && a.protein === b.protein && a.carbs === b.carbs && a.fat === b.fat;

/** True when the review changes the targets enough to matter. */
export const changes = (r: Pick<Review, 'from' | 'to'>) =>
  Math.abs(r.to.kcal - r.from.kcal) >= 50 || Math.abs(r.to.protein - r.from.protein) >= 5 || Math.abs(r.to.fat - r.from.fat) >= 5;

/** A review is due when the last one is a week old (or there never was one). */
export const reviewDue = (review: Review | null, today: string) => !review || daysBetween(review.date, today) >= MIN_DAYS_BETWEEN;

const RETRY_MS = 6 * 3_600_000;

/** Whether the app should run the check-in by itself now. */
export function autoDue(today: string, now = Date.now()): boolean {
  const { auto, review, tried } = useCoach.getState();
  return auto && reviewDue(review, today) && now - tried > RETRY_MS;
}

let running: Promise<Review> | null = null;

/** Run the check-in and, with auto on, apply the new targets. One at a time. */
export function checkIn(): Promise<Review> {
  running ??= (async () => {
    const st = useStore.getState();
    const before = st.settings.targets;
    const prev = useCoach.getState().review;
    let review = await runReview(st.settings.geminiKey, st.settings.geminiModel, dataOf(st));
    const cur = useStore.getState().settings.targets;
    // Targets edited (or synced in) while Gemini was answering: don't overwrite them.
    const untouched = same(cur, before);
    if (useCoach.getState().auto && untouched && changes(review)) {
      useStore.getState().setTargets(review.to);
      review = { ...review, applied: true };
    }
    // Checking in again on the same day keeps the earlier change undoable.
    if (prev?.applied && prev.date === review.date && same(before, prev.to))
      review = { ...review, from: prev.from, to: review.applied ? review.to : before, applied: true };
    useCoach.getState().set({ review });
    return review;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Put the targets back to what they were before the check-in. False if they've changed since. */
export function undoCheckIn(): boolean {
  const { review } = useCoach.getState();
  const cur = useStore.getState().settings.targets;
  if (!review?.applied || !same(cur, review.to) || daysBetween(review.date, todayKey()) >= MIN_DAYS_BETWEEN) return false;
  useStore.getState().setTargets(review.from);
  useCoach.getState().set({ review: { ...review, applied: false } });
  return true;
}

/** Apply a check-in that wasn't applied automatically. Only today, and only onto the targets it was based on. */
export function applyCheckIn(): boolean {
  const { review } = useCoach.getState();
  const cur = useStore.getState().settings.targets;
  if (!review || review.applied || review.date !== todayKey() || !same(cur, review.from)) return false;
  useStore.getState().setTargets(review.to);
  useCoach.getState().set({ review: { ...review, applied: true } });
  return true;
}
