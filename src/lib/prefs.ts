// Per-device display preferences (which Today cards show, accent colour). Kept out of the main store and the gist,
// like the reminder flags, so each phone or laptop can have its own layout.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const CARDS = [
  ['quick', 'Quick log'],
  ['macros', 'Carbs and fat'],
  ['week', 'This week'],
  ['quests', 'Daily quests'],
  ['gap', 'Close the gap'],
  ['water', 'Water'],
  ['quality', 'Food quality'],
  ['note', 'Day note'],
  ['tips', 'Eating tips'],
] as const;
export type Card = (typeof CARDS)[number][0];

const IDS: readonly string[] = CARDS.map(([id]) => id);

/** Today's movable cards, in the default order ('log' can move but not hide; carbs and fat stay in the top card). */
export const ORDER = ['quick', 'week', 'quests', 'gap', 'log', 'note', 'water', 'quality', 'tips'] as const;
export type OrderCard = (typeof ORDER)[number];
export const ORDER_LABEL: Record<OrderCard, string> = {
  quick: 'Quick log',
  week: 'This week',
  quests: 'Daily quests',
  gap: 'Close the gap',
  log: 'Log',
  note: 'Day note',
  water: 'Water',
  quality: 'Food quality',
  tips: 'Eating tips',
};

/** Known cards once each, in the saved order; any missing (e.g. added later) go where they sit by default. */
export function cleanOrder(v: unknown): OrderCard[] {
  const saved = Array.isArray(v) ? [...new Set(v.filter((x): x is OrderCard => (ORDER as readonly unknown[]).includes(x)))] : [];
  const out = [...saved];
  ORDER.forEach((id, i) => {
    if (out.includes(id)) return;
    const before = ORDER.slice(0, i).reverse().find((x) => out.includes(x));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id);
  });
  return out;
}

/** Move a card one place up (-1) or down (+1). */
export function moveIn(order: OrderCard[], id: OrderCard, dir: -1 | 1): OrderCard[] {
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const out = [...order];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Accent colours; the swatch is the dark-theme shade (styles.css has both). */
export const ACCENTS = [
  ['ember', 'Ember', '#ff8a4c'],
  ['rose', 'Rose', '#ff7aa8'],
  ['grape', 'Grape', '#c29bff'],
  ['leaf', 'Leaf', '#8fdc6e'],
  ['gold', 'Gold', '#f5c542'],
] as const;
export type Accent = (typeof ACCENTS)[number][0];
export const SIZES = [
  ['normal', 'Normal'],
  ['large', 'Large'],
  ['xl', 'Extra large'],
] as const;
export type TextSize = (typeof SIZES)[number][0];
export const cleanSize = (v: unknown): TextSize => SIZES.find(([id]) => id === v)?.[0] ?? 'normal';

export const cleanAccent = (v: unknown): Accent => ACCENTS.find(([id]) => id === v)?.[0] ?? 'ember';

/** Keep only known card ids, once each (saved prefs are untrusted). */
export const cleanHidden = (v: unknown): Card[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is Card => typeof x === 'string' && IDS.includes(x)))] : []);

export const toggleIn = (hidden: Card[], c: Card): Card[] => (hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c]);

interface Prefs {
  hidden: Card[];
  accent: Accent;
  size: TextSize;
  /** Id of the last What's new sheet seen on this device. */
  newsSeen: string;
  order: OrderCard[];
  /** What the ring's centre shows: energy still to eat, or eaten so far. */
  ring: 'left' | 'eaten';
  toggle: (c: Card) => void;
  flipRing: () => void;
  move: (id: OrderCard, dir: -1 | 1) => void;
  resetOrder: () => void;
  markNews: (id: string) => void;
  setAccent: (a: Accent) => void;
  setSize: (s: TextSize) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      hidden: [],
      accent: 'ember',
      size: 'normal',
      newsSeen: '',
      order: [...ORDER],
      ring: 'left',
      flipRing: () => set((s) => ({ ring: s.ring === 'left' ? 'eaten' : 'left' })),
      move: (id, dir) => set((s) => ({ order: moveIn(s.order, id, dir) })),
      resetOrder: () => set({ order: [...ORDER] }),
      markNews: (newsSeen) => set({ newsSeen }),
      toggle: (c) => set((s) => ({ hidden: toggleIn(s.hidden, c) })),
      setAccent: (accent) => set({ accent }),
      setSize: (size) => set({ size }),
    }),
    {
      name: 'fuel-log-prefs',
      partialize: (s) => ({ hidden: s.hidden, accent: s.accent, size: s.size, newsSeen: s.newsSeen, order: s.order, ring: s.ring }),
      merge: (p, cur) => {
        const saved = (p ?? {}) as { hidden?: unknown; accent?: unknown; size?: unknown; newsSeen?: unknown; order?: unknown; ring?: unknown };
        return {
          ...cur,
          hidden: cleanHidden(saved.hidden),
          accent: cleanAccent(saved.accent),
          size: cleanSize(saved.size),
          newsSeen: typeof saved.newsSeen === 'string' ? saved.newsSeen.slice(0, 20) : '',
          order: cleanOrder(saved.order),
          ring: saved.ring === 'eaten' ? 'eaten' : 'left',
        };
      },
    },
  ),
);
