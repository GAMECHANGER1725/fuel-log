// Per-device display preferences (which Today cards show, accent colour). Kept out of the main store and the gist,
// like the reminder flags, so each phone or laptop can have its own layout.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FOOD_SORTS, type FoodSort } from './foods';
import type { BadgeMode } from './nutrition';
import { NOTE_TAGS } from './meals';

export const CARDS = [
  ['train', 'Training day button'],
  ['quick', 'Quick log'],
  ['macros', 'Carbs and fat'],
  ['week', 'This week'],
  ['quests', 'Daily quests'],
  ['gap', 'Close the gap'],
  ['water', 'Water'],
  ['quality', 'Food quality'],
  ['note', 'Day note'],
  ['weigh', 'Weigh-in reminder'],
  ['tips', 'Eating tips'],
  ['qscan', 'Scan'],
  ['qsnap', 'Snap meal'],
  ['qnum', 'Numbers'],
  ['qagain', 'Meal again'],
  ['qusual', 'Usually now'],
] as const;
/** Quick log's action buttons, which can be hidden one by one. */
export const QUICK_ACTIONS = ['qscan', 'qsnap', 'qnum', 'qagain', 'qusual'] as const;
export type Card = (typeof CARDS)[number][0];

const IDS: readonly string[] = CARDS.map(([id]) => id);

/** Today's movable cards, in the default order ('log' can move but not hide; carbs and fat stay in the top card). */
export const ORDER = ['weigh', 'quick', 'week', 'quests', 'gap', 'log', 'note', 'water', 'quality', 'tips'] as const;
export type OrderCard = (typeof ORDER)[number];
export const ORDER_LABEL: Record<OrderCard, string> = {
  weigh: 'Weigh-in reminder',
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
export const BOOSTS = [200, 300, 500];
export const BOTTLES = [500, 600, 750, 1000];
/** Pages the app can open on. */
export const STARTS = [
  ['today', 'Today'],
  ['food', 'Add food'],
  ['progress', 'Progress'],
] as const;
export type Start = (typeof STARTS)[number][0];

/** Days between weigh-in reminders on Today. */
export const WEIGH_EVERY = [1, 3, 7, 14];

export const SIZES = [
  ['normal', 'Normal'],
  ['large', 'Large'],
  ['xl', 'Extra large'],
] as const;
export type TextSize = (typeof SIZES)[number][0];
export const cleanSize = (v: unknown): TextSize => SIZES.find(([id]) => id === v)?.[0] ?? 'normal';

export const MAX_TAGS = 12;

/** Note tags: trimmed, no commas (they separate tags in the note), 1 to 24 characters, once each ignoring case, at most MAX_TAGS. */
export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [...NOTE_TAGS];
  const out: string[] = [];
  for (const x of v) {
    const t = typeof x === 'string' ? x.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24) : '';
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, MAX_TAGS);
}

/** Put a search at the front of the recent list (once, ignoring case), keeping the newest `max`. */
export function pushSearch(list: string[], q: string, max = 6): string[] {
  const t = q.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (t.length < 2) return list;
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, max);
}

/** A shopping list line: one ingredient, with the amount each added recipe needs. */
export interface ShopItem {
  item: string;
  amounts: string[];
  done: boolean;
}

/**
 * Add recipe ingredients ([amount, item]) to the list; an item already there gets the amount added and is unticked.
 * A trailing note in brackets ("rolled oats (½ cup)") moves to the amount, so the same ingredient merges.
 */
export function addShopping(list: ShopItem[], lines: [amount: string, item: string][]): ShopItem[] {
  const out = list.map((x) => ({ ...x, amounts: [...x.amounts] }));
  for (const [rawAmount, raw] of lines) {
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(raw.trim());
    const item = (m ? m[1] : raw).trim().slice(0, 60);
    if (!item) continue;
    const amount = [rawAmount.trim(), m ? `(${m[2].trim()})` : ''].filter(Boolean).join(' ').slice(0, 30);
    const have = out.find((x) => x.item.toLowerCase() === item.toLowerCase());
    if (have) {
      have.amounts = [...have.amounts, amount].filter(Boolean).slice(-6);
      have.done = false;
    } else out.push({ item, amounts: [amount].filter(Boolean), done: false });
  }
  return out.slice(-60);
}

/** The unticked items as plain text for sharing, one per line. */
export const shoppingText = (list: ShopItem[]): string =>
  ['Shopping list', ...list.filter((x) => !x.done).map((x) => `- ${x.item}${x.amounts.length ? `: ${x.amounts.join(' + ')}` : ''}`)].join('\n');

/** Saved list (untrusted): known shape only. */
export const cleanShopping = (v: unknown): ShopItem[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is ShopItem => !!x && typeof x.item === 'string' && x.item.trim() !== '' && Array.isArray(x.amounts))
        .map((x) => ({ item: x.item.slice(0, 60), amounts: x.amounts.filter((a): a is string => typeof a === 'string').slice(-6), done: x.done === true }))
        .slice(-60)
    : [];

/** Whether to switch on today's training-day boost by itself: a chosen weekday (0 = Sunday), not already done today, no boost yet. */
export const autoBoostDue = (today: string, weekday: number, trainDays: number[], lastAuto: string, hasBoost: boolean): boolean =>
  trainDays.includes(weekday) && lastAuto !== today && !hasBoost;

export const cleanSort = (v: unknown): FoodSort => FOOD_SORTS.find(([id]) => id === v)?.[0] ?? 'match';

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
  /** Extra kcal the Training day button adds. */
  boostKcal: number;
  setBoostKcal: (k: number) => void;
  /** Size of the water card's bottle button, in ml. */
  bottleMl: number;
  setBottleMl: (ml: number) => void;
  /** What the home-screen icon's badge shows. */
  badge: BadgeMode;
  setBadge: (b: BadgeMode) => void;
  /** Weekdays (0 = Sunday) that get the training-day boost by themselves, and the last day it was switched on that way. */
  trainDays: number[];
  setTrainDays: (d: number[]) => void;
  lastAutoBoost: string;
  setLastAutoBoost: (k: string) => void;
  /** Days after a weigh-in before Today asks for the next. */
  weighEvery: number;
  setWeighEvery: (d: number) => void;
  /** Recipe ingredients to buy. ponytail: per device, not synced. */
  shopping: ShopItem[];
  setShopping: (l: ShopItem[]) => void;
  /** Page the app opens on when launched without one (e.g. from the home-screen icon). */
  start: Start;
  setStart: (s: Start) => void;
  /** One-tap tags under the day note. ponytail: per device, so a phone and laptop can differ. */
  tags: string[];
  setTags: (t: string[]) => void;
  /** Searches on Add food that led to a food, newest first. */
  searches: string[];
  addSearch: (q: string) => void;
  clearSearches: () => void;
  /** Lower-case names Close the gap shouldn't suggest. ponytail: per device, not synced. */
  noSuggest: string[];
  toggleSuggest: (name: string) => void;
  /** How Add food sorts search and browse results. */
  foodSort: FoodSort;
  setFoodSort: (s: FoodSort) => void;
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
      boostKcal: 300,
      noSuggest: [],
      bottleMl: 500,
      badge: 'off',
      weighEvery: 7,
      trainDays: [],
      setTrainDays: (trainDays) => set({ trainDays }),
      lastAutoBoost: '',
      setLastAutoBoost: (lastAutoBoost) => set({ lastAutoBoost }),
      start: 'today',
      shopping: [],
      setShopping: (shopping) => set({ shopping }),
      setStart: (start) => set({ start }),
      setWeighEvery: (weighEvery) => set({ weighEvery }),
      tags: [...NOTE_TAGS],
      searches: [],
      addSearch: (q) => set((s) => ({ searches: pushSearch(s.searches, q) })),
      clearSearches: () => set({ searches: [] }),
      setTags: (tags) => set({ tags: cleanTags(tags) }),
      setBadge: (badge) => set({ badge }),
      foodSort: 'match',
      setFoodSort: (foodSort) => set({ foodSort }),
      setBottleMl: (bottleMl) => set({ bottleMl }),
      toggleSuggest: (name) =>
        set((s) => {
          const n = name.trim().toLowerCase();
          return { noSuggest: s.noSuggest.includes(n) ? s.noSuggest.filter((x) => x !== n) : [...s.noSuggest, n].slice(-200) };
        }),
      setBoostKcal: (boostKcal) => set({ boostKcal }),
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
      partialize: (s) => ({ hidden: s.hidden, accent: s.accent, size: s.size, newsSeen: s.newsSeen, order: s.order, ring: s.ring, boostKcal: s.boostKcal, noSuggest: s.noSuggest, bottleMl: s.bottleMl, foodSort: s.foodSort, badge: s.badge, tags: s.tags, searches: s.searches, weighEvery: s.weighEvery, start: s.start, shopping: s.shopping, trainDays: s.trainDays, lastAutoBoost: s.lastAutoBoost }),
      merge: (p, cur) => {
        const saved = (p ?? {}) as { hidden?: unknown; accent?: unknown; size?: unknown; newsSeen?: unknown; order?: unknown; ring?: unknown; boostKcal?: unknown; noSuggest?: unknown; bottleMl?: unknown; foodSort?: unknown; badge?: unknown; tags?: unknown; searches?: unknown; weighEvery?: unknown; start?: unknown; shopping?: unknown; trainDays?: unknown; lastAutoBoost?: unknown };
        return {
          ...cur,
          hidden: cleanHidden(saved.hidden),
          accent: cleanAccent(saved.accent),
          size: cleanSize(saved.size),
          newsSeen: typeof saved.newsSeen === 'string' ? saved.newsSeen.slice(0, 20) : '',
          order: cleanOrder(saved.order),
          ring: saved.ring === 'eaten' ? 'eaten' : 'left',
          boostKcal: BOOSTS.includes(saved.boostKcal as number) ? (saved.boostKcal as number) : 300,
          foodSort: cleanSort(saved.foodSort),
          tags: cleanTags(saved.tags),
          shopping: cleanShopping(saved.shopping),
          trainDays: Array.isArray(saved.trainDays) ? [...new Set(saved.trainDays.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))] : [],
          lastAutoBoost: typeof saved.lastAutoBoost === 'string' ? saved.lastAutoBoost.slice(0, 10) : '',
          start: STARTS.find(([id]) => id === saved.start)?.[0] ?? 'today',
          weighEvery: WEIGH_EVERY.includes(saved.weighEvery as number) ? (saved.weighEvery as number) : 7,
          searches: Array.isArray(saved.searches) ? saved.searches.filter((x): x is string => typeof x === 'string').reduceRight((a: string[], x) => pushSearch(a, x), []) : [],
          badge: saved.badge === 'protein' || saved.badge === 'kcal' ? saved.badge : 'off',
          bottleMl: BOTTLES.includes(saved.bottleMl as number) ? (saved.bottleMl as number) : 500,
          noSuggest: Array.isArray(saved.noSuggest) ? saved.noSuggest.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 80)).slice(-200) : [],
        };
      },
    },
  ),
);
