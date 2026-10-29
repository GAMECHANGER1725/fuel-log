import { useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, fmtDate, hhmmOf } from '../lib/dates';
import { dayTotals, energy, entryMacros, fmt, timeOf } from '../lib/nutrition';
import { FOCUS_LABEL, FOODS, MOMENT_LABEL, gapFocus, gapSuggestions, momentOf, remaining } from '../lib/foods';
import { XP } from '../lib/game';
import type { Entry, Food } from '../lib/types';
import { Bar, Icon, MacroGrid, Rings, SERVING_PRESETS, Sheet, Stepper, TimeField, toast, useEatenAt, useGame, useRoute, useToday } from '../components/ui';
import RecipeView from '../components/RecipeView';
import { recipeFor, withEdit } from '../lib/recipes';
import { usePrefs, type Card } from '../lib/prefs';

const CHECKS: [string, string][] = [
  ['veg', 'Fruit or veg'],
  ['protein', 'Protein each meal'],
  ['grains', 'Whole grains'],
  ['nosugar', 'No sugary drinks'],
];

export default function Today() {
  const today = useToday();
  const { params } = useRoute();
  const date = params.get('d') && params.get('d')! <= today ? params.get('d')! : today;
  const isToday = date === today;
  const s = useStore();
  const g = useGame();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [round, setRound] = useState(0); // how many times Close the gap was refreshed
  const [open, setOpen] = useState<string | null>(null); // which idea's recipe is showing
  const hidden = usePrefs((p) => p.hidden);
  const show = (c: Card) => !hidden.includes(c);

  const day = s.days[date] ?? { entries: [], water: 0, checks: {} };
  const t = dayTotals(day);
  const T = s.settings.targets;
  const unit = s.settings.unit;
  const kLeft = T.kcal - t.kcal;
  const pLeft = T.protein - t.protein;
  const waterGoal = Math.round(s.settings.waterL * 4);
  const dayXp = g.byDate.get(date)?.xp ?? 0;

  const setDate = (k: string) => (window.location.hash = k === today ? '/today' : `/today?d=${k}`);
  const now = new Date();
  const weekday = now.getDay() >= 1 && now.getDay() <= 5;
  const atSchool = isToday && weekday && now.getHours() >= 8 && now.getHours() < 15;
  const need = remaining(T, t);
  const focus = gapFocus(need, T);
  const hour = now.getHours() + now.getMinutes() / 60;
  const gap = isToday && show('gap')
    ? gapSuggestions(need, T, [...s.favourites, ...FOODS.filter((f) => f.tags)].map((f) => withEdit(f, s.recipeEdits)), { wheyOk: s.settings.wheyOk, atSchool, hour }, 3, round)
    : [];

  const addFood = (f: Food) => {
    s.addEntries(date, [{ name: f.name, serving: f.serving, base: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat }, qty: 1, source: 'db', foodId: f.id }], [f]);
    toast(`Added ${f.name}`, XP.meal);
    setOpen(null);
  };

  const log = [...day.entries].sort((a, b) => a.at - b.at);
  const addHref = `#/food${isToday ? '' : `?d=${date}`}`;

  return (
    <>
      <header className="head">
        <div className="row" style={{ gap: 4 }}>
          <button className="btn icon sm" style={{ width: 36 }} aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            <Icon name="left" size={18} />
          </button>
          <label className="stack date-pick" style={{ gap: 2, padding: '0 6px' }}>
            <span className="mono mut">{fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })} ▾</span>
            <h1 className="title">{isToday ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : fmtDate(date, { weekday: 'long' })}</h1>
            <input type="date" aria-label="Pick a day" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value <= today ? e.target.value : today)} />
          </label>
          {!isToday && (
            <button className="btn icon sm" style={{ width: 36 }} aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
              <Icon name="right" size={18} />
            </button>
          )}
        </div>
        <div className="row">
          {date < addDays(today, -1) && <button className="btn sm" onClick={() => setDate(today)}>Today</button>}
          <a href="#/profile" className="btn sm" aria-label={`Streak ${g.streak.current} days`}>
            <span className="fuel"><Icon name="flame" size={16} stroke={2.2} /></span>
            <span className="num" style={{ fontSize: 20 }}>{g.streak.current}</span>
          </a>
          <a href="#/profile" className="btn sm ink" aria-label={`Level ${g.level}`}>
            <span className="mono">Lv</span>
            <span className="num" style={{ fontSize: 20 }}>{g.level}</span>
          </a>
        </div>
      </header>

      <div className="page">
        <div className="stack" style={{ gap: 6, marginTop: -2 }}>
          <div className="between">
            <span className="mono mut">{g.rank.name} · {fmt(g.into)} / {fmt(g.need)} XP</span>
            <span className="mono fuel">+{dayXp} {isToday ? 'today' : 'that day'}</span>
          </div>
          <Bar value={g.into} max={g.need} color="var(--fuel)" />
        </div>

        <section className="card">
          <div className="row" style={{ gap: 16 }}>
            <Rings kcal={t.kcal} kcalMax={T.kcal} protein={t.protein} proteinMax={T.protein}>
              <span className="num" style={{ fontSize: 40, lineHeight: 0.95 }}>{kLeft > 0 ? energy(kLeft, unit) : '✓'}</span>
              <span className="mono mut" style={{ fontSize: 10 }}>{kLeft > 0 ? `${unit} to go` : 'target hit'}</span>
            </Rings>
            <div className="stack grow" style={{ gap: 12 }}>
              <div className="stack" style={{ gap: 2 }}>
                <span className="mono fuel">Energy</span>
                <span><span className="num" style={{ fontSize: 24 }}>{energy(t.kcal, unit)}</span><span className="mut small"> / {energy(T.kcal, unit)} {unit}</span></span>
              </div>
              <div className="stack" style={{ gap: 2 }}>
                <span className="mono pro">Protein</span>
                <span><span className="num" style={{ fontSize: 24 }}>{fmt(t.protein)}</span><span className="mut small"> / {T.protein} g</span></span>
                <span className="mut small">{pLeft > 0 ? `${fmt(pLeft)} g to go` : 'Target hit'}</span>
              </div>
            </div>
          </div>
          {show('macros') && <div className="grid2 rule" style={{ marginTop: 14, paddingTop: 14, gap: 12 }}>
            <div className="stack" style={{ gap: 6 }}>
              <div className="between"><span className="mono mut">Carbs</span><span className="small">{fmt(t.carbs)} / {T.carbs} g</span></div>
              <Bar value={t.carbs} max={T.carbs} color="var(--carb)" />
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <div className="between"><span className="mono mut">Fat</span><span className="small">{fmt(t.fat)} / {T.fat} g</span></div>
              <Bar value={t.fat} max={T.fat} color="var(--fat)" />
            </div>
          </div>}
        </section>

        {isToday && show('quests') && (
          <section className="card">
            <div className="between" style={{ marginBottom: 10 }}>
              <h2 className="h2">Daily quests</h2>
              <span className="mono mut">{g.quests.filter((q) => q.isDone).length} / 3 done</span>
            </div>
            {g.quests.map((q) => (
              <div key={q.id} className="item" style={{ padding: '10px 0' }}>
                <span className={`check${q.isDone ? ' on' : ''}`}>{q.isDone && <Icon name="check" size={14} stroke={3.5} />}</span>
                <span className="grow" style={q.isDone ? { color: 'var(--mut)', textDecoration: 'line-through' } : undefined}>{q.title}</span>
                <span className={`mono ${q.isDone ? 'fuel' : 'mut'}`}>+{q.xp} XP</span>
              </div>
            ))}
          </section>
        )}

        {gap.length > 0 && (
          <section className="card hot">
            <div className="between" style={{ alignItems: 'center' }}>
              <h2 className="h2">Close the gap</h2>
              <button
                className="btn dark sm"
                aria-label="Show different ideas"
                onClick={() => {
                  setRound(round + 1);
                  setOpen(null);
                }}
              >
                <Icon name="refresh" size={16} /> Refresh
              </button>
            </div>
            <p className="small" style={{ margin: '6px 0 12px' }}>
              {energy(Math.max(0, kLeft), unit)} {unit} and {fmt(Math.max(0, pLeft))} g protein to go. Ideas for <b>{MOMENT_LABEL[momentOf(hour)]}</b>{focus && <>, heavy on <b>{FOCUS_LABEL[focus]}</b> because it’s your lowest</>}.{atSchool ? ' These are easy to eat at school.' : ''} Tap an idea for the recipe, or + to log it.
            </p>
            <div className="stack">
              {gap.map((f) => {
                const recipe = recipeFor(f, s.recipeEdits);
                const isOpen = open === f.id;
                return (
                  <div key={f.id} className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        className="btn dark grow"
                        aria-expanded={isOpen}
                        style={{ justifyContent: 'space-between', minHeight: 48, fontWeight: 500, whiteSpace: 'normal', textAlign: 'left', gap: 8 }}
                        onClick={() => setOpen(isOpen ? null : f.id)}
                      >
                        <span>{f.name}</span>
                        <span className="row" style={{ gap: 8, flex: 'none' }}>
                          <span className="mono fuel">{energy(f.kcal, unit)} · {f.protein} g</span>
                          <span style={{ display: 'flex', transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}><Icon name="right" size={16} /></span>
                        </span>
                      </button>
                      <button className="btn dark icon" aria-label={`Log ${f.name}`} onClick={() => addFood(f)}>+</button>
                    </div>
                    {isOpen && (
                      <div className="stack" style={{ background: 'var(--s1)', color: 'var(--ink)', borderRadius: 18, padding: 14, gap: 12 }}>
                        {recipe ? <RecipeView recipe={recipe} editable /> : <p className="small mut">Nothing to make: {f.serving}.</p>}
                        <button className="btn primary block" onClick={() => addFood(f)}>Log it · +{XP.meal} XP</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <a href="#/coach" className="btn dark block" style={{ marginTop: 10 }}>
              <Icon name="bolt" size={18} /> 5, 10 and 20 min ideas from your coach
            </a>
          </section>
        )}

        <section className="stack" style={{ marginTop: 8 }}>
          <div className="between" style={{ alignItems: 'center' }}>
            <h2 className="h2">Log</h2>
            {(s.days[addDays(date, -1)]?.entries.length ?? 0) > 0 && (
              <button
                className="btn sm"
                onClick={() => {
                  const n = s.copyDay(addDays(date, -1), date);
                  toast(`Copied ${n} item${n === 1 ? '' : 's'} from the day before`, Math.min(n, XP.mealCap) * XP.meal);
                }}
              >
                <Icon name="copy" size={16} /> Copy yesterday
              </button>
            )}
          </div>
          {log.length > 0 ? (
            <div className="card tight">
              {log.map((e, i) => (
                <button key={e.id} className="item-btn" style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderTop: i ? '1px solid var(--line)' : 0 }} onClick={() => setEditing(e)}>
                  <span className="mono dim" style={{ width: 64, flex: 'none' }}>{timeOf(e.at)}</span>
                  <span className="grow">{e.qty !== 1 ? `${e.qty}× ` : ''}{e.name}</span>
                  <span className="mono mut" style={{ flex: 'none' }}>{energy(entryMacros(e).kcal, unit)} · {fmt(entryMacros(e).protein)} g</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">Nothing logged {isToday ? 'yet today' : 'this day'}.</p>
          )}
          <a href={addHref} className="btn primary block"><Icon name="plus" size={18} stroke={3} /> Add food</a>
        </section>

        {show('water') && <section className="card">
          <div className="between" style={{ alignItems: 'center' }}>
            <div className="stack" style={{ gap: 2 }}>
              <span className="mono mut">Water</span>
              <span><span className="num" style={{ fontSize: 24 }}>{(day.water * 0.25).toFixed(2).replace(/0$/, '')}</span><span className="mut small"> / {s.settings.waterL} L</span></span>
            </div>
            <div className="row">
              <button className="btn icon" aria-label="Remove a glass" onClick={() => s.setWater(date, day.water - 1)}>−</button>
              <button className="btn icon ink" aria-label="Add a 250 ml glass" onClick={() => { s.setWater(date, day.water + 1); if (day.water + 1 === waterGoal) toast('Water goal hit', XP.water); }}>+</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(waterGoal, day.water)}, minmax(0,1fr))`, gap: 4, marginTop: 12 }}>
            {Array.from({ length: Math.max(waterGoal, day.water) }, (_, i) => (
              <div key={i} style={{ height: 10, background: i < day.water ? 'var(--pro)' : 'var(--track)' }} />
            ))}
          </div>
        </section>}

        {show('quality') && <section className="card">
          <span className="mono mut">Food quality · +5 XP each</span>
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            {CHECKS.map(([k, label]) => (
              <button key={k} className="chip" aria-pressed={!!day.checks[k]} onClick={() => s.toggleCheck(date, k)}>{label}</button>
            ))}
          </div>
        </section>}

        {show('tips') && <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ways to eat more without feeling stuffed</summary>
          <ul className="small mut" style={{ paddingLeft: 18, margin: '10px 0 0', display: 'grid', gap: 6 }}>
            <li>Add a snack or a drink before making meals bigger. Three meals plus two or three snacks is easier than three huge meals.</li>
            <li>Drink some calories: a milk, banana, oats and peanut butter smoothie is about 540 kcal.</li>
            <li>Put energy-dense foods on what you already eat: ghee on rotli, peanut butter on toast, cheese and avocado in sandwiches.</li>
            <li>Keep a snack in your school bag so recess and after school never get skipped.</li>
            <li>Build up over 2 to 3 weeks. Jumping to a big target overnight usually backfires.</li>
          </ul>
        </details>}

        <a href="#/profile?open=display" className="btn sm" style={{ alignSelf: 'center' }}><Icon name="pencil" size={14} /> Customise this page</a>
      </div>

      {editing && <EditSheet date={date} entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditSheet({ date, entry, onClose }: { date: string; entry: Entry; onClose: () => void }) {
  const s = useStore();
  const today = useToday();
  const [qty, setQty] = useState(entry.qty);
  const when = useEatenAt(date, entry.at);
  const m = entryMacros({ ...entry, qty });
  const fav = s.favourites.some((f) => f.name.toLowerCase() === entry.name.toLowerCase());
  return (
    <Sheet onClose={onClose} label={`Edit ${entry.name}`}>
      <div className="stack" style={{ gap: 2 }}>
        <span className="mono mut">Logged {timeOf(entry.at)}{entry.serving ? ` · ${entry.serving}` : ''}</span>
        <h2 className="h2" style={{ fontSize: 26 }}>{entry.name}</h2>
      </div>
      <Stepper value={qty} onChange={setQty} label="servings" presets={SERVING_PRESETS} />
      <MacroGrid {...m} unit={s.settings.unit} />
      <TimeField value={when.hhmm} onChange={when.setHhmm} />
      <div className="row">
        <button
          className="btn danger"
          aria-label="Delete"
          onClick={() => {
            s.removeEntry(date, entry.id);
            toast(`Removed ${entry.name}`, 0, { label: 'Undo', run: () => useStore.getState().restoreEntry(date, entry) });
            onClose();
          }}
        >
          <Icon name="trash" size={18} />
        </button>
        <button
          className="btn"
          aria-pressed={fav}
          aria-label={fav ? 'Remove from favourites' : 'Save as favourite'}
          style={fav ? { color: 'var(--fuel)', borderColor: 'var(--fuel)' } : undefined}
          onClick={() => {
            s.toggleFavourite({ id: entry.foodId ?? entry.id, name: entry.name, serving: entry.serving || '1 serve', ...entry.base });
            toast(fav ? 'Removed from favourites' : 'Saved to favourites');
          }}
        >
          <Icon name="star" size={18} />
        </button>
        <button className="btn primary grow" onClick={() => { s.updateEntry(date, entry.id, when.hhmm === hhmmOf(entry.at) ? { qty } : { qty, at: when.at }); onClose(); }}>Save</button>
      </div>
      <button
        className="btn dashed"
        onClick={() => {
          s.addEntries(today, [{ name: entry.name, serving: entry.serving, base: entry.base, qty, source: entry.source, foodId: entry.foodId }]);
          toast(`Logged ${entry.name} again${date === today ? '' : ' today'}`, XP.meal);
          onClose();
        }}
      >
        <Icon name="copy" size={16} /> Have it again now
      </button>
    </Sheet>
  );
}
