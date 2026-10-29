// App state: one zustand store saved to localStorage on this device only.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppData, DayLog, Entry, Food, Macros, Profile, Settings } from './types';
import type { Recipe } from './recipes';
import { DEFAULT_DATA, normalize } from './backup';
import { aiOf } from './ai';
import { todayKey } from './dates';
import { applyDoc, type SyncDoc } from './syncdoc';

const emptyDay = (): DayLog => ({ entries: [], water: 0, checks: {} });
/** Settings that stay on one device and so don't count as a change worth syncing. */
export const LOCAL_ONLY = ['aiKey', 'aiModel', 'geminiKey', 'geminiModel', 'aiFirst', 'theme'] as const satisfies readonly (keyof Settings)[];
const allIds = (days: Record<string, DayLog>) => Object.values(days).flatMap((d) => d.entries.map((e) => e.id));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export type NewEntry = Omit<Entry, 'id' | 'at'>;

interface Actions {
  /** `at` = when it was eaten (epoch ms), now if left out. Returns the new entry ids (for undo). */
  addEntries: (date: string, items: NewEntry[], foods?: Food[], at?: number) => string[];
  updateEntry: (date: string, id: string, patch: Partial<Entry>) => void;
  removeEntry: (date: string, id: string) => void;
  /** Put a removed entry back (undo). It gets a new id, since the old one stays in `tomb`. */
  restoreEntry: (date: string, e: Entry) => void;
  /** Move an entry to another day (and time). Like delete + add, so sync sees the change on both days. */
  moveEntry: (from: string, to: string, e: Entry) => void;
  copyDay: (from: string, to: string) => number;
  setWater: (date: string, glasses: number) => void;
  toggleCheck: (date: string, key: string) => void;
  /** Set the day's training-day boost in kcal; 0 removes it. */
  setBoost: (date: string, kcal: number) => void;
  /** Set the day's note; empty removes it. */
  setNote: (date: string, note: string) => void;
  addWeighIn: (date: string, kg: number) => void;
  removeWeighIn: (date: string) => void;
  toggleFavourite: (f: Food) => void;
  /** Change a favourite's name, serving or numbers (synced with the favourites block). */
  updateFavourite: (id: string, patch: Partial<Food>) => void;
  /** Drop a food from Recent (per device, so no sync stamp). */
  removeRecent: (name: string) => void;
  /** Save your version of a recipe, or null to go back to the original. */
  setRecipeEdit: (name: string, r: Recipe | null) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setProfile: (patch: Partial<Profile>) => void;
  setTargets: (t: Macros) => void;
  dismissNudge: (week: string) => void;
  markSeen: (level: number, badges: string[]) => void;
  markExported: () => void;
  applySynced: (doc: SyncDoc) => void;
  replaceAll: (d: AppData) => void;
  reset: () => void;
}

export const useStore = create<AppData & Actions>()(
  persist(
    (set, get) => {
      const editDay = (date: string, fn: (d: DayLog) => DayLog) =>
        set((s) => ({ days: { ...s.days, [date]: fn(s.days[date] ?? emptyDay()) } }));

      return {
        ...DEFAULT_DATA,

        addEntries: (date, items, foods = [], at) => {
          const now = Date.now();
          // A picked time can be later than now, so stamp the edit time too: sync compares `upd ?? at`.
          const stamp = at == null ? {} : { upd: now };
          const added = items.map((e, i) => ({ ...e, id: uid(), at: (at ?? now) + i, ...stamp }));
          editDay(date, (d) => ({ ...d, entries: [...d.entries, ...added] }));
          if (foods.length)
            set((s) => {
              const names = new Set(foods.map((f) => f.name.toLowerCase()));
              return { recents: [...foods, ...s.recents.filter((r) => !names.has(r.name.toLowerCase()))].slice(0, 20) };
            });
          return added.map((e) => e.id);
        },
        updateEntry: (date, id, patch) => editDay(date, (d) => ({ ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch, upd: Date.now() } : e)) })),
        removeEntry: (date, id) => {
          editDay(date, (d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
          set((s) => ({ tomb: { ...s.tomb, [id]: Date.now() } }));
        },
        restoreEntry: (date, e) => editDay(date, (d) => ({ ...d, entries: [...d.entries, { ...e, id: uid(), upd: Date.now() }] })),
        moveEntry: (from, to, e) => {
          get().removeEntry(from, e.id);
          get().restoreEntry(to, e);
        },
        copyDay: (from, to) => {
          const src = get().days[from]?.entries ?? [];
          if (!src.length) return 0;
          const now = Date.now();
          editDay(to, (d) => ({ ...d, entries: [...d.entries, ...src.map((e, i) => ({ ...e, id: uid(), at: now + i }))] }));
          return src.length;
        },
        setWater: (date, glasses) => editDay(date, (d) => ({ ...d, water: Math.max(0, Math.min(40, glasses)), m: Date.now() })),
        setBoost: (date, kcal) =>
          editDay(date, (d) => {
            const { boost: _old, ...rest } = d;
            const b = Math.round(Math.max(0, Math.min(1500, kcal)));
            return { ...rest, ...(b ? { boost: b } : {}), m: Date.now() };
          }),
        setNote: (date, note) =>
          editDay(date, (d) => {
            const { note: _old, ...rest } = d;
            const t = note.trim().slice(0, 200);
            return { ...rest, ...(t ? { note: t } : {}), m: Date.now() };
          }),
        toggleCheck: (date, key) => editDay(date, (d) => ({ ...d, checks: { ...d.checks, [key]: !d.checks[key] }, m: Date.now() })),
        addWeighIn: (date, kg) =>
          set((s) => ({
            weighIns: [...s.weighIns.filter((w) => w.date !== date), { date, kg }].sort((a, b) => (a.date < b.date ? -1 : 1)),
            profile: date >= (s.weighIns[s.weighIns.length - 1]?.date ?? '') ? { ...s.profile, weightKg: kg } : s.profile,
            mod: Date.now(),
          })),
        removeWeighIn: (date) => set((s) => ({ weighIns: s.weighIns.filter((w) => w.date !== date), mod: Date.now() })),
        toggleFavourite: (f) =>
          set((s) => {
            const has = s.favourites.some((x) => x.name.toLowerCase() === f.name.toLowerCase());
            return {
              favourites: has
                ? s.favourites.filter((x) => x.name.toLowerCase() !== f.name.toLowerCase())
                : [{ ...f, id: f.id.startsWith('fav-') ? f.id : `fav-${uid()}` }, ...s.favourites],
              mod: Date.now(),
            };
          }),
        updateFavourite: (id, patch) => set((s) => ({ favourites: s.favourites.map((f) => (f.id === id ? { ...f, ...patch } : f)), mod: Date.now() })),
        removeRecent: (name) => set((s) => ({ recents: s.recents.filter((r) => r.name.toLowerCase() !== name.toLowerCase()) })),
        setRecipeEdit: (name, r) =>
          set((s) => {
            const { [name.toLowerCase()]: _old, ...rest } = s.recipeEdits;
            return { recipeEdits: r ? { ...rest, [name.toLowerCase()]: r } : rest, mod: Date.now() };
          }),
        setSettings: (patch) =>
          set((s) => ({
            settings: { ...s.settings, ...patch },
            mod: Object.keys(patch).some((k) => !(LOCAL_ONLY as readonly string[]).includes(k)) ? Date.now() : s.mod,
          })),
        setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch }, mod: Date.now() })),
        setTargets: (t) =>
          set((s) => ({
            settings: { ...s.settings, targets: t },
            targetChanges:
              t.kcal === s.settings.targets.kcal ? s.targetChanges : [...s.targetChanges, { date: todayKey(), from: s.settings.targets.kcal, to: t.kcal }],
            mod: Date.now(),
          })),
        dismissNudge: (week) => set({ nudgeDismissed: week, mod: Date.now() }),
        markSeen: (level, badges) => set({ seen: { level, badges } }),
        markExported: () => set({ lastExport: todayKey() }),
        applySynced: (doc) => set((s) => applyDoc(dataOf(s), doc)),
        // Replacing or clearing leaves tombstones for what was here, so with sync on it is removed on other devices too.
        replaceAll: (d) =>
          set((s) => {
            const keep = new Set(allIds(d.days));
            const gone = Object.fromEntries(allIds(s.days).filter((id) => !keep.has(id)).map((id) => [id, Date.now()]));
            return { ...d, tomb: { ...s.tomb, ...d.tomb, ...gone }, mod: Date.now() };
          }),
        reset: () =>
          set((s) => ({
            ...DEFAULT_DATA,
            settings: { ...DEFAULT_DATA.settings, ...aiOf(s.settings) },
            tomb: { ...s.tomb, ...Object.fromEntries(allIds(s.days).map((id) => [id, Date.now()])) },
            mod: Date.now(),
          })),
      };
    },
    {
      name: 'fuel-log-v3',
      version: 3,
      partialize: (s) => dataOf(s),
      // A save from the old version where setup was never finished holds placeholder stats: drop it.
      merge: (persisted, current) =>
        persisted && (persisted as { onboarded?: boolean }).onboarded !== false ? { ...current, ...normalize(persisted) } : current,
    },
  ),
);

/** Plain data snapshot (no actions), e.g. for export and the game engine. */
export const dataOf = (s: AppData & Partial<Actions>): AppData => {
  const { v, profile, settings, days, weighIns, favourites, recipeEdits, recents, targetChanges, nudgeDismissed, lastExport, seen, tomb, mod } = s;
  return { v, profile, settings, days, weighIns, favourites, recipeEdits, recents, targetChanges, nudgeDismissed, lastExport, seen, tomb, mod };
};
