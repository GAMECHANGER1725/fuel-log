// Gamification engine. Everything is computed from the log itself (pure functions),
// so deleting a meal takes its XP back and nothing can drift out of sync.
// ponytail: rescans all history on each change (fine for years of data); memoise per day if it ever lags.

import type { AppData, DayLog, Macros } from './types';
import { addDays, daysBetween, hash, weekStart } from './dates';
import { dayTotals, sumEntries } from './nutrition';

export const HIT = 0.95; // 95% of a target counts as hit

// ----- Levels ---------------------------------------------------------------

export const RANKS: { level: number; name: string }[] = [
  { level: 1, name: 'Rookie' },
  { level: 2, name: 'Snacker' },
  { level: 4, name: 'Grazer' },
  { level: 6, name: 'Fueler' },
  { level: 8, name: 'Furnace' },
  { level: 10, name: 'Engine' },
  { level: 13, name: 'Powerhouse' },
  { level: 16, name: 'Juggernaut' },
  { level: 20, name: 'Titan' },
  { level: 25, name: 'Mythic' },
];

/** XP needed to go from level L to L+1. */
export const stepXp = (level: number) => 150 + 100 * (level - 1);

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = xp;
  while (rest >= stepXp(level)) {
    rest -= stepXp(level);
    level++;
  }
  return { level, into: rest, need: stepXp(level) };
}

export function rankFor(level: number) {
  let i = 0;
  RANKS.forEach((r, j) => {
    if (level >= r.level) i = j;
  });
  return { index: i, name: RANKS[i].name, next: RANKS[i + 1] ?? null };
}

// ----- Daily quests -----------------------------------------------------------

interface Ctx {
  targets: Macros;
  waterGlasses: number;
}

export interface QuestDef {
  id: string;
  title: string;
  xp: number;
  done: (day: DayLog, ctx: Ctx) => boolean;
}

const hourOf = (ms: number) => new Date(ms).getHours();
/** Totals of what was logged in hours [from, to). */
const between = (day: DayLog, from: number, to: number) => sumEntries(day.entries.filter((e) => hourOf(e.at) >= from && hourOf(e.at) < to));
/** Number of distinct clock hours whose logged food passes `pred`. */
const hoursWith = (day: DayLog, pred: (m: Macros) => boolean) =>
  [...new Set(day.entries.map((e) => hourOf(e.at)))].filter((h) => pred(between(day, h, h + 1))).length;

export const QUESTS: QuestDef[] = [
  { id: 'early', title: 'Log food before 9 am', xp: 20, done: (d) => d.entries.some((e) => hourOf(e.at) < 9) },
  { id: 'p-2pm', title: 'Hit 40 g protein before 2 pm', xp: 30, done: (d) => between(d, 0, 14).protein >= 40 },
  { id: 'scan', title: 'Scan a packet with the barcode scanner', xp: 25, done: (d) => d.entries.some((e) => e.source === 'scan') },
  { id: 'water', title: 'Drink your water goal', xp: 20, done: (d, c) => d.water >= c.waterGlasses },
  { id: 'five', title: 'Log 5 or more foods today', xp: 25, done: (d) => d.entries.length >= 5 },
  { id: 'spread', title: 'Eat in the morning, afternoon and evening', xp: 25, done: (d) => [between(d, 0, 12), between(d, 12, 17), between(d, 17, 24)].every((m) => m.kcal > 0) },
  { id: 'late', title: 'Have a 300+ kcal snack after 8 pm', xp: 20, done: (d) => between(d, 20, 24).kcal >= 300 },
  { id: 'p3', title: 'Get 20 g+ protein at 3 different times', xp: 30, done: (d) => hoursWith(d, (m) => m.protein >= 20) >= 3 },
  { id: 'big-am', title: 'Eat 600+ kcal before 10 am', xp: 25, done: (d) => between(d, 0, 10).kcal >= 600 },
  { id: 'ai', title: 'Log a meal with the AI scanner', xp: 20, done: (d) => d.entries.some((e) => e.source.startsWith('ai-')) },
  { id: 'quality', title: 'Tick all 4 food-quality checks', xp: 20, done: (d) => Object.values(d.checks).filter(Boolean).length >= 4 },
  { id: 'both', title: 'Hit your kcal and protein today', xp: 40, done: (d, c) => hits(dayTotals(d), c.targets).both },
];

/** Three quests for a date, the same every time for that date. */
export function questsFor(date: string): QuestDef[] {
  const pool = [...QUESTS];
  const out: QuestDef[] = [];
  let h = hash(date);
  for (let i = 0; i < 3; i++) {
    out.push(pool.splice(h % pool.length, 1)[0]);
    h = hash(String(h));
  }
  return out;
}

// ----- Weekly boss ------------------------------------------------------------

export interface BossDef {
  id: string;
  title: string;
  need: number;
  count: (s: DayStats) => boolean;
}

export const BOSSES: BossDef[] = [
  { id: 'kcal5', title: 'Hit your kcal on 5 of 7 days', need: 5, count: (s) => s.hitKcal },
  { id: 'protein6', title: 'Hit your protein on 6 of 7 days', need: 6, count: (s) => s.hitProtein },
  { id: 'log7', title: 'Log food every day this week', need: 7, count: (s) => s.logged },
  { id: 'water5', title: 'Hit your water goal on 5 of 7 days', need: 5, count: (s) => s.water },
  { id: 'both4', title: 'Hit kcal and protein together on 4 days', need: 4, count: (s) => s.hitKcal && s.hitProtein },
];
export const BOSS_XP = 150;

export const bossFor = (week: string) => BOSSES[hash(`boss${week}`) % BOSSES.length];

// ----- Per-day stats and XP -----------------------------------------------------

export interface DayStats {
  date: string;
  logged: boolean;
  totals: Macros;
  hitKcal: boolean;
  hitProtein: boolean;
  water: boolean;
  xp: number;
  questsDone: string[];
}

export function hits(t: Macros, targets: Macros) {
  const hitKcal = t.kcal >= targets.kcal * HIT;
  const hitProtein = t.protein >= targets.protein * HIT;
  return { hitKcal, hitProtein, both: hitKcal && hitProtein };
}

export const XP = { meal: 10, mealCap: 8, scan: 5, scanCap: 3, kcal: 50, protein: 50, both: 25, water: 15, check: 5, weighIn: 20 };

export function dayStats(date: string, day: DayLog | undefined, ctx: Ctx, weighed: boolean): DayStats {
  const d = day ?? { entries: [], water: 0, checks: {} };
  const totals = dayTotals(d);
  const h = hits(totals, ctx.targets);
  const water = d.water >= ctx.waterGlasses;
  const logged = d.entries.length > 0;
  const quests = logged ? questsFor(date).filter((q) => q.done(d, ctx)) : [];
  const scans = d.entries.filter((e) => e.source === 'scan' || e.source.startsWith('ai-')).length;
  const xp =
    Math.min(d.entries.length, XP.mealCap) * XP.meal +
    Math.min(scans, XP.scanCap) * XP.scan +
    (h.hitKcal ? XP.kcal : 0) +
    (h.hitProtein ? XP.protein : 0) +
    (h.both ? XP.both : 0) +
    (water ? XP.water : 0) +
    Object.values(d.checks).filter(Boolean).length * XP.check +
    (weighed ? XP.weighIn : 0) +
    quests.reduce((s, q) => s + q.xp, 0);
  return { date, logged, totals, hitKcal: h.hitKcal, hitProtein: h.hitProtein, water, xp, questsDone: quests.map((q) => q.id) };
}

// ----- Streaks ----------------------------------------------------------------

/**
 * A logged day (1+ entries) extends the streak. Every 7 logged days in a row earns a freeze (max 2).
 * A missed day spends a freeze instead of breaking the streak. Today never breaks it.
 */
export function streaks(stats: DayStats[], today: string) {
  let current = 0;
  let best = 0;
  let freezes = 0;
  let run = 0;
  const frozen: string[] = [];
  for (const s of stats) {
    if (s.logged) {
      current++;
      run++;
      if (run % 7 === 0 && freezes < 2) freezes++;
      best = Math.max(best, current);
    } else if (s.date === today) {
      // still time today
    } else if (current > 0 && freezes > 0) {
      freezes--;
      frozen.push(s.date);
    } else {
      current = 0;
      run = 0;
    }
  }
  return { current, best, freezes, frozen };
}

function longestRun(stats: DayStats[], pred: (s: DayStats) => boolean) {
  let cur = 0;
  let best = 0;
  for (const s of stats) {
    cur = pred(s) ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

// ----- Badges -----------------------------------------------------------------

export interface Badge {
  id: string;
  name: string;
  desc: string;
  glyph: string;
  tone: 'fuel' | 'protein' | 'sand' | 'ink';
  have: number;
  need: number;
  earned: boolean;
}

// ----- Everything at once -------------------------------------------------------

export function computeGame(d: AppData, today: string) {
  const ctx: Ctx = { targets: d.settings.targets, waterGlasses: Math.round(d.settings.waterL * 4) };
  const weighed = new Set(d.weighIns.map((w) => w.date));
  const logged = Object.keys(d.days).filter((k) => d.days[k].entries.length).sort();
  const first = [logged[0], d.weighIns.map((w) => w.date).sort()[0]].filter(Boolean).sort()[0] ?? today;
  const start = first < today ? first : today;

  const stats: DayStats[] = [];
  for (let k = start; k <= today; k = addDays(k, 1)) stats.push(dayStats(k, d.days[k], ctx, weighed.has(k)));
  const byDate = new Map(stats.map((s) => [s.date, s]));

  // Weekly bosses
  let bossWins = 0;
  let bossXp = 0;
  for (let w = weekStart(start); w <= today; w = addDays(w, 7)) {
    const b = bossFor(w);
    const n = Array.from({ length: 7 }, (_, i) => byDate.get(addDays(w, i))).filter((s) => s && b.count(s)).length;
    if (n >= b.need) {
      bossWins++;
      bossXp += BOSS_XP;
    }
  }
  const thisWeek = weekStart(today);
  const bossDef = bossFor(thisWeek);
  const bossCount = Array.from({ length: 7 }, (_, i) => byDate.get(addDays(thisWeek, i))).filter((s) => s && bossDef.count(s)).length;

  const xp = stats.reduce((s, x) => s + x.xp, 0) + bossXp;
  const lvl = levelFromXp(xp);
  const rank = rankFor(lvl.level);
  const streak = streaks(stats, today);
  const todayStats = byDate.get(today)!;
  const todayDay = d.days[today] ?? { entries: [], water: 0, checks: {} };

  // Badge inputs
  const allEntries = Object.values(d.days).flatMap((x) => x.entries);
  const meals = allEntries.length;
  const scans = allEntries.filter((e) => e.source === 'scan').length;
  const ai = allEntries.filter((e) => e.source.startsWith('ai-')).length;
  const maxKcal = Math.max(0, ...stats.map((s) => s.totals.kcal));
  const waterDays = stats.filter((s) => s.water).length;
  const earlyDays = Object.values(d.days).filter((x) => x.entries.some((e) => hourOf(e.at) < 9)).length;
  const proteinRun = longestRun(stats, (s) => s.hitProtein);
  const w = [...d.weighIns].sort((a, b) => (a.date < b.date ? -1 : 1));
  const gained = w.length >= 2 ? Math.max(0, w[w.length - 1].kg - w[0].kg) : 0;
  let perfect = 0;
  for (let k = weekStart(start); addDays(k, 6) <= today; k = addDays(k, 7)) {
    const all = Array.from({ length: 7 }, (_, i) => byDate.get(addDays(k, i)));
    if (all.every((s) => s && s.hitKcal && s.hitProtein)) perfect++;
  }

  const B = (id: string, name: string, desc: string, glyph: string, tone: Badge['tone'], have: number, need: number): Badge => ({
    id, name, desc, glyph, tone, have: Math.min(have, need), need, earned: have >= need,
  });
  const badges: Badge[] = [
    B('first-meal', 'First bite', 'Log your first meal', '1', 'ink', meals, 1),
    B('meals-50', '50 meals', 'Log 50 meals', '50', 'ink', meals, 50),
    B('meals-250', '250 meals', 'Log 250 meals', '250', 'ink', meals, 250),
    B('first-scan', 'First scan', 'Scan a barcode', 'SC', 'fuel', scans, 1),
    B('scans-25', 'Scanner pro', 'Scan 25 barcodes', 'S25', 'fuel', scans, 25),
    B('first-ai', 'Plate reader', 'Log food with AI', 'AI', 'fuel', ai, 1),
    B('streak-7', 'Week one', 'Reach a 7-day streak', '7D', 'fuel', streak.best, 7),
    B('streak-30', '30-day streak', 'Reach a 30-day streak', '30', 'fuel', streak.best, 30),
    B('streak-100', 'Centurion', 'Reach a 100-day streak', 'C', 'fuel', streak.best, 100),
    B('protein-7', 'Protein 7-streak', 'Hit protein 7 days in a row', 'P7', 'protein', proteinRun, 7),
    B('kcal-3000', '3,000 Club', 'Eat 3,000 kcal in a day', '3K', 'sand', maxKcal, 3000),
    B('hydrated-7', 'Hydrated x7', 'Hit your water goal on 7 days', 'H2O', 'protein', waterDays, 7),
    B('early-14', 'Early fuel', 'Log food before 9 am on 14 days', 'AM', 'ink', earlyDays, 14),
    B('boss-1', 'Boss slayer', 'Beat a weekly boss', 'B', 'sand', bossWins, 1),
    B('boss-5', 'Boss hunter', 'Beat 5 weekly bosses', 'B5', 'sand', bossWins, 5),
    B('level-5', 'Level 5', 'Reach level 5', 'L5', 'sand', lvl.level, 5),
    B('level-10', 'Level 10', 'Reach level 10', 'L10', 'sand', lvl.level, 10),
    B('gained-1', '1 kg gained', 'Gain 1 kg since your first weigh-in', '+1', 'protein', Math.round(gained * 10), 10),
    B('gained-5', '5 kg gained', 'Gain 5 kg since your first weigh-in', '+5', 'protein', Math.round(gained * 10), 50),
    B('perfect-week', 'Perfect week', 'Hit kcal and protein all 7 days, Mon–Sun', 'PW', 'fuel', perfect, 1),
  ];

  return {
    xp,
    ...lvl,
    rank,
    streak,
    stats,
    byDate,
    today: todayStats,
    quests: questsFor(today).map((q) => ({ ...q, isDone: todayDay.entries.length > 0 && q.done(todayDay, ctx) })),
    boss: { ...bossDef, have: bossCount, won: bossCount >= bossDef.need, daysLeft: 6 - daysBetween(thisWeek, today) },
    bossWins,
    badges,
  };
}

export type Game = ReturnType<typeof computeGame>;
