// Unfinished "Add food" work, kept on this device so leaving the page doesn't lose it: the search text, the
// numbers typed into "Enter numbers yourself", and the text, photos and AI result of Snap meal / Read label /
// Describe it. It is saved as you go and cleared once the food is logged or you discard it. Like prefs, it stays
// out of the main store and the gist (photos would bloat the sync file, and a half-typed draft isn't data).

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AiItem, AiMode, AiResult } from './ai';

export interface ImgDraft {
  base64: string;
  mimeType: string;
}
export type AiRowDraft = AiItem & { qty: number; removed: boolean };
export interface AiDraft {
  text: string;
  imgs: ImgDraft[];
  result: AiResult | null;
  rows: AiRowDraft[];
}
export interface ManualDraft {
  name: string;
  serving: string;
  energy: string;
  protein: string;
  carbs: string;
  fat: string;
  fav: boolean;
}

/** A draft untouched for this long is dropped, so an old half-typed search doesn't greet you days later. */
export const DRAFT_TTL = 24 * 3_600_000;
/** Most photo data kept in a draft (base64 characters). localStorage holds about 5 million and the log shares it. */
export const MAX_DRAFT_IMG_CHARS = 1_500_000;

const MODES: AiMode[] = ['photo', 'label', 'text'];

export const isEmptyManual = (m: ManualDraft | null | undefined) => !m || !(m.name.trim() || m.serving.trim() || m.energy || m.protein || m.carbs || m.fat);
export const isEmptyAi = (d: AiDraft | null | undefined) => !d || !(d.text.trim() || d.imgs.length || d.result);

/** The photos that fit the size limit, in order (the rest are left out of the draft, not out of the open sheet). */
export function fitImages(imgs: ImgDraft[], cap = MAX_DRAFT_IMG_CHARS): ImgDraft[] {
  const out: ImgDraft[] = [];
  let used = 0;
  for (const im of imgs) {
    used += im.base64.length;
    if (used > cap) break;
    out.push(im);
  }
  return out;
}

/** A photo's data URL, rebuilt from what a draft holds. */
export const imgUrl = (im: ImgDraft) => `data:${im.mimeType || 'image/jpeg'};base64,${im.base64}`;

export interface DraftData {
  q: string;
  manual: ManualDraft | null;
  ai: Partial<Record<AiMode, AiDraft>>;
  /** Epoch ms of the last change. */
  at: number;
}

export const EMPTY: DraftData = { q: '', manual: null, ai: {}, at: 0 };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function cleanAi(v: unknown): AiDraft | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const imgs = fitImages(
    (Array.isArray(r.imgs) ? r.imgs : [])
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && typeof (i as { base64?: unknown }).base64 === 'string')
      .slice(0, 6)
      .map((i) => ({ base64: String(i.base64), mimeType: str(i.mimeType, 40) || 'image/jpeg' })),
  );
  const rows = (Array.isArray(r.rows) ? r.rows : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .slice(0, 12)
    .map((x) => ({
      name: str(x.name, 60),
      portion: str(x.portion, 60),
      kcal: num(x.kcal),
      protein: num(x.protein),
      carbs: num(x.carbs),
      fat: num(x.fat),
      qty: Math.min(50, Math.max(0.25, num(x.qty) || 1)),
      removed: !!x.removed,
    }));
  const res = r.result && typeof r.result === 'object' ? (r.result as Record<string, unknown>) : null;
  const result: AiResult | null =
    res && rows.length
      ? { items: rows.map(({ qty: _q, removed: _r, ...item }) => item), confidence: res.confidence === 'high' || res.confidence === 'medium' ? res.confidence : 'low', notes: str(res.notes, 400), model: str(res.model, 60) }
      : null;
  const d: AiDraft = { text: str(r.text, 500), imgs, result, rows: result ? rows : [] };
  return isEmptyAi(d) ? null : d;
}

function cleanManual(v: unknown): ManualDraft | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const m: ManualDraft = { name: str(r.name, 60), serving: str(r.serving, 40), energy: str(r.energy, 12), protein: str(r.protein, 12), carbs: str(r.carbs, 12), fat: str(r.fat, 12), fav: !!r.fav };
  return isEmptyManual(m) ? null : m;
}

/** Validate a saved draft: anything wrong is dropped, and a draft older than the TTL is gone. */
export function cleanDraft(raw: unknown, now = Date.now()): DraftData {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const r = raw as Record<string, unknown>;
  const at = num(r.at);
  if (!at || now - at > DRAFT_TTL) return EMPTY;
  const ai: DraftData['ai'] = {};
  const saved = (r.ai && typeof r.ai === 'object' ? r.ai : {}) as Record<string, unknown>;
  for (const m of MODES) {
    const d = cleanAi(saved[m]);
    if (d) ai[m] = d;
  }
  return { q: str(r.q, 100), manual: cleanManual(r.manual), ai, at };
}

/** True when there is something to resume besides the search text. */
export const hasSheetDraft = (d: DraftData) => !!d.manual || MODES.some((m) => !!d.ai[m]);

/** Saved JSON with the photos taken out, for when the full draft won't fit in storage. */
export function stripImages(json: string): string {
  try {
    const o = JSON.parse(json) as { state?: { ai?: Record<string, { imgs?: unknown[] } | undefined> } };
    for (const d of Object.values(o.state?.ai ?? {})) if (d) d.imgs = [];
    return JSON.stringify(o);
  } catch {
    return json;
  }
}

interface Actions {
  setQ: (q: string) => void;
  setManual: (m: ManualDraft | null) => void;
  setAi: (mode: AiMode, d: AiDraft | null) => void;
  clear: () => void;
}

// ponytail: photos live in localStorage as base64, capped at MAX_DRAFT_IMG_CHARS (about 6 photos at the usual
// 1024 px); if even that won't fit the draft is saved without them. IndexedDB would lift the cap.
const storage = createJSONStorage<DraftData>(() => ({
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      try {
        localStorage.setItem(k, stripImages(v));
      } catch {
        /* storage full or blocked: the draft lives for this visit only */
      }
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
}));

export const useDraft = create<DraftData & Actions>()(
  persist(
    (set) => ({
      ...EMPTY,
      setQ: (q) => set({ q: q.slice(0, 100), at: Date.now() }),
      setManual: (m) => set({ manual: isEmptyManual(m) ? null : m, at: Date.now() }),
      setAi: (mode, d) =>
        set((s) => {
          const ai = { ...s.ai };
          if (isEmptyAi(d)) delete ai[mode];
          else ai[mode] = { ...d!, imgs: fitImages(d!.imgs) };
          return { ai, at: Date.now() };
        }),
      clear: () => set({ ...EMPTY }),
    }),
    {
      name: 'fuel-log-draft',
      storage,
      partialize: (s): DraftData => ({ q: s.q, manual: s.manual, ai: s.ai, at: s.at }),
      merge: (p, cur) => ({ ...cur, ...cleanDraft(p) }),
    },
  ),
);
