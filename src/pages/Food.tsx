import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../lib/store';
import { fmtDate, todayKey } from '../lib/dates';
import { BROWSE, FOODS, browseFoods, foodMacros, searchFoods, type Browse } from '../lib/foods';
import { searchProducts } from '../lib/off';
import { coverage, dayTargets, dayTotals, energy, fmt, forGrams, scale, KJ } from '../lib/nutrition';
import { XP } from '../lib/game';
import type { Food, Macros, Source } from '../lib/types';
import { Icon, MacroGrid, SERVING_PRESETS, Sheet, Stepper, TimeField, go, toast, toastAdded, useEatenAt, useRoute, useToday } from '../components/ui';
import Scanner from '../components/Scanner';
import AiSheet from '../components/AiSheet';
import { hasAi, type AiMode } from '../lib/ai';
import RecipeView from '../components/RecipeView';
import { recipeFor, withEdit } from '../lib/recipes';
import { lastQty, mealGroups, type MealGroup } from '../lib/meals';

type Picked = { food: Food; source: Source };

export default function FoodPage() {
  const today = useToday();
  const { params } = useRoute();
  const date = params.get('d') ?? today;
  const [q, setQ] = useState('');
  const [browse, setBrowse] = useState<Browse | null>(null);
  // "/" jumps to the search box on a keyboard.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || document.querySelector('[role=dialog]') || (e.target as HTMLElement).closest('input, textarea, select')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const s0 = useStore.getState();
  const [tidy, setTidy] = useState<'fav' | 'recent' | null>(null); // which list shows remove buttons
  const [editingFav, setEditingFav] = useState<Food | null>(null);
  const [allRecent, setAllRecent] = useState(false);
  // #/food?add=<name> opens the amount sheet for that food (holding a Quick log chip on Today).
  const [picked, setPicked] = useState<Picked | null>(() => {
    const n = params.get('add')?.toLowerCase();
    const f = n ? [...s0.favourites, ...s0.recents, ...FOODS].find((x) => x.name.toLowerCase() === n) : undefined;
    return f ? { food: f, source: f.barcode ? 'off' : 'db' } : null;
  });
  // #/food?open=scan|manual|photo|label|text opens that sheet straight away (app-icon shortcut, Today's quick
  // actions); closing it goes back to Today, since that's where the tap came from.
  const opened = (['scan', 'manual', 'photo', 'label', 'text'] as const).find((m) => m === params.get('open')) ?? null;
  const [sheet, setSheet] = useState<'scan' | 'manual' | AiMode | null>(opened);
  const fromLink = useRef(!!opened || !!picked);
  const closeSheet = () => {
    setSheet(null);
    if (fromLink.current) back();
  };
  const [off, setOff] = useState<{ q: string; foods: Food[]; loading: boolean; failed: boolean }>({ q: '', foods: [], loading: false, failed: false });
  const s = useStore();
  const unit = s.settings.unit;

  const local = useMemo(() => {
    const mine = new Set([...s.favourites, ...s.recents].map((f) => f.name.toLowerCase()));
    return searchFoods([...s.favourites, ...FOODS.map((f) => withEdit(f, s.recipeEdits))], q, 30, mine);
  }, [q, s.favourites, s.recents, s.recipeEdits]);

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
    }, 900);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const browsed = useMemo(
    () => (browse ? browseFoods([...s.favourites, ...FOODS.map((f) => withEdit(f, s.recipeEdits))].filter((f) => s.settings.wheyOk || !f.tags?.includes('w')), browse) : []),
    [browse, s.favourites, s.recipeEdits, s.settings.wheyOk],
  );
  const usual = useMemo(() => mealGroups(s.days, today), [s.days, today]);
  const logMeal = (g: MealGroup) => {
    const ids = s.addEntries(date, g.items.map(({ name, serving, base, qty, source, foodId }) => ({ name, serving, base, qty, source, foodId })));
    toastAdded(`Added ${g.items.length} items`, Math.min(g.items.length, XP.mealCap) * XP.meal, date, ids);
    back();
  };

  const back = () => go(date === today ? 'today' : `today?d=${date}`);
  // + logs one serving straight away; tapping the name opens the sheet for amount and time.
  const quickAdd = (food: Food, source: Source) => {
    const f = withEdit(food, s.recipeEdits);
    const qty = lastQty(s.days, today, f.name, f.serving);
    const ids = s.addEntries(date, [{ name: f.name, serving: f.serving, base: foodMacros(f), qty, source, foodId: f.id }], [f]);
    toastAdded(`Added ${qty !== 1 ? `${qty}× ` : ''}${f.name}`, XP.meal + (source === 'scan' ? XP.scan : 0), date, ids);
  };
  const row = (f: Food, source: Source, remove?: () => void, onOpen?: () => void, move?: { up: boolean; down: boolean }) => (
    <div key={`${source}-${f.id}`} className="item">
      <button className="item-btn" onClick={onOpen ?? (() => setPicked({ food: f, source }))}>
        <span>{f.name}</span>
        <span className="mono mut">{f.serving} · {energy(f.kcal, unit)} {unit} · {f.protein} g P{recipeFor(f, s.recipeEdits) ? ' · recipe' : ''}</span>
      </button>
      {move && (
        <>
          <button className="btn icon sm" style={{ width: 36 }} aria-label={`Move ${f.name} up`} disabled={!move.up} onClick={() => s.moveFavourite(f.id, -1)}><span style={{ transform: 'rotate(90deg)', display: 'flex' }}><Icon name="left" size={16} /></span></button>
          <button className="btn icon sm" style={{ width: 36 }} aria-label={`Move ${f.name} down`} disabled={!move.down} onClick={() => s.moveFavourite(f.id, 1)}><span style={{ transform: 'rotate(90deg)', display: 'flex' }}><Icon name="right" size={16} /></span></button>
        </>
      )}
      {remove ? (
        <button className="btn icon danger" aria-label={`Remove ${f.name} from this list`} onClick={remove}><Icon name="close" size={18} /></button>
      ) : (
        <button className="btn icon" aria-label={`Add one ${f.name} now`} onClick={() => quickAdd(f, source)}>+</button>
      )}
    </div>
  );
  const listHead = (title: string, list: 'fav' | 'recent') => (
    <div className="between" style={{ marginBottom: 6, alignItems: 'center' }}>
      <h2 className="h2">{title}</h2>
      <button className="btn sm" aria-pressed={tidy === list} onClick={() => setTidy(tidy === list ? null : list)}>{tidy === list ? 'Done' : 'Edit'}</button>
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
          <span className="mono mut">{date === today ? 'Logging now' : `Adding to ${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}`}</span>
          <h1 className="title">Add food</h1>
          <StillToGo date={date} />
        </div>
        <button className="btn" onClick={back}>Done</button>
      </header>

      <div className="page">
        <label className="search">
          <span className="mut"><Icon name="search" size={20} /></span>
          <input ref={searchRef} aria-label="Search foods" placeholder="Search foods or products" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
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
            <div className="stack" style={{ gap: 6 }}>
              <span className="mono mut">Browse</span>
              <div className="quick" role="group" aria-label="Browse foods">
                {BROWSE.map(([id, label]) => (
                  <button key={id} className="chip" aria-pressed={browse === id} onClick={() => setBrowse(browse === id ? null : id)}>{label}</button>
                ))}
              </div>
            </div>
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
            <div className="stack" style={{ gap: 8 }}>
              {hasAi(s.settings) && <button className="btn dashed" style={{ width: '100%' }} onClick={() => setSheet('text')}>Not here? Describe “{q}” to the AI</button>}
              <button className="btn dashed" style={{ width: '100%' }} onClick={() => setSheet('manual')}><Icon name="pencil" size={16} /> Enter “{q}” with your own numbers</button>
            </div>
          </section>
        ) : browse ? (
          <section>
            <div className="between" style={{ marginBottom: 6, alignItems: 'center' }}>
              <h2 className="h2">{BROWSE.find(([id]) => id === browse)?.[1]}</h2>
              <button className="btn sm" onClick={() => setBrowse(null)}>Close</button>
            </div>
            {browsed.length ? browsed.map((f) => row(f, f.barcode ? 'off' : 'db')) : <p className="empty">Nothing here yet.</p>}
          </section>
        ) : (
          <>
            {usual.length > 0 && (
              <section>
                <div className="between" style={{ marginBottom: 6 }}>
                  <h2 className="h2">Usual meals</h2>
                  <span className="mono mut">Foods you log together</span>
                </div>
                {usual.map((g) => (
                  <div key={g.key} className="item">
                    <button className="item-btn" onClick={() => logMeal(g)}>
                      <span>{g.items.map((e) => (e.qty !== 1 ? `${e.qty}× ${e.name}` : e.name)).join(' + ')}</span>
                      <span className="mono mut">{energy(g.kcal, unit)} {unit} · {fmt(g.protein)} g P{g.count > 1 ? ` · ${g.count}× in 2 weeks` : ''}</span>
                    </button>
                    <button className="btn icon" aria-label={`Log ${g.items.map((e) => e.name).join(', ')}`} onClick={() => logMeal(g)}>+</button>
                  </div>
                ))}
              </section>
            )}
            {s.favourites.length > 0 && (
              <section>
                {listHead('Favourites', 'fav')}
                {tidy === 'fav' && <p className="small mut" style={{ margin: '-2px 0 4px' }}>Tap a favourite to change its name or numbers. Arrows set the order (also used by Quick log on Today).</p>}
                {s.favourites.map((f, i) =>
                  tidy === 'fav'
                    ? row(
                        f,
                        f.barcode ? 'off' : 'db',
                        () => { s.toggleFavourite(f); toast(`Removed ${f.name} from favourites`, 0, { label: 'Undo', run: () => useStore.getState().toggleFavourite(f) }); },
                        () => setEditingFav(f),
                        { up: i > 0, down: i < s.favourites.length - 1 },
                      )
                    : row(f, f.barcode ? 'off' : 'db'),
                )}
              </section>
            )}
            <section>
              {s.recents.length ? listHead('Recent', 'recent') : <h2 className="h2" style={{ marginBottom: 6 }}>Recent</h2>}
              {s.recents.length ? s.recents.slice(0, allRecent ? undefined : 12).map((f) => row(f, f.barcode ? 'off' : 'db', tidy === 'recent' ? () => s.removeRecent(f.name) : undefined)) : <p className="empty">Foods you log show up here for one-tap adding.</p>}
              {s.recents.length > 12 && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAllRecent(!allRecent)}>{allRecent ? 'Show fewer' : `Show all ${s.recents.length}`}</button>}
            </section>
          </>
        )}
      </div>

      {editingFav && <FavEditSheet food={editingFav} onClose={() => setEditingFav(null)} />}
      {picked && (
        <AddSheet
          date={date}
          picked={picked}
          onClose={() => {
            setPicked(null);
            if (fromLink.current) back();
          }}
        />
      )}
      {sheet === 'manual' && <ManualSheet date={date} initialName={q.trim()} onClose={closeSheet} />}
      {sheet === 'scan' && (
        <Scanner
          onClose={closeSheet}
          onFound={(food) => {
            setSheet(null);
            setPicked({ food, source: 'scan' });
          }}
          onReadLabel={() => setSheet('label')}
          onManual={() => setSheet('manual')}
          known={[...s.favourites, ...s.recents]}
        />
      )}
      {(sheet === 'photo' || sheet === 'label' || sheet === 'text') && <AiSheet mode={sheet} date={date} initialText={sheet === 'text' ? q : ''} onClose={closeSheet} />}
    </>
  );
}

function AddSheet({ date, picked, onClose }: { date: string; picked: Picked; onClose: () => void }) {
  const s = useStore();
  const { source } = picked;
  // Live, so saving a recipe edit here updates the numbers straight away.
  const food = withEdit(picked.food, s.recipeEdits);
  const byGrams = !!food.per100;
  const [useGrams, setUseGrams] = useState(false);
  // Starts at the amount you had last time.
  const [qty, setQty] = useState(() => lastQty(s.days, todayKey(), food.name, food.serving));
  const [grams, setGrams] = useState(food.servingGrams ?? 100);
  const m = useGrams && food.per100 ? forGrams(food.per100, grams) : scale(foodMacros(food), qty);
  const fav = s.favourites.some((f) => f.name.toLowerCase() === food.name.toLowerCase());
  const xp = XP.meal + (source === 'scan' ? XP.scan : 0);
  const recipe = recipeFor(food, s.recipeEdits);
  const when = useEatenAt(date);

  const add = () => {
    const entry =
      useGrams && food.per100
        ? { name: food.name, serving: `${grams} g`, base: m, qty: 1 }
        : { name: food.name, serving: food.serving, base: foodMacros(food), qty };
    const ids = s.addEntries(date, [{ ...entry, source, foodId: food.id }], [food], when.at);
    toastAdded(`Added ${food.name}`, xp, date, ids);
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
        <Stepper value={grams} onChange={setGrams} step={10} min={5} max={5000} label="grams" unit="g" />
      ) : (
        <Stepper value={qty} onChange={setQty} label="servings" presets={SERVING_PRESETS} />
      )}
      <MacroGrid {...m} unit={s.settings.unit} />
      <Coverage m={m} date={date} />
      <TimeField value={when.hhmm} onChange={when.setHhmm} />
      {recipe && (
        <details className="rule">
          <summary style={{ minHeight: 48, display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}>Recipe and method</summary>
          <div style={{ paddingBottom: 8 }}><RecipeView recipe={recipe} editable /></div>
        </details>
      )}
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

function ManualSheet({ date, initialName = '', onClose }: { date: string; initialName?: string; onClose: () => void }) {
  const s = useStore();
  const unit = s.settings.unit;
  const [f, setF] = useState({ name: initialName.slice(0, 60), serving: '', energy: '', protein: '', carbs: '', fat: '', fav: false });
  const n = (v: string) => Math.max(0, parseFloat(v) || 0);
  const kcal = unit === 'kJ' ? n(f.energy) / KJ : n(f.energy);
  const ok = kcal > 0;
  const when = useEatenAt(date);
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'fav' ? e.target.checked : e.target.value });

  const build = (): Food => ({
    id: `fav-${Date.now().toString(36)}`,
    name: f.name.trim().slice(0, 60) || 'Quick add',
    serving: f.serving.trim() || '1 serve',
    kcal: Math.round(kcal),
    protein: n(f.protein),
    carbs: n(f.carbs),
    fat: n(f.fat),
  });
  const saveOnly = () => {
    const food = build();
    if (!s.favourites.some((x) => x.name.toLowerCase() === food.name.toLowerCase())) s.toggleFavourite(food);
    toast(`Saved ${food.name} to favourites`);
    onClose();
  };
  const save = () => {
    const food = build();
    const base = { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat };
    const ids = s.addEntries(date, [{ name: food.name, serving: food.serving, base, qty: 1, source: 'custom' }], [food], when.at);
    if (f.fav) s.toggleFavourite(food);
    toastAdded(`Added ${food.name}`, XP.meal, date, ids);
    onClose();
  };

  return (
    <Sheet onClose={onClose} label="Enter food">
      <h2 className="h2" style={{ fontSize: 26 }}>Enter it yourself</h2>
      <label className="field"><span>Food (optional)</span><input className="input" value={f.name} onChange={set('name')} placeholder="Mum's paneer paratha" maxLength={60} /></label>
      <label className="field"><span>Serving</span><input className="input" value={f.serving} onChange={set('serving')} placeholder="1 paratha" maxLength={40} /></label>
      <div className="grid2">
        <label className="field"><span>Energy ({unit})</span><input className="input" inputMode="decimal" type="number" min="0" value={f.energy} onChange={set('energy')} /></label>
        <label className="field"><span>Protein (g)</span><input className="input" inputMode="decimal" type="number" min="0" value={f.protein} onChange={set('protein')} /></label>
        <label className="field"><span>Carbs (g)</span><input className="input" inputMode="decimal" type="number" min="0" value={f.carbs} onChange={set('carbs')} /></label>
        <label className="field"><span>Fat (g)</span><input className="input" inputMode="decimal" type="number" min="0" value={f.fat} onChange={set('fat')} /></label>
      </div>
      <TimeField value={when.hhmm} onChange={when.setHhmm} />
      <label className="row small"><input type="checkbox" checked={f.fav} onChange={set('fav')} style={{ width: 20, height: 20, accentColor: 'var(--fuel)' }} /> Save as a favourite for one-tap adding</label>
      <button className="btn primary block" disabled={!ok} onClick={save}>Add · +{XP.meal} XP</button>
      <button className="btn block" disabled={!ok || !f.name.trim()} onClick={saveOnly}><Icon name="star" size={16} /> Save as favourite only (don’t log)</button>
    </Sheet>
  );
}

/** Change a favourite's name, serving or numbers. */
function FavEditSheet({ food, onClose }: { food: Food; onClose: () => void }) {
  const s = useStore();
  const unit = s.settings.unit;
  const toUnit = (kcal: number) => String(Math.round(unit === 'kJ' ? kcal * KJ : kcal));
  const [f, setF] = useState({ name: food.name, serving: food.serving, energy: toUnit(food.kcal), protein: String(food.protein), carbs: String(food.carbs), fat: String(food.fat) });
  const n = (v: string) => Math.max(0, parseFloat(v) || 0);
  const kcal = f.energy === toUnit(food.kcal) ? food.kcal : Math.round(unit === 'kJ' ? n(f.energy) / KJ : n(f.energy));
  const ok = f.name.trim() && kcal > 0;
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    const numbers = { kcal, protein: n(f.protein), carbs: n(f.carbs), fat: n(f.fat) };
    const changed = (['kcal', 'protein', 'carbs', 'fat'] as const).some((k) => numbers[k] !== food[k]);
    // Per-100 g values no longer match hand-edited numbers, so drop them.
    s.updateFavourite(food.id, { name: f.name.trim().slice(0, 60), serving: f.serving.trim().slice(0, 40) || '1 serve', ...numbers, ...(changed ? { per100: undefined, servingGrams: undefined } : {}) });
    toast('Favourite saved');
    onClose();
  };
  return (
    <Sheet onClose={onClose} label={`Edit ${food.name}`}>
      <h2 className="h2" style={{ fontSize: 26 }}>Edit favourite</h2>
      <label className="field"><span>Food</span><input className="input" value={f.name} onChange={set('name')} maxLength={60} /></label>
      <label className="field"><span>One serving is</span><input className="input" value={f.serving} onChange={set('serving')} maxLength={40} /></label>
      <div className="grid2">
        <label className="field"><span>Energy ({unit})</span><input className="input" inputMode="decimal" type="number" min="0" value={f.energy} onChange={set('energy')} /></label>
        <label className="field"><span>Protein (g)</span><input className="input" inputMode="decimal" type="number" min="0" value={f.protein} onChange={set('protein')} /></label>
        <label className="field"><span>Carbs (g)</span><input className="input" inputMode="decimal" type="number" min="0" value={f.carbs} onChange={set('carbs')} /></label>
        <label className="field"><span>Fat (g)</span><input className="input" inputMode="decimal" type="number" min="0" value={f.fat} onChange={set('fat')} /></label>
      </div>
      <button className="btn primary block" disabled={!ok} onClick={save}>Save</button>
    </Sheet>
  );
}

/** One line under the numbers: how much of what's left today this portion covers. */
function Coverage({ m, date }: { m: Macros; date: string }) {
  const d = useStore((s) => s.days[date]);
  const eaten = dayTotals(d);
  const T = dayTargets(useStore((s) => s.settings.targets), d);
  const c = coverage(m, eaten, T);
  if (c.kcal === null && c.protein === null) return <p className="small mut" style={{ margin: 0 }}>Both targets are already hit for this day.</p>;
  const parts = [c.kcal !== null && `${c.kcal}% of the energy`, c.protein !== null && `${c.protein}% of the protein`].filter(Boolean).join(' and ');
  return (
    <p className="small" style={{ margin: 0, color: c.overKcal ? 'var(--warn)' : 'var(--mut)' }}>
      {c.overKcal ? 'This takes you well past your energy target for the day.' : `Covers ${parts} you still need.`}
    </p>
  );
}

/** What's left of the day's targets (with a training-day boost), under the Add food title. */
function StillToGo({ date }: { date: string }) {
  const d = useStore((s) => s.days[date]);
  const T = dayTargets(useStore((s) => s.settings.targets), d);
  const unit = useStore((s) => s.settings.unit);
  const t = dayTotals(d);
  const k = T.kcal - t.kcal;
  const p = T.protein - t.protein;
  if (k <= 0 && p <= 0) return <span className="small fuel">Both targets hit</span>;
  return (
    <span className="small mut">
      {[k > 0 && `${energy(k, unit)} ${unit}`, p > 0 && `${fmt(p)} g protein`].filter(Boolean).join(' · ')} to go
    </span>
  );
}
