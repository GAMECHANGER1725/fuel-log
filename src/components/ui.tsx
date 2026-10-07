import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { create } from 'zustand';
import { useStore, dataOf } from '../lib/store';
import { computeGame } from '../lib/game';
import { todayKey } from '../lib/dates';

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
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
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
    <div style={{ position: 'relative', width: 168, height: 168, flex: 'none' }}>
      <svg width="168" height="168" viewBox="0 0 168 168" aria-hidden="true">
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

export function Stepper({ value, onChange, step = 0.5, min = 0.25, label, format }: { value: number; onChange: (v: number) => void; step?: number; min?: number; label: string; format?: (v: number) => string }) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <button className="btn icon" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, round(value - step)))}>−</button>
      <span className="num" style={{ fontSize: 32, lineHeight: 1 }}>{format ? format(value) : `${value}×`}</span>
      <button className="btn icon" aria-label={`More ${label}`} onClick={() => onChange(round(value + step))}>+</button>
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
    <div className="grid4" style={{ padding: '12px 0', background: 'var(--bg)', borderRadius: 6 }}>
      {cell(Math.round(unit === 'kJ' ? kcal * 4.184 : kcal).toLocaleString('en-AU'), unit, 'var(--fuel)')}
      {cell(String(Math.round(protein * 10) / 10), 'protein', 'var(--pro)')}
      {cell(String(Math.round(carbs)), 'carbs')}
      {cell(String(Math.round(fat)), 'fat')}
    </div>
  );
}

// ----- Toast ---------------------------------------------------------------------

export const useToast = create<{ msg: string | null; xp: number; n: number; show: (msg: string, xp?: number) => void }>((set) => ({
  msg: null,
  xp: 0,
  n: 0,
  show: (msg, xp = 0) => set((s) => ({ msg, xp, n: s.n + 1 })),
}));
export const toast = (msg: string, xp = 0) => useToast.getState().show(msg, xp);

export function Toast() {
  const { msg, xp, n } = useToast();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!msg) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), 2400);
    return () => clearTimeout(t);
  }, [msg, n]);
  if (!shown || !msg) return null;
  return (
    <div className="toast" role="status" aria-live="polite" key={n}>
      <span>{msg}</span>
      {xp > 0 && <span className="xp">+{xp} XP</span>}
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

export function useGame() {
  const today = useToday();
  const days = useStore((s) => s.days);
  const weighIns = useStore((s) => s.weighIns);
  const settings = useStore((s) => s.settings);
  return useMemo(() => computeGame(dataOf({ ...useStore.getState(), days, weighIns, settings }), today), [days, weighIns, settings, today]);
}

/** Minimal hash router: #/today, #/food?slot=dinner, ... */
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

export const go = (to: string) => {
  window.location.hash = `/${to}`;
};
