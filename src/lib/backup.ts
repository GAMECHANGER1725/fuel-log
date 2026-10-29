// Defaults, backup export, and import (this app's v3 backups and the original Fuel Log artifact's v2).
// Imported files are untrusted, so everything is re-validated field by field.

import type { AppData, DayLog, Entry, Food, Macros, Source } from './types';
import { hhmmOf, isKey } from './dates';
import { dayTotals, entryMacros, r1 } from './nutrition';
import { DEFAULT_GEMINI_MODEL, DEFAULT_MODEL } from './ai';
import type { Recipe, RecipeEdits } from './recipes';

export const DEFAULT_CHECKS: [string, string][] = [
  ['veg', 'Fruit or veg'],
  ['protein', 'Protein each meal'],
  ['grains', 'Whole grains'],
  ['nosugar', 'No sugary drinks'],
];
// Personal app: starts set up for its one user. Targets = suggestTargets(profile).
export const DEFAULT_DATA: AppData = {
  v: 3,
  profile: { name: 'Vaidik', heightCm: 182, weightKg: 58.3, age: 15, sex: 'male', activity: 'moderate', goalKg: null },
  settings: {
    targets: { kcal: 3050, protein: 115, carbs: 456, fat: 85 },
    waterL: 2,
    gainLow: 0.25,
    gainHigh: 0.5,
    unit: 'kcal',
    theme: 'auto',
    aiKey: '',
    aiModel: DEFAULT_MODEL,
    geminiKey: '',
    geminiModel: DEFAULT_GEMINI_MODEL,
    aiFirst: 'deepseek',
    wheyOk: false,
    checks: DEFAULT_CHECKS,
  },
  days: {},
  weighIns: [],
  favourites: [],
  recipeEdits: {},
  recents: [],
  targetChanges: [],
  nudgeDismissed: null,
  lastExport: null,
  seen: { level: 1, badges: [] },
  tomb: {},
  mod: 0,
};

const SOURCES: Source[] = ['db', 'off', 'scan', 'ai-photo', 'ai-label', 'ai-text', 'coach', 'custom', 'imported'];

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 80, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);
function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const MAX_CHECKS = 6;

/** Up to 6 checks with a-z keys (unique) and short labels; the defaults if none are valid. */
export function cleanChecks(v: unknown): [string, string][] {
  const seen = new Set<string>();
  const out = arr(v)
    .map((c) => arr(c))
    .map(([k, l]) => [str(k, 20), str(l, 30).trim()] as [string, string])
    .filter(([k, l]) => /^[a-z]{1,20}$/.test(k) && l && !seen.has(k) && !!seen.add(k))
    .slice(0, MAX_CHECKS);
  return out.length ? out : DEFAULT_CHECKS;
}


function macros(v: unknown): Macros {
  const m = obj(v);
  return { kcal: r1(num(m.kcal, 0, 0, 10000)), protein: r1(num(m.protein, 0, 0, 600)), carbs: r1(num(m.carbs, 0, 0, 1500)), fat: r1(num(m.fat, 0, 0, 600)) };
}

function food(v: unknown): Food | null {
  const f = obj(v);
  const name = str(f.name, 80).trim();
  if (!name) return null;
  return {
    id: str(f.id, 80) || `fav-${uid()}`,
    name,
    serving: str(f.serving, 60) || '1 serve',
    ...macros(f),
    tags: str(f.tags, 8) || undefined,
    per100: f.per100 ? macros(f.per100) : undefined,
    servingGrams: f.servingGrams ? num(f.servingGrams, 100, 1, 5000) : undefined,
    barcode: str(f.barcode, 20) || undefined,
  };
}

function recipe(v: unknown): Recipe | null {
  const r = obj(v);
  const name = str(r.name, 80).trim();
  if (!name) return null;
  return {
    name,
    serving: str(r.serving, 60) || '1 serve',
    tags: str(r.tags, 8),
    time: str(r.time, 40),
    // Edited recipes carry their own macros, so ingredient keys aren't needed (or trusted).
    lines: arr(r.lines).slice(0, 20).map((l): Recipe['lines'][number] => [null, 0, str(arr(l)[2], 30), str(arr(l)[3], 120)]).filter((l) => l[3]),
    steps: arr(r.steps).slice(0, 10).map((x) => str(x, 300)).filter(Boolean),
    macros: macros(r.macros),
  };
}

function recipeEdits(v: unknown): RecipeEdits {
  const out: RecipeEdits = {};
  for (const x of Object.values(obj(v)).slice(0, 100)) {
    const r = recipe(x);
    if (r) out[r.name.toLowerCase()] = r;
  }
  return out;
}

function entry(v: unknown): Entry {
  const e = obj(v);
  return {
    id: str(e.id, 40) || uid(),
    name: str(e.name, 80) || 'Food',
    serving: str(e.serving, 60),
    base: macros(e.base),
    qty: num(e.qty, 1, 0.05, 50),
    source: SOURCES.includes(e.source as Source) ? (e.source as Source) : 'custom',
    at: num(e.at, Date.now(), 0, 4e12),
    upd: e.upd == null ? undefined : num(e.upd, 0, 0, 4e12),
    foodId: str(e.foodId, 80) || undefined,
  };
}

function day(v: unknown): DayLog {
  const d = obj(v);
  const checks: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(obj(d.checks))) if (/^[a-z]{1,20}$/.test(k)) checks[k] = !!val;
  const note = str(d.note, 200).trim();
  const boost = Math.round(num(d.boost, 0, 0, 1500));
  return { entries: arr(d.entries).slice(0, 200).map(entry), water: num(d.water, 0, 0, 60), checks, ...(note ? { note } : {}), ...(boost ? { boost } : {}), m: d.m == null ? undefined : num(d.m, 0, 0, 4e12) };
}

/** Validate a v3 data object, filling anything missing from the defaults. */
export function normalize(raw: unknown): AppData {
  const r = obj(raw);
  const D = DEFAULT_DATA;
  const p = obj(r.profile);
  const s = obj(r.settings);
  const days: Record<string, DayLog> = {};
  for (const [k, v] of Object.entries(obj(r.days))) if (isKey(k)) days[k] = day(v);
  const weighIns = arr(r.weighIns)
    .map(obj)
    .filter((w) => isKey(w.date) && num(w.kg, 0, 0, 400) >= 20)
    .map((w) => ({ date: w.date as string, kg: r1(num(w.kg, 0, 20, 400)) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const gainLow = num(s.gainLow, D.settings.gainLow, 0, 2);
  return {
    v: 3,
    profile: {
      name: str(p.name, 40),
      heightCm: num(p.heightCm, D.profile.heightCm, 100, 250),
      weightKg: num(p.weightKg, D.profile.weightKg, 25, 300),
      age: Math.round(num(p.age, D.profile.age, 10, 100)),
      sex: p.sex === 'female' ? 'female' : 'male',
      activity: p.activity === 'light' || p.activity === 'high' ? p.activity : 'moderate',
      goalKg: p.goalKg == null || p.goalKg === '' ? null : num(p.goalKg, 0, 25, 300) || null,
    },
    settings: {
      targets: (() => {
        const t = macros(s.targets);
        return t.kcal >= 800 ? t : D.settings.targets;
      })(),
      waterL: num(s.waterL, D.settings.waterL, 0.5, 6),
      gainLow,
      gainHigh: Math.max(gainLow, num(s.gainHigh, D.settings.gainHigh, 0, 2)),
      unit: s.unit === 'kJ' ? 'kJ' : 'kcal',
      theme: s.theme === 'dark' || s.theme === 'light' ? s.theme : 'auto',
      aiKey: str(s.aiKey, 200).trim(),
      aiModel: str(s.aiModel, 60).trim() || DEFAULT_MODEL,
      // Saves from before the switch to DeepSeek still carry geminiKey, so an old backup brings it back.
      geminiKey: str(s.geminiKey, 200).trim(),
      geminiModel: (() => {
        const m = str(s.geminiModel, 60).trim();
        return m.startsWith('gemini') ? m : DEFAULT_GEMINI_MODEL;
      })(),
      aiFirst: s.aiFirst === 'gemini' ? 'gemini' : 'deepseek',
      wheyOk: !!s.wheyOk,
      checks: cleanChecks(s.checks),
    },
    days,
    weighIns: weighIns.filter((w, i) => weighIns.findIndex((x) => x.date === w.date) === i),
    favourites: arr(r.favourites).slice(0, 200).map(food).filter((f): f is Food => !!f),
    recipeEdits: recipeEdits(r.recipeEdits),
    recents: arr(r.recents).slice(0, 30).map(food).filter((f): f is Food => !!f),
    targetChanges: arr(r.targetChanges)
      .map(obj)
      .filter((c) => isKey(c.date))
      .map((c) => ({ date: c.date as string, from: num(c.from, 0, 0, 10000), to: num(c.to, 0, 0, 10000) })),
    nudgeDismissed: isKey(r.nudgeDismissed) ? r.nudgeDismissed : null,
    lastExport: isKey(r.lastExport) ? r.lastExport : null,
    seen: {
      level: Math.round(num(obj(r.seen).level, 1, 1, 1000)),
      badges: arr(obj(r.seen).badges).filter((b): b is string => typeof b === 'string').slice(0, 100),
    },
    tomb: Object.fromEntries(
      Object.entries(obj(r.tomb))
        .filter(([k, v]) => k.length <= 40 && typeof v === 'number')
        .slice(0, 5000)
        .map(([k, v]) => [k, num(v, 0, 0, 4e12)]),
    ),
    mod: num(r.mod, 0, 0, 4e12),
  };
}

/** The original single-file Fuel Log (v2): meals had only kcal + protein, weekly check-ins, quick foods. */
export function fromFuelLogV2(raw: unknown): AppData {
  const r = obj(raw);
  const s = obj(r.settings);
  const days: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj(r.days))) {
    if (!isKey(k)) continue;
    const d = obj(v);
    days[k] = {
      entries: arr(d.meals).map((m, i) => {
        const x = obj(m);
        return {
          id: str(x.id, 40) || `${k}-${i}`,
          name: str(x.name, 80) || 'Meal',
          serving: '',
          base: { kcal: num(x.kcal, 0, 0, 10000), protein: num(x.protein, 0, 0, 600), carbs: 0, fat: 0 },
          qty: 1,
          source: 'imported',
          at: new Date(`${k}T12:00:00`).getTime() + i,
        };
      }),
      water: d.water,
      checks: d.checks,
    };
  }
  const kcal = num(s.kcal, 3000, 1200, 6000);
  const protein = num(s.protein, 115, 20, 300);
  const fat = Math.round((kcal * 0.25) / 9);
  return normalize({
    settings: {
      targets: { kcal, protein, fat, carbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)) },
      waterL: s.waterL,
      gainLow: s.gainLow,
      gainHigh: s.gainHigh,
      unit: s.unit,
      theme: s.theme,
    },
    days,
    weighIns: arr(r.checkins).map((c) => ({ date: obj(c).date, kg: obj(c).weight })),
    favourites: arr(r.quick).map((q) => ({ ...obj(q), serving: '1 serve', carbs: 0, fat: 0 })),
  });
}

/** One CSV field: quoted when needed, and text that a spreadsheet would run as a formula is prefixed with '. */
const csvField = (v: string | number) => {
  if (typeof v === 'number') return String(v);
  const t = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** The whole log as CSV: a row per food, then a 'day' row with that day's totals, water and note. */
export function exportCsv(d: AppData): string {
  const rows: (string | number)[][] = [['type', 'date', 'time', 'food', 'serving', 'servings', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'water_l', 'note']];
  for (const date of Object.keys(d.days).sort()) {
    const day = d.days[date];
    for (const e of [...day.entries].sort((a, b) => a.at - b.at)) {
      const m = entryMacros(e);
      rows.push(['food', date, hhmmOf(e.at), e.name, e.serving, e.qty, Math.round(m.kcal), r1(m.protein), r1(m.carbs), r1(m.fat), '', '']);
    }
    const t = dayTotals(day);
    if (day.entries.length || day.water || day.note) rows.push(['day', date, '', '', '', '', Math.round(t.kcal), r1(t.protein), r1(t.carbs), r1(t.fat), day.water * 0.25, day.note ?? '']);
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export function exportText(d: AppData): string {
  return JSON.stringify({ app: 'fuel-log', v: 3, exportedAt: new Date().toISOString(), data: d });
}

/** Read any supported backup text. Throws if it isn't one. */
export function parseBackup(text: string): AppData {
  const p = obj(JSON.parse(String(text).trim()));
  const isWrapped = (p.app === 'fuel-log' || p.app === 'lift-log') && p.data;
  const data = obj(isWrapped ? p.data : p);
  if (data.v === 3 || p.v === 3) return normalize(data);
  if (data.days && typeof data.days === 'object') return fromFuelLogV2(data);
  throw new Error('Not a Fuel Log backup');
}
