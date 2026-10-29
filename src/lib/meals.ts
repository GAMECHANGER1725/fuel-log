// "Usual meals": groups of foods you tend to log together, found from the log itself (nothing stored).
// A group is two or more entries on one day each within `gapMin` minutes of the one before.

import type { DayLog, Entry } from './types';
import { addDays } from './dates';
import { energy, sumEntries } from './nutrition';
import { momentOf, type Moment } from './foods';

/**
 * How many servings of a food you had the last time you logged it (same name and serving) in the
 * last `lookback` days, so the amount starts where you usually are. 1 if never.
 */
export function lastQty(days: Record<string, DayLog>, today: string, name: string, serving: string, lookback = 30): number {
  const n = name.trim().toLowerCase();
  for (let i = 0; i < lookback; i++) {
    const hits = (days[addDays(today, -i)]?.entries ?? []).filter((e) => e.name.trim().toLowerCase() === n && e.serving === serving);
    if (hits.length) return hits.reduce((a, b) => (b.at > a.at ? b : a)).qty;
  }
  return 1;
}

export interface MealGroup {
  /** Same foods and amounts give the same key. */
  key: string;
  /** The foods, as logged the most recent time. */
  items: Entry[];
  kcal: number;
  protein: number;
  count: number;
  last: number;
}

const sig = (items: Entry[]) =>
  items
    .map((e) => `${e.name.trim().toLowerCase()}×${e.qty}`)
    .sort()
    .join('|');

export function mealGroups(days: Record<string, DayLog>, today: string, lookback = 14, gapMin = 20, max = 5): MealGroup[] {
  const found = new Map<string, MealGroup>();
  for (let i = 0; i < lookback; i++) {
    const log = [...(days[addDays(today, -i)]?.entries ?? [])].sort((a, b) => a.at - b.at);
    let run: Entry[] = [];
    const flush = () => {
      // ponytail: groups of up to 6 items; a bigger cluster is more likely a whole day logged at once.
      if (run.length >= 2 && run.length <= 6) {
        const key = sig(run);
        const last = run[run.length - 1].at;
        const g = found.get(key);
        if (!g) {
          const t = sumEntries(run);
          found.set(key, { key, items: run, kcal: t.kcal, protein: t.protein, count: 1, last });
        } else {
          g.count++;
          if (last > g.last) Object.assign(g, { items: run, last });
        }
      }
      run = [];
    };
    for (const e of log) {
      if (run.length && e.at - run[run.length - 1].at > gapMin * 60_000) flush();
      run.push(e);
    }
    flush();
  }
  return [...found.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, max);
}

export const SECTION_LABEL: Record<Moment, string> = {
  breakfast: 'Breakfast',
  morning: 'Morning snack',
  lunch: 'Lunch',
  afternoon: 'Afternoon snack',
  dinner: 'Dinner',
  late: 'Late snack',
};

export interface LogSection {
  moment: Moment;
  entries: Entry[];
  kcal: number;
  protein: number;
}

/** A day's log in time order, split where the part of the day changes, each with its subtotal. */
export function logSections(entries: Entry[]): LogSection[] {
  const out: LogSection[] = [];
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    const d = new Date(e.at);
    const moment = momentOf(d.getHours() + d.getMinutes() / 60);
    const last = out[out.length - 1];
    if (last?.moment === moment) last.entries.push(e);
    else out.push({ moment, entries: [e], kcal: 0, protein: 0 });
  }
  for (const s of out) {
    const t = sumEntries(s.entries);
    s.kcal = t.kcal;
    s.protein = t.protein;
  }
  return out;
}

/** Plain-text summary of a day for sharing, e.g. with a parent or coach. */
export function daySummary(title: string, entries: Entry[], target: { kcal: number; protein: number }, unit: 'kcal' | 'kJ', fmtTime: (ms: number) => string): string {
  const t = sumEntries(entries);
  const e = (kcal: number) => `${energy(kcal, unit)} ${unit}`;
  const lines = [`${title}: ${e(t.kcal)} of ${e(target.kcal)}, ${Math.round(t.protein)} g of ${target.protein} g protein`];
  for (const s of logSections(entries)) {
    lines.push('', `${SECTION_LABEL[s.moment]} (${e(s.kcal)}, ${Math.round(s.protein)} g)`);
    for (const x of s.entries) lines.push(`• ${fmtTime(x.at)} ${x.qty !== 1 ? `${x.qty}× ` : ''}${x.name}`);
  }
  return lines.join('\n');
}

export interface WeekStats {
  /** Days in the week with something logged (up to today). */
  logged: number;
  /** Logged days that reached both energy and protein targets. */
  hit: number;
  /** Averages over logged days; null with none. */
  kcal: number | null;
  protein: number | null;
}

/** Monday-to-Sunday stats from `start`, counting only days up to `today`. */
export function weekStats(days: Record<string, DayLog>, start: string, today: string, target: { kcal: number; protein: number }): WeekStats {
  const keys = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((k) => k <= today && days[k]?.entries.length);
  const totals = keys.map((k) => sumEntries(days[k].entries));
  const avg = (f: (t: (typeof totals)[number]) => number) => (totals.length ? totals.reduce((a, t) => a + f(t), 0) / totals.length : null);
  return {
    logged: totals.length,
    // Each day against its own energy target (a training day's is higher).
    hit: totals.filter((t, i) => t.kcal >= target.kcal + (days[keys[i]].boost ?? 0) && t.protein >= target.protein).length,
    kcal: avg((t) => t.kcal),
    protein: avg((t) => t.protein),
  };
}

export interface Records {
  kcal: { date: string; value: number } | null;
  protein: { date: string; value: number } | null;
  /** Glasses of water. */
  water: { date: string; value: number } | null;
}

/** Best single days in the log: most energy, most protein, most water (earliest date wins a tie). */
export function records(days: Record<string, DayLog>): Records {
  const out: Records = { kcal: null, protein: null, water: null };
  for (const date of Object.keys(days).sort()) {
    const d = days[date];
    const t = sumEntries(d.entries);
    if (t.kcal > 0 && (!out.kcal || t.kcal > out.kcal.value)) out.kcal = { date, value: t.kcal };
    if (t.protein > 0 && (!out.protein || t.protein > out.protein.value)) out.protein = { date, value: t.protein };
    if (d.water > 0 && (!out.water || d.water > out.water.value)) out.water = { date, value: d.water };
  }
  return out;
}

export interface Insight {
  tone: 'good' | 'tip';
  text: string;
}

/**
 * A few plain observations from the last 7 days before today (no AI): how often targets were hit,
 * the average gap to the energy target, the lightest main meal, missed days and late eating.
 * `fmtKcal` formats energy in the user's unit.
 */
export function insights(days: Record<string, DayLog>, today: string, target: { kcal: number; protein: number }, fmtKcal: (k: number) => string): Insight[] {
  const keys = Array.from({ length: 7 }, (_, i) => addDays(today, -1 - i));
  const logged = keys.filter((k) => days[k]?.entries.length);
  if (logged.length < 2) return [];
  const out: Insight[] = [];
  const totals = logged.map((k) => ({ k, t: sumEntries(days[k].entries), kcalTarget: target.kcal + (days[k].boost ?? 0) }));
  const hitK = totals.filter((x) => x.t.kcal >= x.kcalTarget).length;
  const hitP = totals.filter((x) => x.t.protein >= target.protein).length;
  const n = totals.length;
  if (hitK === n && hitP === n) out.push({ tone: 'good', text: `You hit both targets on all ${n} days you logged. Keep it going.` });
  else {
    if (hitP < n / 2) out.push({ tone: 'tip', text: `Protein was hit on ${hitP} of ${n} days. A protein snack (yoghurt, eggs, paneer, a milk) between meals closes it.` });
    const gap = totals.reduce((a, x) => a + (x.kcalTarget - x.t.kcal), 0) / n;
    if (gap > 150) out.push({ tone: 'tip', text: `You're averaging ${fmtKcal(gap)} under your energy target. One extra snack a day covers that.` });
    else if (gap < -300) out.push({ tone: 'tip', text: `You're averaging ${fmtKcal(-gap)} over your energy target. That's fine on a bulk if your weight trend is on track.` });
    else out.push({ tone: 'good', text: `Energy is close to target on average (hit on ${hitK} of ${n} days).` });
  }
  // Lightest main meal, averaged over logged days.
  const mains = (['breakfast', 'lunch', 'dinner'] as const).map((m) => ({
    m,
    kcal: logged.reduce((a, k) => a + logSections(days[k].entries).filter((s) => s.moment === m).reduce((b, s) => b + s.kcal, 0), 0) / n,
  }));
  const light = mains.reduce((a, b) => (b.kcal < a.kcal ? b : a));
  if (light.kcal < target.kcal * 0.15) out.push({ tone: 'tip', text: `${SECTION_LABEL[light.m]} averages ${fmtKcal(light.kcal)}, your lightest meal. It's the easiest place to add more.` });
  const missed = 7 - logged.length;
  if (missed >= 2) out.push({ tone: 'tip', text: `${missed} of the last 7 days have nothing logged. Quick log on Today makes it a tap.` });
  const late = logged.reduce((a, k) => a + days[k].entries.filter((e) => new Date(e.at).getHours() >= 21).reduce((b, e) => b + sumEntries([e]).kcal, 0), 0);
  const all = totals.reduce((a, x) => a + x.t.kcal, 0);
  if (all > 0 && late / all > 0.3) out.push({ tone: 'tip', text: `About ${Math.round((late / all) * 100)}% of your energy comes after 9 pm. Moving some earlier can help sleep.` });
  return out.slice(0, 4);
}

/** Plain-text week summary for sharing: this week's stats, last week's for comparison, and weight change. */
export function weekSummary(title: string, w: WeekStats, last: WeekStats, kgChange: number | null, fmtKcal: (k: number) => string): string {
  const lines = [title];
  if (!w.logged) lines.push('Nothing logged yet this week.');
  else {
    lines.push(`Average ${fmtKcal(w.kcal ?? 0)} and ${Math.round(w.protein ?? 0)} g protein a day`);
    lines.push(`${w.logged} day${w.logged === 1 ? '' : 's'} logged, ${w.hit} on both targets`);
  }
  if (last.logged && last.kcal !== null) lines.push(`Last week: ${fmtKcal(last.kcal)}, ${Math.round(last.protein ?? 0)} g protein, ${last.hit} of ${last.logged} days on target`);
  if (kgChange !== null) lines.push(`Weight trend: ${kgChange >= 0 ? '+' : ''}${kgChange.toFixed(2)} kg a week`);
  return lines.join('\n');
}

export interface TopFood {
  name: string;
  /** Times logged in the window. */
  times: number;
  /** Total protein (g) or energy (kcal) from it. */
  value: number;
  /** Share of everything eaten in the window, 0 to 1. */
  share: number;
}

/**
 * The foods that gave you the most protein or energy over the last `lookback` days (today included),
 * grouped by name whatever the serving. Biggest first.
 */
export function topFoods(days: Record<string, DayLog>, today: string, by: 'protein' | 'kcal', lookback = 14, max = 5): TopFood[] {
  const m = new Map<string, TopFood>();
  let all = 0;
  for (let i = 0; i < lookback; i++) {
    for (const e of days[addDays(today, -i)]?.entries ?? []) {
      const v = sumEntries([e])[by];
      if (v <= 0) continue;
      all += v;
      const k = e.name.trim().toLowerCase();
      const f = m.get(k) ?? { name: e.name.trim(), times: 0, value: 0, share: 0 };
      f.times++;
      f.value += v;
      m.set(k, f);
    }
  }
  return [...m.values()]
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((f) => ({ ...f, share: f.value / all }));
}
