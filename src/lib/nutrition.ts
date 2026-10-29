import type { DayLog, Entry, Macros } from './types';

export const KJ = 4.184;
export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const r1 = (n: number) => Math.round(n * 10) / 10;

export const scale = (m: Macros, k: number): Macros => ({
  kcal: m.kcal * k,
  protein: m.protein * k,
  carbs: m.carbs * k,
  fat: m.fat * k,
});

export const add = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fat: a.fat + b.fat,
});

export const roundMacros = (m: Macros): Macros => ({
  kcal: Math.round(m.kcal),
  protein: r1(m.protein),
  carbs: r1(m.carbs),
  fat: r1(m.fat),
});

export const entryMacros = (e: Entry): Macros => scale(e.base, e.qty);

export const sumEntries = (entries: Entry[]): Macros => entries.reduce((t, e) => add(t, entryMacros(e)), ZERO);

export const dayTotals = (d: DayLog | undefined): Macros => (d ? sumEntries(d.entries) : ZERO);

/** Macros for a number of grams, from per-100 g values. */
export const forGrams = (per100: Macros, grams: number): Macros => roundMacros(scale(per100, grams / 100));

/** Display energy in the user's unit. */
export function energy(kcal: number, unit: 'kcal' | 'kJ'): string {
  const v = unit === 'kJ' ? kcal * KJ : kcal;
  return Math.round(v).toLocaleString('en-AU');
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-AU');

/** Eating window for pace: the day's target spread evenly from 7 am to 9 pm. */
const PACE_FROM = 7;
const PACE_TO = 21;

/**
 * How far ahead (+) or behind (−) of pace you are, in kcal, at `hour` (e.g. 13.5). Null outside
 * 9 am to 9 pm, when the comparison means little.
 * ponytail: a straight line; it doesn't know you eat a big dinner. Good enough as a nudge.
 */
export function paceGap(eaten: number, target: number, hour: number): number | null {
  if (hour < 9 || hour >= PACE_TO) return null;
  return eaten - (target * (hour - PACE_FROM)) / (PACE_TO - PACE_FROM);
}

/** "3 h 20 min" since the latest entry eaten before `now`, or null if none. */
export function sinceLast(entries: Entry[], now: number): string | null {
  const last = Math.max(-Infinity, ...entries.map((e) => e.at).filter((at) => at <= now));
  if (!Number.isFinite(last)) return null;
  const m = Math.floor((now - last) / 60_000);
  if (m < 1) return 'just now';
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

/** Time an entry was logged, e.g. "7:20 am". */
export const timeOf = (ms: number) => new Date(ms).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
