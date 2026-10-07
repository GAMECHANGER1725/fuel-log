import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useStore } from '../lib/store';
import { FOODS, foodMacros, searchFoods } from '../lib/foods';
import { searchProducts } from '../lib/off';
import { energy, forGrams, scale, KJ } from '../lib/nutrition';
import { XP } from '../lib/game';
import type { Food, Source } from '../lib/types';
import { Icon, MacroGrid, Sheet, Stepper, go, toast, useRoute, useToday } from '../components/ui';
import Scanner from '../components/Scanner';
import AiSheet from '../components/AiSheet';
import type { AiMode } from '../lib/gemini';

type Picked = { food: Food; source: Source };

export default function FoodPage() {
  const today = useToday();
  const { params } = useRoute();
  const date = params.get('d') ?? today;
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [sheet, setSheet] = useState<'scan' | 'manual' | AiMode | null>(null);
  const [off, setOff] = useState<{ q: string; foods: Food[]; loading: boolean; failed: boolean }>({ q: '', foods: [], loading: false, failed: false });
  const s = useStore();
  const unit = s.settings.unit;

  const local = useMemo(() => searchFoods([...s.favourites, ...FOODS], q), [q, s.favourites]);

  // Open Food Facts search, debounced, only when online and the query is real.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 3 || !navigator.onLine) {
      setOff({ q: query, foods: [], loading: false, failed: false });
      return;
    }
    const ctl = new AbortController();
    setOff((o) => ({ ...o, loading: true, failed: false }));
    const t = setTimeout(() => {
      searchProducts(query, ctl.signal)
        .then((foods) => setOff({ q: query, foods, loading: false, failed: false }))
        .catch((e) => (e as Error).name !== 'AbortError' && setOff({ q: query, foods: [], loading: false, failed: true }));
    }, 700);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const back = () => go(date === today ? 'today' : `today?d=${date}`);
  const row = (f: Food, source: Source) => (
    <div key={`${source}-${f.id}`} className="item">
      <button className="item-btn" onClick={() => setPicked({ food: f, source })}>
        <span>{f.name}</span>
        <span className="mono mut">{f.serving} · {energy(f.kcal, unit)} {unit} · {f.protein} g P</span>
      </button>
      <button className="btn icon" aria-label={`Add ${f.name}`} onClick={() => setPicked({ food: f, source })}>+</button>
    </div>
  );

  const tile = (mode: 'scan' | AiMode, icon: string, title: string, sub: string) => (
    <button className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: 14, color: 'var(--ink)', textAlign: 'left' }} onClick={() => setSheet(mode)}>
      <span className="fuel"><Icon name={icon} size={26} /></span>
      <span style={{ fontWeight: 600 }}>{title}</span>
      <span className="mut" style={{ fontSize: 12, marginTop: -6 }}>{sub}</span>
    </button>
  );

  return (
    <>
      <header className="head">
        <div className="stack" style={{ gap: 2 }}>
          <span className="mono mut">{date === today ? 'Logging now' : `Adding to ${date}`}</span>
          <h1 className="title">Add food</h1>
        </div>
        <button className="btn" onClick={back}>Done</button>
      </header>

      <div className="page">
        <label className="search">
          <span className="mut"><Icon name="search" size={20} /></span>
          <input aria-label="Search foods" placeholder="Search foods or products" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          {q && <button className="btn icon sm" style={{ border: 0, width: 32 }} aria-label="Clear search" onClick={() => setQ('')}><Icon name="close" size={18} /></button>}
        </label>

        {!q && (
          <>
            <div className="grid2">
              {tile('scan', 'barcode', 'Scan barcode', 'Free, any packet')}
              {tile('photo', 'camera', 'Snap meal', 'AI estimates a plate')}
              {tile('label', 'label', 'Read label', 'Photo of the panel')}
              {tile('text', 'chat', 'Describe it', 'Type what you ate')}
            </div>
            <button className="btn dashed" onClick={() => setSheet('manual')}><Icon name="pencil" size={16} /> Enter numbers yourself</button>
          </>
        )}

        {q ? (
          <section>
            <div className="between" style={{ marginBottom: 6 }}>
              <h2 className="h2">Results</h2>
              <span className="mono mut">Built-in · Open Food Facts</span>
            </div>
            {local.map((f) => row(f, 'db'))}
            {off.foods.map((f) => row(f, 'off'))}
            <p className="mono mut" style={{ padding: '12px 0' }}>
              {off.loading ? 'Searching Australian products…' : off.failed ? 'Product search failed. Try again.' : !navigator.onLine ? 'Offline: showing built-in foods only.' : !local.length && !off.foods.length && q.trim().length >= 3 ? 'No matches.' : ''}
            </p>
            <button className="btn dashed" style={{ width: '100%' }} onClick={() => setSheet('text')}>Not here? Describe “{q}” to the AI</button>
          </section>
        ) : (
          <>
            {s.favourites.length > 0 && (
              <section>
                <h2 className="h2" style={{ marginBottom: 6 }}>Favourites</h2>
                {s.favourites.map((f) => row(f, f.barcode ? 'off' : 'db'))}
              </section>
            )}
            <section>
              <h2 className="h2" style={{ marginBottom: 6 }}>Recent</h2>
              {s.recents.length ? s.recents.slice(0, 12).map((f) => row(f, f.barcode ? 'off' : 'db')) : <p className="empty">Foods you log show up here for one-tap adding.</p>}
            </section>
          </>
        )}
      </div>

      {picked && <AddSheet date={date} picked={picked} onClose={() => setPicked(null)} />}
      {sheet === 'manual' && <ManualSheet date={date} onClose={() => setSheet(null)} />}
      {sheet === 'scan' && (
        <Scanner
          onClose={() => setSheet(null)}
          onFound={(food) => {
            setSheet(null);
            setPicked({ food, source: 'scan' });
          }}
          onReadLabel={() => setSheet('label')}
        />
      )}
      {(sheet === 'photo' || sheet === 'label' || sheet === 'text') && <AiSheet mode={sheet} date={date} initialText={sheet === 'text' ? q : ''} onClose={() => setSheet(null)} />}
    </>
  );
}

function AddSheet({ date, picked, onClose }: { date: string; picked: Picked; onClose: () => void }) {
  const { food, source } = picked;
  const s = useStore();
  const byGrams = !!food.per100;
  const [useGrams, setUseGrams] = useState(false);
  const [qty, setQty] = useState(1);
  const [grams, setGrams] = useState(food.servingGrams ?? 100);
  const m = useGrams && food.per100 ? forGrams(food.per100, grams) : scale(foodMacros(food), qty);
  const fav = s.favourites.some((f) => f.name.toLowerCase() === food.name.toLowerCase());
  const xp = XP.meal + (source === 'scan' ? XP.scan : 0);

  const add = () => {
    const entry =
      useGrams && food.per100
        ? { name: food.name, serving: `${grams} g`, base: m, qty: 1 }
        : { name: food.name, serving: food.serving, base: foodMacros(food), qty };
    s.addEntries(date, [{ ...entry, source, foodId: food.id }], [food]);
    toast(`Added ${food.name}`, xp);
    onClose();
  };

  return (
    <Sheet onClose={onClose} label={`Add ${food.name}`}>
      <div className="stack" style={{ gap: 2 }}>
        <span className="mono mut">{source === 'scan' ? `Scanned · ${food.barcode}` : source === 'off' ? 'Open Food Facts' : food.serving}</span>
        <h2 className="h2" style={{ fontSize: 26 }}>{food.name}</h2>
      </div>
      {byGrams && (
        <div className="row">
          <button className="chip" aria-pressed={!useGrams} onClick={() => setUseGrams(false)}>Servings ({food.serving})</button>
          <button className="chip" aria-pressed={useGrams} onClick={() => setUseGrams(true)}>Grams</button>
        </div>
      )}
      {useGrams ? (
        <Stepper value={grams} onChange={setGrams} step={10} min={5} label="grams" format={(v) => `${v} g`} />
      ) : (
        <Stepper value={qty} onChange={setQty} label="servings" format={(v) => `${v}×`} />
      )}
      <MacroGrid {...m} unit={s.settings.unit} />
      <div className="row">
        <button
          className="btn"
          aria-label={fav ? 'Remove from favourites' : 'Save as favourite'}
          aria-pressed={fav}
          style={{ width: 52, padding: 0, ...(fav ? { color: 'var(--fuel)', borderColor: 'var(--fuel)' } : {}) }}
          onClick={() => s.toggleFavourite(food)}
        >
          <Icon name="star" size={18} />
        </button>
        <button className="btn primary grow" style={{ minHeight: 52 }} onClick={add}>Add · +{xp} XP</button>
      </div>
    </Sheet>
  );
}

function ManualSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const s = useStore();
  const unit = s.settings.unit;
  const [f, setF] = useState({ name: '', serving: '', energy: '', protein: '', carbs: '', fat: '', fav: false });
  const n = (v: string) => Math.max(0, parseFloat(v) || 0);
  const kcal = unit === 'kJ' ? n(f.energy) / KJ : n(f.energy);
  const ok = f.name.trim() && kcal > 0;
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'fav' ? e.target.checked : e.target.value });

  const save = () => {
    const base = { kcal: Math.round(kcal), protein: n(f.protein), carbs: n(f.carbs), fat: n(f.fat) };
    const food: Food = { id: `fav-${Date.now().toString(36)}`, name: f.name.trim().slice(0, 60), serving: f.serving.trim() || '1 serve', ...base };
    s.addEntries(date, [{ name: food.name, serving: food.serving, base, qty: 1, source: 'custom' }], [food]);
    if (f.fav) s.toggleFavourite(food);
    toast(`Added ${food.name}`, XP.meal);
    onClose();
  };

  return (
    <Sheet onClose={onClose} label="Enter food">
      <h2 className="h2" style={{ fontSize: 26 }}>Enter it yourself</h2>
      <label className="field"><span>Food</span><input className="input" value={f.name} onChange={set('name')} placeholder="Mum's paneer paratha" maxLength={60} /></label>
      <label className="field"><span>Serving</span><input className="input" value={f.serving} onChange={set('serving')} placeholder="1 paratha" maxLength={40} /></label>
      <div className="grid2">
        <label className="field"><span>Energy ({unit})</span><input className="input" inputMode="decimal" type="number" min="0" value={f.energy} onChange={set('energy')} /></label>
        <label className="field"><span>Protein (g)</span><input className="input" inputMode="decimal" type="number" min="0" value={f.protein} onChange={set('protein')} /></label>
        <label className="field"><span>Carbs (g)</span><input className="input" inputMode="decimal" type="number" min="0" value={f.carbs} onChange={set('carbs')} /></label>
        <label className="field"><span>Fat (g)</span><input className="input" inputMode="decimal" type="number" min="0" value={f.fat} onChange={set('fat')} /></label>
      </div>
      <label className="row small"><input type="checkbox" checked={f.fav} onChange={set('fav')} style={{ width: 20, height: 20, accentColor: 'var(--fuel)' }} /> Save as a favourite for one-tap adding</label>
      <button className="btn primary block" disabled={!ok} onClick={save}>Add · +{XP.meal} XP</button>
    </Sheet>
  );
}
