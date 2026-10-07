// The document stored in the private gist, and how two copies of it merge.
//
// Merge rules (so two devices can both log offline and nothing is lost):
//  - Food entries: union by id. A deleted id is kept in `tomb` so it stays deleted everywhere.
//    If both sides have the same id, the more recently edited copy wins.
//  - Water and food-quality checks: per day, the side with the newer `m` timestamp wins.
//  - Profile, targets, weigh-ins, favourites: the whole block from whichever device changed it last wins.
//  - Never synced (stay per device): Gemini key and model, theme, recents, backup date, celebration state.

import type { AppData, DayLog, Entry, Food, Profile, Settings, TargetChange, WeighIn } from './types';
import { normalize, DEFAULT_DATA } from './backup';

export interface SmallData {
  profile: Profile;
  settings: Omit<Settings, 'geminiKey' | 'geminiModel' | 'theme'>;
  weighIns: WeighIn[];
  favourites: Food[];
  targetChanges: TargetChange[];
  nudgeDismissed: string | null;
}

export interface SyncDoc {
  v: 1;
  days: Record<string, DayLog>;
  tomb: Record<string, number>;
  mod: number;
  small: SmallData;
}

/** JSON with object keys sorted, so equal data compares equal whatever order the fields were built in. */
const stable = (v: unknown) =>
  JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) : val));

const TOMB_KEEP_MS = 120 * 86_400_000;

const stamp = (e: Entry) => e.upd ?? e.at;

/** Build a canonical doc (fixed key order, sorted) so two equal docs stringify identically. */
function canon(doc: { days: Record<string, DayLog>; tomb: Record<string, number>; mod: number; small: SmallData }): SyncDoc {
  const days: Record<string, DayLog> = {};
  for (const k of Object.keys(doc.days).sort()) {
    const d = doc.days[k];
    const entries = [...d.entries].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    const out: DayLog = { entries, water: d.water, checks: Object.fromEntries(Object.entries(d.checks).sort()) };
    if (d.m) out.m = d.m;
    days[k] = out;
  }
  const tomb = Object.fromEntries(Object.entries(doc.tomb).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { v: 1, days, tomb, mod: doc.mod, small: doc.small };
}

export function toDoc(d: AppData): SyncDoc {
  const { geminiKey: _k, geminiModel: _m, theme: _t, ...settings } = d.settings;
  return canon({
    days: d.days,
    tomb: d.tomb,
    mod: d.mod,
    small: { profile: d.profile, settings, weighIns: d.weighIns, favourites: d.favourites, targetChanges: d.targetChanges, nudgeDismissed: d.nudgeDismissed },
  });
}

/** Read a doc from untrusted text (the gist could have been edited by hand). Throws if it isn't one. */
export function parseDoc(text: string): SyncDoc {
  const raw = JSON.parse(text) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || typeof raw.days !== 'object') throw new Error('Not a Fuel Log sync file');
  const small = (raw.small ?? {}) as Record<string, unknown>;
  const clean = normalize({
    ...small,
    settings: { ...DEFAULT_DATA.settings, ...(small.settings as object) },
    days: raw.days,
    tomb: raw.tomb,
    mod: raw.mod,
  });
  return toDoc(clean);
}

function mergeDay(a: DayLog | undefined, b: DayLog | undefined, tomb: Record<string, number>): DayLog {
  const base = (a ?? b) as DayLog;
  const byId = new Map<string, Entry>();
  for (const e of [...(a?.entries ?? []), ...(b?.entries ?? [])]) {
    if (tomb[e.id] !== undefined) continue;
    const have = byId.get(e.id);
    if (!have || stamp(e) > stamp(have)) byId.set(e.id, e);
  }
  const entries = [...byId.values()];
  if (!a || !b) return { ...base, entries };
  // Water + checks: newer change wins; with no timestamps (old data) take the most complete.
  const am = a.m ?? 0;
  const bm = b.m ?? 0;
  let water: number;
  let checks: Record<string, boolean>;
  let m: number | undefined;
  if (am !== bm) {
    const w = am > bm ? a : b;
    water = w.water;
    checks = w.checks;
    m = w.m;
  } else {
    water = Math.max(a.water, b.water);
    checks = { ...a.checks };
    for (const [k, v] of Object.entries(b.checks)) checks[k] = checks[k] || v;
    m = a.m;
  }
  return { entries, water, checks, m };
}

const sortBy = <T>(xs: T[], key: (x: T) => string) => [...xs].sort((p, q) => (key(p) + stable(p) < key(q) + stable(q) ? -1 : 1));
/** Combine two lists, one item per key. Sorted first, so the result doesn't depend on which side is "a". */
const union = <T>(xs: T[], key: (x: T) => string) => {
  const seen = new Set<string>();
  return sortBy(xs, key).filter((x) => !seen.has(key(x)) && !!seen.add(key(x)));
};
const scalars = (x: SmallData) => ({ profile: x.profile, settings: x.settings });
const isDefault = (x: SmallData) => stable(scalars(x)) === stable(scalars(toDoc(DEFAULT_DATA).small));

/**
 * Newest change wins. Equal stamps mean neither side has changed anything since syncing began
 * (e.g. both are old data), so combine instead of dropping one side.
 */
function mergeSmall(a: SyncDoc, b: SyncDoc): SmallData {
  if (a.mod !== b.mod) return a.mod > b.mod ? a.small : b.small;
  const x = a.small;
  const y = b.small;
  const base = isDefault(x) ? y : isDefault(y) ? x : stable(scalars(x)) >= stable(scalars(y)) ? x : y;
  return {
    profile: base.profile,
    settings: base.settings,
    weighIns: union([...x.weighIns, ...y.weighIns], (w) => w.date),
    favourites: union([...x.favourites, ...y.favourites], (f) => f.name.toLowerCase()),
    targetChanges: union([...x.targetChanges, ...y.targetChanges], (t) => `${t.date}|${t.from}|${t.to}`),
    nudgeDismissed: [x.nudgeDismissed, y.nudgeDismissed].filter((v): v is string => !!v).sort().pop() ?? null,
  };
}

export function mergeDocs(a: SyncDoc, b: SyncDoc, now = Date.now()): SyncDoc {
  const tomb: Record<string, number> = {};
  for (const [k, v] of Object.entries({ ...b.tomb, ...a.tomb })) {
    const t = Math.max(a.tomb[k] ?? 0, b.tomb[k] ?? 0, v);
    if (now - t < TOMB_KEEP_MS) tomb[k] = t;
  }
  const days: Record<string, DayLog> = {};
  for (const k of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) {
    const d = mergeDay(a.days[k], b.days[k], tomb);
    // Keep a day if it has anything in it, or a timestamp that records a deliberate "cleared".
    if (d.entries.length || d.water || Object.values(d.checks).some(Boolean) || d.m) days[k] = d;
  }
  return canon({ days, tomb, mod: Math.max(a.mod, b.mod), small: mergeSmall(a, b) });
}

export const sameDoc = (a: SyncDoc, b: SyncDoc) => stable(a) === stable(b);

/** Put a merged doc into the app state, keeping this device's own key, theme, recents and so on. */
export function applyDoc(local: AppData, doc: SyncDoc): AppData {
  return {
    ...local,
    days: doc.days,
    tomb: doc.tomb,
    mod: doc.mod,
    profile: doc.small.profile,
    settings: { ...doc.small.settings, geminiKey: local.settings.geminiKey, geminiModel: local.settings.geminiModel, theme: local.settings.theme },
    weighIns: doc.small.weighIns,
    favourites: doc.small.favourites,
    targetChanges: doc.small.targetChanges,
    nudgeDismissed: doc.small.nudgeDismissed,
  };
}
