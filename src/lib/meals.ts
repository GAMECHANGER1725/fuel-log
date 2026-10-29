// "Usual meals": groups of foods you tend to log together, found from the log itself (nothing stored).
// A group is two or more entries on one day each within `gapMin` minutes of the one before.

import type { DayLog, Entry } from './types';
import { addDays } from './dates';
import { sumEntries } from './nutrition';

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
