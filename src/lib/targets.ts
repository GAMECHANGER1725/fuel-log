// Starting targets, weight trend and the weekly calorie nudge.

import type { AppData, Macros, Profile, WeighIn } from './types';
import { addDays, daysBetween, weekStart } from './dates';
import { dayTotals } from './nutrition';

const ACTIVITY = { light: 1.5, moderate: 1.65, high: 1.8 } as const;
const SURPLUS = 350;

/** Mifflin-St Jeor BMR × activity + a lean-bulk surplus. Protein ~2 g/kg, fat 25% of energy. */
export function suggestTargets(p: Profile): Macros {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const kcal = Math.round((bmr * ACTIVITY[p.activity] + SURPLUS) / 50) * 50;
  const protein = Math.round((2 * p.weightKg) / 5) * 5;
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

/** Re-split carbs and fat for a new energy target, keeping protein. */
export function withKcal(t: Macros, kcal: number): Macros {
  const fat = Math.round((kcal * 0.25) / 9);
  return { kcal, protein: t.protein, fat, carbs: Math.max(0, Math.round((kcal - t.protein * 4 - fat * 9) / 4)) };
}

const sorted = (w: WeighIn[]) => [...w].sort((a, b) => (a.date < b.date ? -1 : 1));

/** Each weigh-in smoothed as the average of all weigh-ins in the 7 days up to it. */
export function trendLine(weighIns: WeighIn[]): { date: string; kg: number; trend: number }[] {
  const w = sorted(weighIns);
  return w.map((x) => {
    const win = w.filter((y) => y.date <= x.date && daysBetween(y.date, x.date) < 7);
    return { ...x, trend: win.reduce((s, y) => s + y.kg, 0) / win.length };
  });
}

/**
 * Weight change in kg per week, up to `upto`.
 * Uses a least-squares line over the last 28 days when there are 3+ weigh-ins spanning 10+ days,
 * otherwise the change between the latest weigh-in and one 7+ days earlier.
 */
export function weeklyRate(weighIns: WeighIn[], upto: string): number | null {
  const w = sorted(weighIns).filter((x) => x.date <= upto);
  if (w.length < 2) return null;
  const last = w[w.length - 1];
  const recent = w.filter((x) => daysBetween(x.date, last.date) <= 28);
  if (recent.length >= 3 && daysBetween(recent[0].date, last.date) >= 10) {
    const xs = recent.map((x) => daysBetween(recent[0].date, x.date));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = recent.reduce((a, b) => a + b.kg, 0) / recent.length;
    let num = 0;
    let den = 0;
    xs.forEach((x, i) => {
      num += (x - mx) * (recent[i].kg - my);
      den += (x - mx) ** 2;
    });
    return den ? (num / den) * 7 : null;
  }
  const base = [...w].reverse().find((x) => daysBetween(x.date, last.date) >= 7);
  return base ? ((last.kg - base.kg) / daysBetween(base.date, last.date)) * 7 : null;
}

export interface Nudge {
  kind: 'raise' | 'lower' | 'eat-more';
  rate: number;
  to: number;
  message: string;
}

/** The weekly check-in suggestion, or null when things are on track or there isn't enough data. */
export function weeklyNudge(d: AppData, today: string): Nudge | null {
  if (d.nudgeDismissed === weekStart(today)) return null;
  const lastChange = d.targetChanges[d.targetChanges.length - 1];
  if (lastChange && daysBetween(lastChange.date, today) < 14) return null;
  const rate = weeklyRate(d.weighIns, today);
  if (rate === null) return null;
  const { kcal } = d.settings.targets;
  const { gainLow, gainHigh } = d.settings;
  const r = Math.round(rate * 100) / 100;

  // Only blame the target if the target was actually eaten.
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, -i - 1)).map((k) => d.days[k]).filter((x) => x?.entries.length);
  const avg = week.length ? week.reduce((s, x) => s + dayTotals(x).kcal, 0) / week.length : 0;

  if (rate < gainLow) {
    if (week.length >= 4 && avg < kcal * 0.9)
      return { kind: 'eat-more', rate: r, to: kcal, message: `You're gaining ${r} kg a week, under your ${gainLow}–${gainHigh} range, but you averaged ${Math.round(avg).toLocaleString('en-AU')} kcal. Hit your ${kcal.toLocaleString('en-AU')} first before raising it.` };
    const to = kcal + 200;
    return { kind: 'raise', rate: r, to, message: `You're gaining ${r} kg a week, under your ${gainLow}–${gainHigh} range. Bump your target to ${to.toLocaleString('en-AU')} kcal?` };
  }
  if (rate > gainHigh * 1.4) {
    const to = kcal - 150;
    return { kind: 'lower', rate: r, to, message: `You're gaining ${r} kg a week, faster than planned. Ease back to ${to.toLocaleString('en-AU')} kcal?` };
  }
  return null;
}

/** Date you'd reach the goal weight at the current rate, or null. */
export function projectedDate(currentKg: number, goalKg: number | null, rate: number | null, today: string): string | null {
  if (!goalKg || !rate || rate <= 0 || goalKg <= currentKg) return null;
  const weeks = (goalKg - currentKg) / rate;
  return weeks > 260 ? null : addDays(today, Math.round(weeks * 7));
}
