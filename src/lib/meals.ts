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
