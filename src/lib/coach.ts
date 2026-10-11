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
import { addDays, daysBetween, todayKey } from './dates';
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
  const today = todayKey();
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
  /** Why calories may or may not move; also shown to the model. */
  why: string;
}

/** Which way calories may move, decided from the data alone. */
export function allowedChange(s: Snapshot): Allowed {
  const fixed = (why: string): Allowed => ({ up: false, down: false, why });
  if (s.daysSinceTargetChange !== null && s.daysSinceTargetChange < MIN_DAYS_BETWEEN)
    return fixed(`Targets changed ${s.daysSinceTargetChange} days ago; the scale needs at least ${MIN_DAYS_BETWEEN} days to show the effect.`);
  if (s.rate === null) return fixed('Not enough weigh-ins to know the weight trend (needs 2+ weigh-ins at least a week apart).');
  if (s.loggedDays7 < 4) return fixed(`Only ${s.loggedDays7} of the last 7 days were logged, so intake is unknown.`);
  const ate = s.avg7 ? s.avg7.kcal / s.targets.kcal : 0;
  if (s.rate < s.gainPerWeek.low) {
    if (ate < 0.9) return fixed(`Gaining too slowly, but averaged only ${Math.round(ate * 100)}% of the target. Eating the current target comes first.`);
    return { up: true, down: false, why: `Gaining ${s.rate} kg/week, under the ${s.gainPerWeek.low}–${s.gainPerWeek.high} range, while eating ${Math.round(ate * 100)}% of the target.` };
  }
  if (s.rate > s.gainPerWeek.high) return { up: false, down: true, why: `Gaining ${s.rate} kg/week, above the ${s.gainPerWeek.high} kg upper limit.` };
  return fixed(`Gaining ${s.rate} kg/week, inside the ${s.gainPerWeek.low}–${s.gainPerWeek.high} range.`);
}

const round = (n: number, to: number) => Math.round(n / to) * to;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Turn whatever the model proposed into safe, consistent targets. */
export function guardTargets(cur: Macros, proposed: Partial<Macros>, weightKg: number, allowed: Pick<Allowed, 'up' | 'down'>): Macros {
  const want = Number.isFinite(proposed.kcal) ? (proposed.kcal as number) : cur.kcal;
  const lo = allowed.down ? cur.kcal - MAX_STEP : cur.kcal;
  const hi = allowed.up ? cur.kcal + MAX_STEP : cur.kcal;
  const kcal = allowed.up || allowed.down ? clamp(round(clamp(want, lo, hi), 50), KCAL_MIN, KCAL_MAX) : cur.kcal;
  // Protein 1.6–2.2 g per kg, which covers what a growing, training teen can use.
  const pLo = round(1.6 * weightKg, 5);
  const pHi = round(2.2 * weightKg, 5);
  const protein = clamp(round(Number.isFinite(proposed.protein) ? (proposed.protein as number) : cur.protein, 5), pLo, pHi);
  // Fat 20–35% of energy.
  const fat = Math.round(clamp(Number.isFinite(proposed.fat) ? (proposed.fat as number) : cur.fat, (kcal * 0.2) / 9, (kcal * 0.35) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

// ----- Prompts --------------------------------------------------------------------

const WHO = [
  'You are the personal nutrition coach inside Fuel Log, a food tracker used by ONE person: a teenage boy in Australia who is underweight for his height and is trying to gain weight healthily (a lean bulk) while growing and going to the gym.',
  'He is vegetarian: eggs and dairy are fine, but never meat, fish, seafood, gelatine or anything made from them. He eats a lot of Gujarati/Indian home food (rotli, dal, shaak, thepla, rice, kadhi, poha, upma) and normal Australian supermarket food.',
  'His biggest problem is getting ENOUGH food in: big meals fill him up, so calorie-dense and drinkable food works best for him.',
  'Speak to him directly as "you", like a supportive but honest coach. Plain Australian English, short sentences, no jargon, no emojis, no markdown headings.',
  'Use only the data you are given. Never make up numbers. If the data is thin, say so.',
  'Safety: food only. Never recommend supplements other than food (no creatine, mass gainers, pills); whey only when the data says wheyOk is true. Never suggest skipping meals, fasting, or losing weight. Never put raw eggs in drinks. If something sounds medical (dizziness, weight dropping while eating more, pain, disordered eating), tell him to talk to a parent and his GP.',
];

export const REVIEW_PROMPT = [
  ...WHO,
  'TASK: the weekly check-in. Read the snapshot of his log and set his daily targets for the next week.',
  'How to decide calories: the weight trend (kg per week) is the truth, not formulas. Compare the rate to his gain range. The "allowed" block tells you which way calories may move this week; if neither way is allowed, keep kcal exactly the same. When an increase is allowed, use +150 to +250 kcal (bigger when far below range). When a decrease is allowed, use -100 to -200.',
  'Protein: about 1.8–2 g per kg of body weight, rounded to 5 g. Fat: 25–30% of calories. Carbs: the rest. Small macro tweaks are fine even when calories stay the same.',
  'Look for patterns that explain the result: days not logged, weekdays vs weekends, eating late, eating most food after 3 pm, too few eating occasions (under 4 a day), protein short even when calories are hit. Name the ONE thing that would help most.',
  'focus: exactly 3 specific actions for this week that fit HIS foods and his school day (e.g. "Drink a 500 ml milk, banana and oats shake at recess", not "eat more"). At least one should be a drink or shake, because liquids are the easiest way for him to add calories.',
  'headline: max 10 words. summary: 2–3 sentences that quote the actual numbers (average intake vs target, rate vs range).',
].join('\n');

export const IDEAS_PROMPT = [
  ...WHO,
  'TASK: suggest what he can make RIGHT NOW to close today\'s gap (the "left" block). Give exactly 6 ideas: 2 that take 5 minutes, 2 that take 10 minutes, 2 that take 20 minutes, counting all prep and cooking.',
  'PRIORITY: LIQUID FOOD FIRST. Shakes, smoothies, lassis, milky drinks, hot chocolate made on milk, drinkable soups and dals are the easiest way for him to get calories in without feeling stuffed. Both 5-minute ideas MUST be shakes or smoothies. At least one of the 10-minute ideas must be liquid. At least 4 of the 6 ideas overall must be liquid. Put the liquid idea first within each time group.',
  'Calorie-dense add-ins that work: full cream milk, rolled oats, peanut butter, banana, dates, honey, Greek yoghurt, ice cream, nuts and nut butters, milk powder, cocoa, avocado, ghee, paneer, cheese, eggs (cooked only).',
  'Size each idea to cover a big chunk of what is left: roughly 30–60% of the remaining kcal, at least 300 kcal, and as much protein as fits. If very little is left, make them snack-sized.',
  'Use ingredients found in an Australian supermarket or a Gujarati home kitchen. Prefer foods he already eats (usualFoods). Do not repeat the same base twice (e.g. not two banana-oat shakes).',
  'If atSchool is true, the ideas must be things he could have prepared in the morning and drink or eat cold from a bottle or container at school; say so in the steps.',
  'Every idea: exact amounts in ingredients (grams, ml, cups, tbsp), 2–4 short steps, and realistic macros for the WHOLE serving (calories from the actual ingredient amounts; include oil, ghee and milk). why: one short sentence on why it suits him right now.',
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

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: [...STATUSES],
      description: 'on-track = gaining in range; too-slow / too-fast = rate outside range; eat-more = not eating the current target; need-data = not enough logs or weigh-ins.',
    },
    headline: { type: 'string' },
    summary: { type: 'string' },
    targets: MACROS_SCHEMA,
    focus: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'headline', 'summary', 'targets', 'focus'],
  propertyOrdering: ['status', 'headline', 'summary', 'targets', 'focus'],
} as const;

export const IDEA_KINDS = ['shake', 'smoothie', 'drink', 'soup', 'food'] as const;
export type IdeaKind = (typeof IDEA_KINDS)[number];

export const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          minutes: { type: 'integer', enum: [5, 10, 20] },
          kind: { type: 'string', enum: [...IDEA_KINDS], description: 'shake, smoothie, drink and soup are liquid' },
          serving: { type: 'string', description: 'e.g. "1 large glass (~500 ml)"' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
          ingredients: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
          why: { type: 'string' },
        },
        required: ['name', 'minutes', 'kind', 'serving', 'kcal', 'protein', 'carbs', 'fat', 'ingredients', 'steps', 'why'],
      },
    },
  },
  required: ['ideas'],
} as const;

// ----- Parsing --------------------------------------------------------------------

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const n = (v: unknown, max: number) => {
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : 0;
};
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
  const allowed = allowedChange(s);
  const to = guardTargets(cur, { kcal: n(t.kcal, 10000), protein: n(t.protein, 500), fat: n(t.fat, 500) }, s.profile.weightKg, allowed);
  return {
    date: s.today,
    status: STATUSES.includes(r.status as Status) ? (r.status as Status) : 'on-track',
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

export function parseIdeas(raw: string, wheyOk: boolean): Idea[] {
  const list = Array.isArray(obj(json(raw)).ideas) ? (obj(json(raw)).ideas as unknown[]) : [];
  return list
    .map(obj)
    .map((i): Idea => {
      const kind = IDEA_KINDS.includes(i.kind as IdeaKind) ? (i.kind as IdeaKind) : 'food';
      const m = Number(i.minutes);
      const protein = r1(n(i.protein, 300));
      const carbs = r1(n(i.carbs, 500));
      const fat = r1(n(i.fat, 300));
      // If the stated energy doesn't match its own macros, trust the macros.
      const fromMacros = protein * 4 + carbs * 4 + fat * 9;
      const stated = n(i.kcal, 3000);
      return {
        name: text(i.name, 70) || 'Idea',
        minutes: m <= 5 ? 5 : m <= 10 ? 10 : 20,
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
    .slice(0, 9);
}

// ----- Calls ----------------------------------------------------------------------

const snapText = (s: Snapshot, extra: Record<string, unknown> = {}) => `SNAPSHOT (JSON):\n${JSON.stringify({ ...s, ...extra })}`;

async function ask(key: string, model: string, body: unknown): Promise<[string, string]> {
  if (!key.trim()) throw new AiError('no-key', 'No key');
  return callWithFallback(key.trim(), model || DEFAULT_MODEL, body);
}

export async function runReview(key: string, model: string, d: AppData): Promise<Review> {
  const s = snapshot(d);
  const allowed = allowedChange(s);
  const body = {
    system_instruction: { parts: [{ text: REVIEW_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: `${snapText(s, { allowed })}\n\nDo my weekly check-in.` }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: REVIEW_SCHEMA, temperature: 0.3 },
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
  const body = {
    system_instruction: { parts: [{ text: IDEAS_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: `${snapText(s)}\n\nWhat should I make now?${note.trim() ? ` Note from me: ${note.trim().slice(0, 200)}` : ''}` }],
      },
    ],
    // Higher temperature so Refresh gives different ideas.
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: IDEAS_SCHEMA, temperature: 0.9 },
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
  const s = snapshot(d);
  const body = {
    system_instruction: { parts: [{ text: `${CHAT_PROMPT}\n\n${snapText(s)}` }] },
    contents: history.slice(-12).map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { temperature: 0.6 },
  };
  const [raw] = await ask(key, model, body);
  return raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').trim();
}

// ----- Coach state (this device only; targets themselves sync as usual) ----------

interface CoachState {
  /** Apply the weekly check-in's targets without asking. */
  auto: boolean;
  review: Review | null;
  ideas: { date: string; at: number; list: Idea[]; model: string } | null;
  chat: ChatMsg[];
  set: (patch: Partial<Omit<CoachState, 'set'>>) => void;
}

export const useCoach = create<CoachState>()(
  persist(
    (set) => ({
      auto: true,
      review: null,
      ideas: null,
      chat: [],
      set: (patch) => set(patch),
    }),
    { name: 'fuel-log-coach', version: 1, partialize: ({ set: _set, ...rest }) => rest },
  ),
);

/** True when the review changes the targets enough to matter. */
export const changes = (r: Pick<Review, 'from' | 'to'>) =>
  Math.abs(r.to.kcal - r.from.kcal) >= 50 || Math.abs(r.to.protein - r.from.protein) >= 5 || Math.abs(r.to.fat - r.from.fat) >= 5;

/** A review is due when the last one is a week old (or there never was one). */
export const reviewDue = (review: Review | null, today: string) => !review || daysBetween(review.date, today) >= MIN_DAYS_BETWEEN;

let running: Promise<Review> | null = null;

/** Run the check-in and, with auto on, apply the new targets. One at a time. */
export function checkIn(): Promise<Review> {
  running ??= (async () => {
    const st = useStore.getState();
    const review = await runReview(st.settings.geminiKey, st.settings.geminiModel, dataOf(st));
    if (useCoach.getState().auto && changes(review)) {
      useStore.getState().setTargets(review.to);
      review.applied = true;
    }
    useCoach.getState().set({ review });
    return review;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Put the targets back to what they were before the check-in. */
export function undoCheckIn() {
  const { review } = useCoach.getState();
  if (!review?.applied) return;
  useStore.getState().setTargets(review.from);
  useCoach.getState().set({ review: { ...review, applied: false } });
}

/** Apply a check-in that wasn't applied automatically. */
export function applyCheckIn() {
  const { review } = useCoach.getState();
  if (!review || review.applied) return;
  useStore.getState().setTargets(review.to);
  useCoach.getState().set({ review: { ...review, applied: true } });
}
