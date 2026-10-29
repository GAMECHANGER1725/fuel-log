import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { analyse, fileToJpeg, hasAi, friendlyError, MAX_PHOTOS, type AiItem, type AiMode, type AiResult } from '../lib/ai';
import { sumEntries, energy } from '../lib/nutrition';
import { XP } from '../lib/game';
import { go, Icon, MacroGrid, SERVING_PRESETS, Sheet, Stepper, TimeField, toast, useDictation, useEatenAt } from './ui';

type Row = AiItem & { qty: number; removed: boolean };

const COPY: Record<AiMode, { title: string; take: string; hint: string; source: 'ai-photo' | 'ai-label' | 'ai-text' }> = {
  photo: { title: 'Snap meal', take: 'Take or choose photos', hint: 'Anything the photo can’t show? e.g. “cooked in ghee”, “2 rotli under the dal”', source: 'ai-photo' },
  label: { title: 'Read label', take: 'Photos of the pack and its nutrition panel', hint: 'Optional: product name', source: 'ai-label' },
  text: { title: 'Describe it', take: '', hint: 'e.g. 3 rotli with ghee, a bowl of toor dal and a glass of milk', source: 'ai-text' },
};

export default function AiSheet({ mode, date, initialText = '', onClose }: { mode: AiMode; date: string; initialText?: string; onClose: () => void }) {
  const s = useStore();
  const c = COPY[mode];
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [imgs, setImgs] = useState<{ base64: string; mimeType: string; url: string }[]>([]);
  const [text, setText] = useState(initialText);
  // Spoken words go after anything already typed.
  const typed = useRef('');
  const speak = useDictation((w) => setText((typed.current + w).slice(0, 500)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [sizing, setSizing] = useState<number | null>(null); // row whose serving picker is open

  const noKey = !hasAi(s.settings);
  const when = useEatenAt(date);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await analyse({ cfg: s.settings, mode, text, images: imgs });
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
    source: c.source,
  }));
  const total = sumEntries(entries.map((e) => ({ ...e, id: '', at: 0 })));
  const xp = Math.min(entries.length, XP.mealCap) * XP.meal + (entries.length ? XP.scan : 0);
  const patch = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  if (noKey)
    return (
      <Sheet onClose={onClose} label={c.title}>
        <h2 className="h2" style={{ fontSize: 26 }}>{c.title}</h2>
        <p>AI logging uses DeepSeek (through TokenHarbor) or Google Gemini with your own free API key. Add one, or both so one can take over when the other hits its limit. Keys stay on this phone.</p>
        <button className="btn primary block" onClick={() => { onClose(); go('profile?open=ai'); }}>Add an AI key</button>
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
              {(
                [
                  [cameraRef, true],
                  [galleryRef, false],
                ] as const
              ).map(([ref, camera]) => (
                <input
                  key={String(camera)}
                  ref={ref}
                  type="file"
                  accept="image/*"
                  // The camera adds one photo at a time; the gallery can pick several at once.
                  capture={camera ? 'environment' : undefined}
                  multiple={!camera}
                  className="sr"
                  aria-label={camera ? 'Take a photo' : 'Choose photos'}
                  onChange={async (e) => {
                    const files = [...(e.target.files ?? [])].slice(0, MAX_PHOTOS - imgs.length);
                    e.target.value = '';
                    const added = (await Promise.all(files.map((f) => fileToJpeg(f).catch(() => null)))).filter((x) => !!x);
                    if (added.length) setImgs((cur) => [...cur, ...added].slice(0, MAX_PHOTOS));
                  }}
                />
              ))}
              {imgs.length > 0 ? (
                <>
                  <div className="thumbs">
                    {imgs.map((im, i) => (
                      <div key={im.url.slice(-40) + i} className="thumb">
                        <img src={im.url} alt={`Photo ${i + 1}`} />
                        <button className="btn icon sm" aria-label={`Remove photo ${i + 1}`} onClick={() => setImgs(imgs.filter((_, j) => j !== i))}>
                          <Icon name="close" size={16} stroke={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {imgs.length < MAX_PHOTOS && (
                    <div className="row">
                      <button className="btn grow" onClick={() => cameraRef.current?.click()}><Icon name="camera" size={18} /> Add photo</button>
                      <button className="btn grow" onClick={() => galleryRef.current?.click()}>From gallery</button>
                    </div>
                  )}
                  <span className="mono dim">
                    {imgs.length} of {MAX_PHOTOS} photos{mode === 'photo' ? ' · different angles help, nothing gets counted twice' : ''}
                  </span>
                </>
              ) : (
                <>
                  <button className="card" style={{ height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--ink)', borderStyle: 'dashed' }} onClick={() => cameraRef.current?.click()}>
                    <span className="fuel"><Icon name={mode === 'label' ? 'label' : 'camera'} size={34} /></span>
                    <span style={{ fontWeight: 600 }}>{c.take}</span>
                    <span className="mut small">Up to {MAX_PHOTOS}{mode === 'photo' ? ': whole plate, close-ups, the drink' : ''}</span>
                  </button>
                  <button className="btn" onClick={() => galleryRef.current?.click()}>Choose from gallery (pick several)</button>
                </>
              )}
            </>
          )}
          <label className="field">
            <span>{mode === 'text' ? 'What did you eat?' : 'Extra details (optional)'}</span>
            {mode === 'text' ? (
              <>
                <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={c.hint} maxLength={500} autoFocus />
                {speak.ok && (
                  <button
                    className="btn sm"
                    style={{ alignSelf: 'flex-start', ...(speak.on ? { color: 'var(--fuel)', borderColor: 'var(--fuel)' } : {}) }}
                    aria-pressed={speak.on}
                    onClick={() => {
                      typed.current = text.trim() ? `${text.trim()} ` : '';
                      speak.toggle();
                    }}
                  >
                    <Icon name="mic" size={16} /> {speak.on ? 'Listening… tap to stop' : 'Speak it'}
                  </button>
                )}
              </>
            ) : (
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={c.hint} maxLength={200} />
            )}
          </label>
          {error && <p className="small" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy || (mode === 'text' ? !text.trim() : !imgs.length)} onClick={run}>
            {busy ? 'Thinking it through…' : mode === 'text' ? 'Work it out' : imgs.length > 1 ? `Analyse ${imgs.length} photos` : 'Analyse photo'}
          </button>
          <p className="mono dim">Estimates only · you review before logging</p>
        </>
      ) : (
        <>
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 2 }}>
              <span className="mono mut">{mode === 'label' ? 'AI read the label' : mode === 'text' ? 'AI worked it out' : imgs.length > 1 ? `AI read ${imgs.length} photos` : 'AI read your plate'}</span>
              <h2 className="title">{live.length} food{live.length === 1 ? '' : 's'} found</h2>
            </div>
            <span className="tag" style={{ color: 'var(--carb)', flex: 'none' }}>{result.confidence} confidence</span>
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
                <div key={i} className="item" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span>{r.name}</span>
                    <span className="mono mut">{r.portion} · {energy(r.kcal * r.qty, s.settings.unit)} · {Math.round(r.protein * r.qty * 10) / 10} g P</span>
                  </div>
                  <button className="btn icon sm" style={{ width: 40, minHeight: 40 }} aria-label={`Less ${r.name}`} onClick={() => (r.qty <= 0.25 ? patch(i, { removed: true }) : patch(i, { qty: Math.round((r.qty - 0.25) * 100) / 100 }))}>−</button>
                  <button className="btn sm num" style={{ fontSize: 20, minWidth: 52, minHeight: 40, padding: '0 6px' }} aria-label={`Set amount of ${r.name}`} aria-expanded={sizing === i} onClick={() => setSizing(sizing === i ? null : i)}>{r.qty}×</button>
                  <button className="btn icon sm" style={{ width: 40, minHeight: 40 }} aria-label={`More ${r.name}`} onClick={() => patch(i, { qty: Math.round((r.qty + 0.25) * 100) / 100 })}>+</button>
                  {sizing === i && (
                    <div style={{ flex: '1 1 100%' }}>
                      <Stepper value={r.qty} onChange={(qty) => patch(i, { qty })} label={`servings of ${r.name}`} presets={SERVING_PRESETS} />
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
          <button className="btn dashed" onClick={() => setRows([...rows, { name: '', portion: '__new', kcal: 0, protein: 0, carbs: 0, fat: 0, qty: 1, removed: false }])}>+ Add something it missed</button>
          <MacroGrid {...total} unit={s.settings.unit} />
          <TimeField value={when.hhmm} onChange={when.setHhmm} />
          <div className="row">
            <button className="btn" onClick={() => setResult(null)}>Retry</button>
            <button
              className="btn primary grow"
              style={{ minHeight: 52 }}
              disabled={!entries.length}
              onClick={() => {
                s.addEntries(date, entries.map((e) => ({ ...e, serving: e.serving === '__new' ? '' : e.serving })), [], when.at);
                toast(`Logged ${entries.length} item${entries.length === 1 ? '' : 's'}`, xp);
                onClose();
              }}
            >
              Log {entries.length} item{entries.length === 1 ? '' : 's'} · +{xp} XP
            </button>
          </div>
          <span className="mono dim" style={{ textAlign: 'center' }}>Estimate only · {result.model}</span>
        </>
      )}
    </Sheet>
  );
}
