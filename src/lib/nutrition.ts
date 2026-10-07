import type { DayLog, Entry, Macros, Slot } from './types';

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

export const SLOTS: { id: Slot; label: string; time: string; from: number }[] = [
  { id: 'breakfast', label: 'Breakfast', time: '7:00', from: 0 },
  { id: 'recess', label: 'Recess', time: '10:50', from: 10 },
  { id: 'lunch', label: 'Lunch', time: '1:15', from: 12 },
  { id: 'arvo', label: 'After school', time: '3:40', from: 15 },
  { id: 'dinner', label: 'Dinner', time: '6:30', from: 18 },
  { id: 'supper', label: 'Before bed', time: '9:00', from: 21 },
];

export const slotLabel = (s: Slot) => SLOTS.find((x) => x.id === s)?.label ?? 'Imported';

/** The slot that fits the current time of day. */
export function slotForHour(h: number): Slot {
  let cur: Slot = 'breakfast';
  for (const s of SLOTS) if (h >= s.from) cur = s.id;
  return cur;
}
