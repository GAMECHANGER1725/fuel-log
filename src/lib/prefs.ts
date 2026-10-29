// Per-device display preferences (which Today cards show). Kept out of the main store and the gist,
// like the reminder flags, so each phone or laptop can have its own layout.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const CARDS = [
  ['macros', 'Carbs and fat'],
  ['quests', 'Daily quests'],
  ['gap', 'Close the gap'],
  ['water', 'Water'],
  ['quality', 'Food quality'],
  ['tips', 'Eating tips'],
] as const;
export type Card = (typeof CARDS)[number][0];

const IDS: readonly string[] = CARDS.map(([id]) => id);

/** Keep only known card ids, once each (saved prefs are untrusted). */
export const cleanHidden = (v: unknown): Card[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is Card => typeof x === 'string' && IDS.includes(x)))] : []);

export const toggleIn = (hidden: Card[], c: Card): Card[] => (hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c]);

interface Prefs {
  hidden: Card[];
  toggle: (c: Card) => void;
}

export const usePrefs = create<Prefs>()(
  persist((set) => ({ hidden: [], toggle: (c) => set((s) => ({ hidden: toggleIn(s.hidden, c) })) }), {
    name: 'fuel-log-prefs',
    partialize: (s) => ({ hidden: s.hidden }),
    merge: (p, cur) => ({ ...cur, hidden: cleanHidden((p as { hidden?: unknown } | undefined)?.hidden) }),
  }),
);
