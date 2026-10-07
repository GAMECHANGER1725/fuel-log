// Shared types. Energy is always stored in kcal; kJ is display-only.

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type Source = 'db' | 'off' | 'scan' | 'ai-photo' | 'ai-label' | 'ai-text' | 'custom' | 'imported';

/** A food you can add: macros are for one serving. */
export interface Food extends Macros {
  id: string;
  name: string;
  /** e.g. "1 bowl (~250 g)". */
  serving: string;
  /** Tags: p = easy to pack for school, g = good gap-closer, w = whey. */
  tags?: string;
  /** Only for packaged foods: macros per 100 g/ml, so the amount can be set in grams. */
  per100?: Macros;
  servingGrams?: number;
  barcode?: string;
}

/** One logged item. `base` is one serving; totals are base × qty. `at` is when it was logged (kept for insights). */
export interface Entry {
  id: string;
  name: string;
  serving: string;
  base: Macros;
  qty: number;
  source: Source;
  /** Epoch ms when it was logged. */
  at: number;
  /** Epoch ms of the last edit, for syncing. */
  upd?: number;
  foodId?: string;
}

export interface DayLog {
  entries: Entry[];
  /** 250 ml glasses. */
  water: number;
  checks: Record<string, boolean>;
  /** Epoch ms of the last water/checks change, for syncing. */
  m?: number;
}

export interface WeighIn {
  date: string; // yyyy-MM-dd
  kg: number;
}

export type Activity = 'light' | 'moderate' | 'high';

export interface Profile {
  name: string;
  heightCm: number;
  weightKg: number;
  age: number;
  sex: 'male' | 'female';
  activity: Activity;
  goalKg: number | null;
}

export interface Settings {
  targets: Macros;
  waterL: number;
  gainLow: number;
  gainHigh: number;
  unit: 'kcal' | 'kJ';
  theme: 'auto' | 'dark' | 'light';
  geminiKey: string;
  geminiModel: string;
  wheyOk: boolean;
}

export interface TargetChange {
  date: string;
  from: number;
  to: number;
}

export interface GameSeen {
  level: number;
  badges: string[];
}

export interface AppData {
  v: 3;
  profile: Profile;
  settings: Settings;
  days: Record<string, DayLog>;
  weighIns: WeighIn[];
  favourites: Food[];
  recents: Food[];
  targetChanges: TargetChange[];
  /** Week start (yyyy-MM-dd) of the last dismissed calorie nudge. */
  nudgeDismissed: string | null;
  lastExport: string | null;
  seen: GameSeen;
  /** Entry ids deleted on any device (id → epoch ms), so a sync doesn't bring them back. */
  tomb: Record<string, number>;
  /** Epoch ms of the last change to profile, targets, weigh-ins or favourites (newest wins on sync). */
  mod: number;
}
