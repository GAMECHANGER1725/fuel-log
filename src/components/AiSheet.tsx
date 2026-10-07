import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { analyse, fileToJpeg, friendlyError, type AiItem, type AiMode, type AiResult } from '../lib/gemini';
import { slotLabel, sumEntries, energy } from '../lib/nutrition';
import { XP } from '../lib/game';
import type { Slot } from '../lib/types';
import { go, Icon, MacroGrid, Sheet, toast } from './ui';

type Row = AiItem & { qty: number; removed: boolean };

const COPY: Record<AiMode, { title: string; take: string; hint: string; source: 'ai-photo' | 'ai-label' | 'ai-text' }> = {
  photo: { title: 'Snap meal', take: 'Take or choose a photo', hint: 'Anything the photo can’t show? e.g. “cooked in ghee”, “2 rotli under the dal”', source: 'ai-photo' },
  label: { title: 'Read label', take: 'Photo of the nutrition panel', hint: 'Optional: product name', source: 'ai-label' },
  text: { title: 'Describe it', take: '', hint: 'e.g. 3 rotli with ghee, a bowl of toor dal and a glass of milk', source: 'ai-text' },
};

export default function AiSheet({ mode, date, slot, initialText = '', onClose }: { mode: AiMode; date: string; slot: Slot; initialText?: string; onClose: () => void }) {
  const s = useStore();
  const c = COPY[mode];
  const fileRef = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<{ base64: string; mimeType: string; url: string } | null>(null);
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const noKey = !s.settings.geminiKey;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await analyse({ key: s.settings.geminiKey, model: s.settings.geminiModel, mode, text, imageBase64: img?.base64, mimeType: img?.mimeType });
      if (!r.items.length) setError(r.notes || 'No food found. Try again.');
      else {
        setResult(r);
        setRows(r.items.map((i) => ({ ...i, qty: 1, removed: false })));
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const live = rows.filter((r) => !r.removed && r.name.trim());
  const entries = live.map((r) => ({
    name: r.name.trim(),
    serving: r.portion,
    base: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat },
    qty: r.qty,
    slot,
    source: c.source,
  }));
  const total = sumEntries(entries.map((e) => ({ ...e, id: '', at: 0 })));
  const xp = Math.min(entries.length, XP.mealCap) * XP.meal + (entries.length ? XP.scan : 0);
  const patch = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  if (noKey)
    return (
      <Sheet onClose={onClose} label={c.title}>
        <h2 className="h2" style={{ fontSize: 26 }}>{c.title}</h2>
        <p>AI logging uses Google Gemini with your own free API key. Add it once in Profile and it stays on this phone.</p>
        <button className="btn primary block" onClick={() => { onClose(); go('profile?open=ai'); }}>Add Gemini key</button>
      </Sheet>
    );

  return (
    <Sheet onClose={onClose} label={c.title}>
      {!result ? (
        <>
          <div className="between">
            <h2 className="h2" style={{ fontSize: 26 }}>{c.title}</h2>
            <button className="btn icon sm" style={{ width: 36 }} aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
          </div>
          {mode !== 'text' && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr"
                aria-label={c.take}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setImg(await fileToJpeg(f).catch(() => null));
                }}
              />
              {img ? (
                <button style={{ padding: 0, border: 0, background: 'none' }} onClick={() => fileRef.current?.click()} aria-label="Retake photo">
                  <img src={img.url} alt="Your photo" className="photo" />
                </button>
              ) : (
                <button className="card" style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--ink)', borderStyle: 'dashed' }} onClick={() => fileRef.current?.click()}>
                  <span className="fuel"><Icon name={mode === 'label' ? 'label' : 'camera'} size={34} /></span>
                  <span style={{ fontWeight: 600 }}>{c.take}</span>
                </button>
              )}
            </>
          )}
          <label className="field">
            <span>{mode === 'text' ? 'What did you eat?' : 'Extra details (optional)'}</span>
            {mode === 'text' ? (
              <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={c.hint} maxLength={500} autoFocus />
            ) : (
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={c.hint} maxLength={200} />
            )}
          </label>
          {error && <p className="small" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy || (mode === 'text' ? !text.trim() : !img)} onClick={run}>
            {busy ? 'Gemini is thinking…' : mode === 'text' ? 'Work it out' : 'Analyse photo'}
          </button>
          <p className="mono dim">Estimates only · you review before logging</p>
        </>
      ) : (
        <>
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 2 }}>
              <span className="mono mut">{mode === 'label' ? 'Gemini read the label' : mode === 'text' ? 'Gemini worked it out' : 'Gemini read your plate'}</span>
              <h2 className="title">{live.length} food{live.length === 1 ? '' : 's'} found</h2>
            </div>
            <span className="mono" style={{ padding: '6px 8px', border: '2px solid var(--carb)', color: 'var(--carb)', borderRadius: 4, flex: 'none' }}>{result.confidence} confidence</span>
          </div>
          {result.notes && <p className="small mut">{result.notes}</p>}
          <div>
            {rows.map((r, i) =>
              r.removed ? (
                <div key={i} className="item">
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="mut" style={{ textDecoration: 'line-through' }}>{r.name}</span>
                    <span className="mono dim">Removed</span>
                  </div>
                  <button className="btn sm" onClick={() => patch(i, { removed: false })}>Undo</button>
                </div>
              ) : r.portion === '__new' ? (
                <div key={i} className="item" style={{ flexWrap: 'wrap' }}>
                  <input className="input" style={{ flex: '1 1 100%' }} placeholder="Food name" value={r.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Food name" />
                  {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
                    <label key={k} className="field" style={{ flex: '1 1 20%' }}>
                      <span>{k}</span>
                      <input className="input" type="number" inputMode="decimal" min="0" value={r[k] || ''} onChange={(e) => patch(i, { [k]: Math.max(0, parseFloat(e.target.value) || 0) })} />
                    </label>
                  ))}
                </div>
              ) : (
                <div key={i} className="item" style={{ gap: 8 }}>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span>{r.name}</span>
                    <span className="mono mut">{r.portion} · {energy(r.kcal * r.qty, s.settings.unit)} · {Math.round(r.protein * r.qty * 10) / 10} g P</span>
                  </div>
                  <button className="btn icon sm" style={{ width: 40, minHeight: 40 }} aria-label={`Less ${r.name}`} onClick={() => (r.qty <= 0.5 ? patch(i, { removed: true }) : patch(i, { qty: r.qty - 0.5 }))}>−</button>
                  <span className="num" style={{ fontSize: 20, minWidth: 28, textAlign: 'center' }}>{r.qty}</span>
                  <button className="btn icon sm" style={{ width: 40, minHeight: 40 }} aria-label={`More ${r.name}`} onClick={() => patch(i, { qty: r.qty + 0.5 })}>+</button>
                </div>
              ),
            )}
          </div>
          <button className="btn dashed" onClick={() => setRows([...rows, { name: '', portion: '__new', kcal: 0, protein: 0, carbs: 0, fat: 0, qty: 1, removed: false }])}>+ Add something it missed</button>
          <MacroGrid {...total} unit={s.settings.unit} />
          <div className="row">
            <button className="btn" onClick={() => setResult(null)}>Retry</button>
            <button
              className="btn primary grow"
              style={{ minHeight: 52 }}
              disabled={!entries.length}
              onClick={() => {
                s.addEntries(date, entries.map((e) => ({ ...e, serving: e.serving === '__new' ? '' : e.serving })));
                toast(`Logged ${entries.length} item${entries.length === 1 ? '' : 's'}`, xp);
                onClose();
              }}
            >
              Log to {slotLabel(slot).toLowerCase()} · +{xp} XP
            </button>
          </div>
          <span className="mono dim" style={{ textAlign: 'center' }}>Estimate only · {result.model}</span>
        </>
      )}
    </Sheet>
  );
}
