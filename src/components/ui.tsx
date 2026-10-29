import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type TouchEvent } from 'react';
import { create } from 'zustand';
import { useStore, dataOf } from '../lib/store';
import { computeGame } from '../lib/game';
import { atOn, hhmmOf, shiftHhmm, todayKey } from '../lib/dates';

// ----- Icons (inline stroke SVG, inherit colour) -------------------------------

const paths: Record<string, ReactNode> = {
  today: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  star: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />,
  flame: <path d="M12 22c4.4 0 7-3 7-7 0-4.5-4-7-4-11-3 2-4.5 4.5-4.5 7.5C9 10 8 9 8 7c-2 2-3 4.5-3 8 0 4 2.6 7 7 7z" />,
  barcode: <path d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  label: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  cart: <><path d="M3 4h2l2.4 11h10.2L20 8H6.2" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  refresh: <><path d="M20 11a8 8 0 00-14-4M4 4v4h4" /><path d="M4 13a8 8 0 0014 4M20 20v-4h-4" /></>,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></>,
};

export function Icon({ name, size = 22, stroke = 2 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// ----- Bits ----------------------------------------------------------------------

export function Bar({ value, max, color, height = 6 }: { value: number; max: number; color: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar" style={{ height }} role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(value)}>
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** Concentric energy (outer) and protein (inner) rings. */
export function Rings({ kcal, kcalMax, protein, proteinMax, children }: { kcal: number; kcalMax: number; protein: number; proteinMax: number; children?: ReactNode }) {
  const ring = (r: number, w: number, frac: number, color: string) => {
    const c = 2 * Math.PI * r;
    return (
      <>
        <circle cx="84" cy="84" r={r} fill="none" stroke="var(--track)" strokeWidth={w} />
        <circle cx="84" cy="84" r={r} fill="none" stroke={color} strokeWidth={w} strokeDasharray={`${Math.min(1, frac) * c} ${c}`} transform="rotate(-90 84 84)" style={{ transition: 'stroke-dasharray .5s cubic-bezier(.2,.9,.3,1.2)' }} />
      </>
    );
  };
  return (
    // Up to 168 px, smaller on narrow screens so the text beside it keeps room.
    <div style={{ position: 'relative', width: 'min(168px, 40vw)', aspectRatio: '1', flex: 'none' }}>
      <svg width="100%" height="100%" viewBox="0 0 168 168" aria-hidden="true">
        {ring(76, 12, kcalMax ? kcal / kcalMax : 0, 'var(--fuel)')}
        {ring(58, 10, proteinMax ? protein / proteinMax : 0, 'var(--pro)')}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

/** Quick serving sizes shown under a servings Stepper. */
/** The "when did you eat it" time for a log sheet: starts at the current time, as epoch ms on `date`. */
export function useEatenAt(date: string, initial: number = Date.now()) {
  const [hhmm, setHhmm] = useState(() => hhmmOf(initial));
  return { hhmm, setHhmm, at: atOn(date, hhmm) };
}

/** Time picker for when the food was eaten (for logging it later). */
export function TimeField({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const now = hhmmOf(Date.now());
  return (
    <label className="field">
      <span>Time eaten</span>
      <div className="row">
        <input className="input" type="time" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Time eaten" style={{ flex: 1 }} />
        {value !== now && <button className="btn" onClick={() => onChange(now)}>Now</button>}
      </div>
      {/* Logging something from a bit earlier: one tap back from the time shown. */}
      <div className="row" style={{ gap: 6 }} role="group" aria-label="Earlier">
        {[15, 30, 60].map((m) => (
          <button key={m} className="chip" style={{ minHeight: 34 }} onClick={() => onChange(shiftHhmm(value, -m))}>−{m < 60 ? `${m} min` : '1 h'}</button>
        ))}
      </div>
    </label>
  );
}

export const SERVING_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** − / + buttons around a number you can also tap and type (opens the decimal keypad), plus optional presets. */
export function Stepper({ value, onChange, step = 0.25, min = 0.25, max = 50, label, unit = '×', presets }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label: string; unit?: string; presets?: number[] }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  const [text, setText] = useState(String(value));
  // Follow changes from the buttons and presets, but leave half-typed input like "1." alone.
  useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value));
  }, [value]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn icon" aria-label={`Less ${label}`} onClick={() => set(value - step)}>−</button>
        <span className="row" style={{ gap: 4 }}>
          <input
            className="num qty"
            type="text"
            inputMode="decimal"
            aria-label={label}
            value={text}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const t = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
              setText(t);
              const v = parseFloat(t);
              if (v > 0) set(v);
            }}
            onBlur={() => setText(String(value))}
          />
          <span className="num mut" style={{ fontSize: 24 }}>{unit}</span>
        </span>
        <button className="btn icon" aria-label={`More ${label}`} onClick={() => set(value + step)}>+</button>
      </div>
      {presets && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }} role="group" aria-label={`Preset ${label}`}>
          {presets.map((p) => (
            <button key={p} className="chip" style={{ flex: '1 0 auto' }} aria-pressed={value === p} onClick={() => set(p)}>{p}×</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MacroGrid({ kcal, protein, carbs, fat, unit }: { kcal: number; protein: number; carbs: number; fat: number; unit: 'kcal' | 'kJ' }) {
  const cell = (v: string, l: string, color?: string) => (
    <div className="stack" style={{ gap: 0, textAlign: 'center' }}>
      <span className="num" style={{ fontSize: 24, color }}>{v}</span>
      <span className="mono mut" style={{ fontSize: 10 }}>{l}</span>
    </div>
  );
  return (
    <div className="grid4" style={{ padding: '12px 0', background: 'var(--s2)', borderRadius: 18 }}>
      {cell(Math.round(unit === 'kJ' ? kcal * 4.184 : kcal).toLocaleString('en-AU'), unit, 'var(--fuel)')}
      {cell(String(Math.round(protein * 10) / 10), 'protein', 'var(--pro)')}
      {cell(String(Math.round(carbs)), 'carbs')}
      {cell(String(Math.round(fat)), 'fat')}
    </div>
  );
}

// ----- Dictation -----------------------------------------------------------------

type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; start: () => void; stop: () => void };
const Speech = (typeof window !== 'undefined' && ((window as unknown as { SpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition)) || null;

/** Speak instead of type, where the browser has speech recognition (Chrome, Safari). `text` gets the words so far. */
export function useDictation(text: (words: string) => void) {
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  const toggle = () => {
    if (!Speech) return;
    if (rec.current) return rec.current.stop();
    const r = new Speech();
    r.lang = 'en-AU';
    r.interimResults = true;
    r.onresult = (e) => text(Array.from(e.results, (x) => x[0].transcript).join('').trim());
    r.onerror = (e) => e.error !== 'aborted' && e.error !== 'no-speech' && toast(e.error === 'not-allowed' ? 'Allow the microphone to speak a search' : 'Couldn’t hear that. Try again.');
    r.onend = () => {
      rec.current = null;
      setOn(false);
    };
    rec.current = r;
    setOn(true);
    r.start();
  };
  return { ok: !!Speech, on, toggle };
}

// ----- Toast ---------------------------------------------------------------------

/** A button on a toast, e.g. Undo. */
export interface ToastAction {
  label: string;
  run: () => void;
}

export const useToast = create<{ msg: string | null; xp: number; n: number; action?: ToastAction; show: (msg: string, xp?: number, action?: ToastAction) => void }>((set) => ({
  msg: null,
  xp: 0,
  n: 0,
  show: (msg, xp = 0, action) => set((s) => ({ msg, xp, action, n: s.n + 1 })),
}));
export const toast = (msg: string, xp = 0, action?: ToastAction) => useToast.getState().show(msg, xp, action);
/** Toast for food just logged, with Undo that takes it back off the log. */
export const toastAdded = (msg: string, xp: number, date: string, ids: string[]) => {
  navigator.vibrate?.(12); // a light tap where supported (Android); iOS ignores it
  toast(msg, xp, { label: 'Undo', run: () => ids.forEach((id) => useStore.getState().removeEntry(date, id)) });
};

export function Toast() {
  const { msg, xp, n, action } = useToast();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!msg) return;
    setShown(true);
    // Longer when there's something to tap.
    const t = setTimeout(() => setShown(false), action ? 5000 : 2400);
    return () => clearTimeout(t);
  }, [msg, n]);
  if (!shown || !msg) return null;
  return (
    <div className="toast" role="status" aria-live="polite" key={n}>
      <span>{msg}</span>
      {xp > 0 && <span className="xp">+{xp} XP</span>}
      {action && (
        <button
          className="toast-act"
          onClick={() => {
            action.run();
            setShown(false);
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ----- Hooks ---------------------------------------------------------------------

/** Today's date key, refreshed each minute so the app rolls over at midnight. */
export function useToday(): string {
  const [k, setK] = useState(todayKey);
  useEffect(() => {
    const t = setInterval(() => setK(todayKey()), 60_000);
    return () => clearInterval(t);
  }, []);
  return k;
}

/** Touch handlers for a quick horizontal swipe (mostly sideways, at least 70 px, under 600 ms). */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      // Leave sideways gestures in inputs and side-scrolling rows alone.
      start.current = e.touches.length === 1 && !(e.target as HTMLElement).closest('input, textarea, select, .quick') ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6 || Date.now() - s.t > 600) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}

/** The current time, refreshed each minute, for "x min ago" text. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useGame() {
  const today = useToday();
  const days = useStore((s) => s.days);
  const weighIns = useStore((s) => s.weighIns);
  const settings = useStore((s) => s.settings);
  return useMemo(() => computeGame(dataOf({ ...useStore.getState(), days, weighIns, settings }), today), [days, weighIns, settings, today]);
}

/** Minimal hash router: #/today, #/food?d=2026-10-06, ... */
export function useRoute(): { path: string; params: URLSearchParams } {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => window.location.hash,
  );
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  return { path: path || 'today', params: new URLSearchParams(query) };
}

/**
 * Press and hold (or right-click) runs `onLong`; `wasLong()` tells the click handler to skip the normal tap.
 * Scrolling a row cancels it (the browser sends pointercancel).
 */
export function useLongPress(onLong: () => void, ms = 500) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const clear = () => window.clearTimeout(timer.current);
  return {
    handlers: {
      onPointerDown: () => {
        fired.current = false;
        clear();
        timer.current = window.setTimeout(() => ((fired.current = true), onLong()), ms);
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: { preventDefault: () => void }) => {
        e.preventDefault();
        clear();
        if (!fired.current) ((fired.current = true), onLong());
      },
    },
    wasLong: () => fired.current,
  };
}

export const go = (to: string) => {
  window.location.hash = `/${to}`;
};
