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

/** Time an entry was logged, e.g. "7:20 am". */
export const timeOf = (ms: number) => new Date(ms).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
