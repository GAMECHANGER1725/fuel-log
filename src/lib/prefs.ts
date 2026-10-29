// Per-device display preferences (which Today cards show, accent colour). Kept out of the main store and the gist,
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

/** Accent colours; the swatch is the dark-theme shade (styles.css has both). */
export const ACCENTS = [
  ['ember', 'Ember', '#ff8a4c'],
  ['rose', 'Rose', '#ff7aa8'],
  ['grape', 'Grape', '#c29bff'],
  ['leaf', 'Leaf', '#8fdc6e'],
  ['gold', 'Gold', '#f5c542'],
] as const;
export type Accent = (typeof ACCENTS)[number][0];
export const cleanAccent = (v: unknown): Accent => ACCENTS.find(([id]) => id === v)?.[0] ?? 'ember';

/** Keep only known card ids, once each (saved prefs are untrusted). */
export const cleanHidden = (v: unknown): Card[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is Card => typeof x === 'string' && IDS.includes(x)))] : []);

export const toggleIn = (hidden: Card[], c: Card): Card[] => (hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c]);

interface Prefs {
  hidden: Card[];
  accent: Accent;
  toggle: (c: Card) => void;
  setAccent: (a: Accent) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      hidden: [],
      accent: 'ember',
      toggle: (c) => set((s) => ({ hidden: toggleIn(s.hidden, c) })),
      setAccent: (accent) => set({ accent }),
    }),
    {
      name: 'fuel-log-prefs',
      partialize: (s) => ({ hidden: s.hidden, accent: s.accent }),
      merge: (p, cur) => {
        const saved = (p ?? {}) as { hidden?: unknown; accent?: unknown };
        return { ...cur, hidden: cleanHidden(saved.hidden), accent: cleanAccent(saved.accent) };
      },
    },
  ),
);
