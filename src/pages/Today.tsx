import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { addDays, daysSinceWeighIn, fmtDate, hhmmOf, weekStart } from '../lib/dates';
import { KJ, dayTargets, dayTotals, energy, energySplit, entryMacros, fmt, paceGap, sinceLast, timeOf } from '../lib/nutrition';
import { FOCUS_LABEL, FOODS, MOMENT_LABEL, gapFocus, gapSuggestions, momentOf, remaining } from '../lib/foods';
import { XP } from '../lib/game';
import type { Entry, Food } from '../lib/types';
import { Bar, Icon, MacroGrid, Rings, SERVING_PRESETS, Sheet, Stepper, TimeField, go, toast, toastAdded, useEatenAt, useGame, useLongPress, useNow, useRoute, useSwipe, useToday } from '../components/ui';
import RecipeView from '../components/RecipeView';
import { recipeFor, withEdit } from '../lib/recipes';
import { usePrefs, type Card, type OrderCard } from '../lib/prefs';
import { SECTION_LABEL, combineAsFood, daySummary, lastQty, lastSection, logSections, mealProteinGoal, proteinMeals } from '../lib/meals';

export default function Today() {
  const today = useToday();
  const { params } = useRoute();
  const date = params.get('d') && params.get('d')! <= today ? params.get('d')! : today;
  const isToday = date === today;
  const s = useStore();
  const g = useGame();
  const [editing, setEditing] = useState<Entry | null>(null);
  // Select mode on the log: ids of ticked entries, or null when off.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState<Entry[] | null>(null);
  useEffect(() => setPicked(null), [date]);
  const [round, setRound] = useState(0); // how many times Close the gap was refreshed
  const [open, setOpen] = useState<string | null>(null); // which idea's recipe is showing
  const hidden = usePrefs((p) => p.hidden);
  const order = usePrefs((p) => p.order);
  const ring = usePrefs((p) => p.ring);
  const flipRing = usePrefs((p) => p.flipRing);
  const boostKcal = usePrefs((p) => p.boostKcal);
  const bottleMl = usePrefs((p) => p.bottleMl);
  const show = (c: Card) => !hidden.includes(c);

  const day = s.days[date] ?? { entries: [], water: 0, checks: {} };
  const t = dayTotals(day);
  // The day's targets, including a training-day boost.
  const T = dayTargets(s.settings.targets, day);
  const unit = s.settings.unit;
  const kLeft = T.kcal - t.kcal;
  const pLeft = T.protein - t.protein;
  const waterGoal = Math.round(s.settings.waterL * 4);
  const dayXp = g.byDate.get(date)?.xp ?? 0;

  const setDate = (k: string) => (window.location.hash = k === today ? '/today' : `/today?d=${k}`);
  // Swipe right for the day before, left for the day after (not past today).
  const swipe = useSwipe(() => !isToday && setDate(addDays(date, 1)), () => setDate(addDays(date, -1)));
  // On a keyboard, ← and → do the same (not while typing or with a sheet open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('[role=dialog]') || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') setDate(addDays(date, -1));
      else if (e.key === 'ArrowRight' && !isToday) setDate(addDays(date, 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [date, isToday, today]);
  const now = new Date(useNow());
  const weekday = now.getDay() >= 1 && now.getDay() <= 5;
  const atSchool = isToday && weekday && now.getHours() >= 8 && now.getHours() < 15;
  const need = remaining(T, t);
  const focus = gapFocus(need, T);
  const hour = now.getHours() + now.getMinutes() / 60;
  const noSuggest = usePrefs((p) => p.noSuggest);
  const toggleSuggest = usePrefs((p) => p.toggleSuggest);
  const gap = isToday && show('gap')
    ? gapSuggestions(
        need,
        T,
        [...s.favourites, ...FOODS.filter((f) => f.tags)].filter((f) => !noSuggest.includes(f.name.toLowerCase())).map((f) => withEdit(f, s.recipeEdits)),
        { wheyOk: s.settings.wheyOk, atSchool, hour },
        3,
        round,
      )
    : [];

  const addFood = (f: Food) => {
    const ids = s.addEntries(date, [{ name: f.name, serving: f.serving, base: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat }, qty: 1, source: 'db', foodId: f.id }], [f]);
    toastAdded(`Added ${f.name}`, XP.meal, date, ids);
    setOpen(null);
  };

  const sections = logSections(day.entries);
  const mealGoal = mealProteinGoal(s.profile.weightKg);
  const pace = isToday && kLeft > 0 ? paceGap(t.kcal, T.kcal, hour) : null;
  // Shortcut from the app icon: #/today?add=water adds a glass. The hash check stops StrictMode's re-run adding two.
  const addParam = params.get('add');
  useEffect(() => {
    if (addParam !== 'water' || !window.location.hash.includes('add=water')) return;
    window.location.replace('#/today');
    const d = useStore.getState().days[today]?.water ?? 0;
    useStore.getState().setWater(today, d + 1);
    toast(`Glass of water added (${((d + 1) * 0.25).toFixed(2).replace(/0$/, '')} L)`, d + 1 === waterGoal ? XP.water : 0);
  }, [addParam]);
  const ago = isToday ? sinceLast(day.entries, now.getTime()) : null;
  const addWater = (n: number) => {
    s.setWater(date, day.water + n);
    if (day.water < waterGoal && day.water + n >= waterGoal) toast('Water goal hit', XP.water);
  };
  const addHref = `#/food${isToday ? '' : `?d=${date}`}`;

  // Today's movable cards, keyed by id; their order and visibility come from per-device prefs.
  const cards: Record<OrderCard, ReactNode> = {
    weigh: isToday && show('weigh') && (() => {
      const since = daysSinceWeighIn(s.weighIns, today);
      if (since !== null && since < 7) return null;
      return (
        <a href="#/progress?weigh=1" className="card tight" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink)', textDecoration: 'none' }}>
          <span className="pro"><Icon name="trend" size={22} /></span>
          <span className="grow small">{since === null ? 'Log your first weigh-in to start your trend line.' : `It’s been ${since} days since your last weigh-in. Time for a quick one?`}</span>
          <Icon name="right" size={18} />
        </a>
      );
    })(),
    quick: show('quick') && <QuickLog date={date} />,
    week: show('week') && <WeekStrip date={date} today={today} onPick={setDate} />,
    quests: (
      isToday && show('quests') && (
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
      )
    ),
    gap: (
      gap.length > 0 && (
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
                    <button
                      className="btn dark icon sm"
                      style={{ width: 34 }}
                      aria-label={`Don't suggest ${f.name}`}
                      onClick={() => {
                        toggleSuggest(f.name);
                        toast(`Won't suggest ${f.name}`, 0, { label: 'Undo', run: () => usePrefs.getState().toggleSuggest(f.name) });
                      }}
                    >
                      <Icon name="close" size={16} stroke={2.6} />
                    </button>
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
      )
    ),
    log: (
      <>
        <section className="stack" style={{ marginTop: 8 }}>
          <div className="between" style={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 8 }}>
            <div className="stack" style={{ gap: 0 }}>
              <h2 className="h2">Log</h2>
              {ago && <span className="mono mut">Last ate {ago}{ago === 'just now' ? '' : ' ago'}</span>}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            {day.entries.length > 0 && (
              <button className="btn sm" aria-pressed={!!picked} onClick={() => setPicked(picked ? null : new Set())}>{picked ? 'Done' : 'Select'}</button>
            )}
            {!picked && <label className="btn sm date-pick">
              <Icon name="copy" size={16} /> Copy from…
              <input
                type="date"
                aria-label="Copy everything from another day"
                max={addDays(date, -1)}
                value=""
                onChange={(e) => {
                  const from = e.target.value;
                  if (!from || from >= date) return;
                  const n = s.copyDay(from, date);
                  toast(n ? `Copied ${n} item${n === 1 ? '' : 's'} from ${fmtDate(from, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Nothing logged that day', Math.min(n, XP.mealCap) * XP.meal);
                }}
              />
            </label>}
            {!picked && (s.days[addDays(date, -1)]?.entries.length ?? 0) > 0 && (
              <button
                className="btn sm"
                onClick={() => {
                  const n = s.copyDay(addDays(date, -1), date);
                  toast(`Copied ${n} item${n === 1 ? '' : 's'} from the day before`, Math.min(n, XP.mealCap) * XP.meal);
                }}
              >
                Yesterday
              </button>
            )}
            </div>
          </div>
          {sections.length > 0 ? (
            <div className="card tight">
              {sections.map((sec, si) => (
                <div key={sec.entries[0].id} style={si ? { borderTop: '1px solid var(--line2)', marginTop: 4, paddingTop: 4 } : undefined}>
                  <div className="between" style={{ padding: '8px 0 2px' }}>
                    <span className="mono fuel">{SECTION_LABEL[sec.moment]}</span>
                    <span className="mono dim">
                      {energy(sec.kcal, unit)} {unit} ·{' '}
                      <span style={sec.protein >= mealGoal ? { color: 'var(--pro)' } : undefined} title={sec.protein >= mealGoal ? `${mealGoal} g+ protein` : undefined}>
                        {fmt(sec.protein)} g{sec.protein >= mealGoal ? ' ✓' : ''}
                      </span>
                    </span>
                  </div>
                  {sec.entries.map((e, i) => (
                    <button
                      key={e.id}
                      className="item-btn"
                      aria-pressed={picked ? picked.has(e.id) : undefined}
                      style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderTop: i ? '1px solid var(--line)' : 0 }}
                      onClick={() => {
                        if (!picked) return setEditing(e);
                        const next = new Set(picked);
                        if (!next.delete(e.id)) next.add(e.id);
                        setPicked(next);
                      }}
                    >
                      {picked && <span className={`check${picked.has(e.id) ? ' on' : ''}`}>{picked.has(e.id) && <Icon name="check" size={14} stroke={3.5} />}</span>}
                      <span className="mono dim" style={{ width: 64, flex: 'none' }}>{timeOf(e.at)}</span>
                      <span className="grow">{e.qty !== 1 ? `${e.qty}× ` : ''}{e.name}</span>
                      <span className="mono mut" style={{ flex: 'none' }}>{energy(entryMacros(e).kcal, unit)} · {fmt(entryMacros(e).protein)} g</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">Nothing logged {isToday ? 'yet today' : 'this day'}.</p>
          )}
          {picked && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={() => setPicked(picked.size === day.entries.length ? new Set() : new Set(day.entries.map((e) => e.id)))}>
                {picked.size === day.entries.length ? 'None' : 'All'}
              </button>
              <button
                className="btn sm danger grow"
                disabled={!picked.size}
                onClick={() => {
                  const gone = day.entries.filter((e) => picked.has(e.id));
                  gone.forEach((e) => s.removeEntry(date, e.id));
                  toast(`Removed ${gone.length} item${gone.length === 1 ? '' : 's'}`, 0, { label: 'Undo', run: () => gone.forEach((e) => useStore.getState().restoreEntry(date, e)) });
                  setPicked(null);
                }}
              >
                <Icon name="trash" size={16} /> Delete {picked.size || ''}
              </button>
              <button className="btn sm grow" disabled={picked.size < 2} title="Save the picked foods as one favourite" onClick={() => setSaving(day.entries.filter((e) => picked.has(e.id)))}>
                <Icon name="star" size={16} /> Save as meal
              </button>
              {!isToday && (
                <button
                  className="btn sm grow"
                  disabled={!picked.size}
                  onClick={() => {
                    const items = day.entries.filter((e) => picked.has(e.id)).map(({ name, serving, base, qty, source, foodId }) => ({ name, serving, base, qty, source, foodId }));
                    const ids = s.addEntries(today, items);
                    toastAdded(`Copied ${items.length} to today`, Math.min(items.length, XP.mealCap) * XP.meal, today, ids);
                    setPicked(null);
                  }}
                >
                  <Icon name="copy" size={16} /> Copy to today
                </button>
              )}
            </div>
          )}
          <a href={addHref} className="btn primary block"><Icon name="plus" size={18} stroke={3} /> Add food</a>
          {sections.length > 0 && (
            <button
              className="btn sm"
              style={{ alignSelf: 'center' }}
              onClick={async () => {
                const text = daySummary(fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }), day.entries, T, unit, timeOf);
                try {
                  if (navigator.share) await navigator.share({ text });
                  else {
                    await navigator.clipboard.writeText(text);
                    toast('Day summary copied');
                  }
                } catch (e) {
                  if ((e as Error).name !== 'AbortError') toast('Could not share. Try again.');
                }
              }}
            >
              <Icon name="copy" size={14} /> Share this day
            </button>
          )}
        </section>
      </>
    ),
    note: show('note') && <DayNote date={date} note={day.note ?? ''} />,
    water: (
      show('water') && <section className="card">
        <div className="between" style={{ alignItems: 'center' }}>
          <div className="stack" style={{ gap: 2 }}>
            <span className="mono mut">Water</span>
            <span><span className="num" style={{ fontSize: 24 }}>{(day.water * 0.25).toFixed(2).replace(/0$/, '')}</span><span className="mut small"> / {s.settings.waterL} L</span></span>
          </div>
          <div className="row">
            <button className="btn icon" aria-label="Remove a glass" onClick={() => s.setWater(date, day.water - 1)}>−</button>
            <button className="btn sm" aria-label={`Add a ${bottleMl} ml bottle`} onClick={() => addWater(bottleMl / 250)}>+{bottleMl >= 1000 ? `${bottleMl / 1000} L` : `${bottleMl} ml`}</button>
            <button className="btn icon ink" aria-label="Add a 250 ml glass" onClick={() => addWater(1)}>+</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(waterGoal, Math.ceil(day.water))}, minmax(0,1fr))`, gap: 4, marginTop: 12 }}>
          {Array.from({ length: Math.max(waterGoal, Math.ceil(day.water)) }, (_, i) => (
            // Tap a bar to set that many glasses; tapping the last full one takes it off.
            <button
              key={i}
              className="water-bar"
              aria-label={`${i + 1} glass${i ? 'es' : ''} (${((i + 1) * 0.25).toFixed(2).replace(/0$/, '')} L)`}
              onClick={() => {
                addWater((i + 1 === day.water ? i : i + 1) - day.water);
              }}
            >
              <i style={{ background: i < day.water ? 'var(--pro)' : 'var(--track)' }} />
            </button>
          ))}
        </div>
      </section>
    ),
    quality: (
      show('quality') && <section className="card">
        <div className="between"><span className="mono mut">Food quality · +5 XP each</span><a href="#/profile?open=checks" className="mono mut" style={{ textDecoration: 'none' }}>Edit</a></div>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
          {s.settings.checks.map(([k, label]) => (
            <button key={k} className="chip" aria-pressed={!!day.checks[k]} onClick={() => s.toggleCheck(date, k)}>{label}</button>
          ))}
        </div>
      </section>
    ),
    tips: (
      show('tips') && <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ways to eat more without feeling stuffed</summary>
        <ul className="small mut" style={{ paddingLeft: 18, margin: '10px 0 0', display: 'grid', gap: 6 }}>
          <li>Add a snack or a drink before making meals bigger. Three meals plus two or three snacks is easier than three huge meals.</li>
          <li>Drink some calories: a milk, banana, oats and peanut butter smoothie is about 540 kcal.</li>
          <li>Put energy-dense foods on what you already eat: ghee on rotli, peanut butter on toast, cheese and avocado in sandwiches.</li>
          <li>Keep a snack in your school bag so recess and after school never get skipped.</li>
          <li>Build up over 2 to 3 weeks. Jumping to a big target overnight usually backfires.</li>
        </ul>
      </details>
    ),
  };

  return (
    <>
      {/* Wraps on narrow screens or large text, so nothing scrolls sideways. */}
      <header className="head" style={{ flexWrap: 'wrap', rowGap: 8 }}>
        <div className="row" style={{ gap: 4, minWidth: 0 }}>
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
          {date < addDays(today, -1) && <button className="btn sm" style={{ marginLeft: 4 }} onClick={() => setDate(today)}>Today</button>}
        </div>
        <div className="row" style={{ marginLeft: 'auto' }}>
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

      <div className="page" {...swipe}>
        <div className="stack" style={{ gap: 6, marginTop: -2 }}>
          <div className="between">
            <span className="mono mut">{g.rank.name} · {fmt(g.into)} / {fmt(g.need)} XP</span>
            <span className="mono fuel">+{dayXp} {isToday ? 'today' : 'that day'}</span>
          </div>
          <Bar value={g.into} max={g.need} color="var(--fuel)" />
        </div>

        <section className="card">
          <div className="row" style={{ gap: 16 }}>
            <button className="ring-btn" onClick={flipRing} aria-label={ring === 'left' ? 'Show energy eaten' : 'Show energy to go'}>
              <Rings kcal={t.kcal} kcalMax={T.kcal} protein={t.protein} proteinMax={T.protein}>
                {ring === 'eaten' ? (
                  <>
                    <span className="num" style={{ fontSize: 'clamp(26px, 9.5vw, 40px)', lineHeight: 0.95 }}>{energy(t.kcal, unit)}</span>
                    <span className="mono mut" style={{ fontSize: 10 }}>{unit} eaten</span>
                  </>
                ) : (
                  <>
                    <span className="num" style={{ fontSize: 'clamp(26px, 9.5vw, 40px)', lineHeight: 0.95 }}>{kLeft > 0 ? energy(kLeft, unit) : '✓'}</span>
                    <span className="mono mut" style={{ fontSize: 10 }}>{kLeft > 0 ? `${unit} to go` : 'target hit'}</span>
                  </>
                )}
              </Rings>
            </button>
            <div className="stack grow" style={{ gap: 12 }}>
              <div className="stack" style={{ gap: 2 }}>
                <span className="mono fuel">Energy</span>
                <span><span className="num" style={{ fontSize: 24 }}>{energy(t.kcal, unit)}</span><span className="mut small"> / {energy(T.kcal, unit)} {unit}</span></span>
                {pace !== null && (
                  <span className="small" style={{ color: pace < -150 ? 'var(--warn)' : 'var(--mut)' }}>
                    {pace < -150 ? `${energy(-pace, unit)} ${unit} behind pace` : pace > 150 ? `${energy(pace, unit)} ${unit} ahead of pace` : 'On pace'}
                  </span>
                )}
              </div>
              <div className="stack" style={{ gap: 2 }}>
                <span className="mono pro">Protein</span>
                <span><span className="num" style={{ fontSize: 24 }}>{fmt(t.protein)}</span><span className="mut small"> / {T.protein} g</span></span>
                <span className="mut small">{pLeft > 0 ? `${fmt(pLeft)} g to go` : 'Target hit'}</span>
                <span className="mono dim">{(t.protein / s.profile.weightKg).toFixed(1)} g/kg of {(T.protein / s.profile.weightKg).toFixed(1)}</span>
                {sections.length > 0 && <span className="mono dim">{proteinMeals(sections, mealGoal)} meal{proteinMeals(sections, mealGoal) === 1 ? '' : 's'} with {mealGoal} g+</span>}
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
          {show('macros') && energySplit(t) && (() => {
            const sp = energySplit(t)!;
            return (
              <div className="stack" style={{ gap: 6, marginTop: 12 }}>
                <div className="split" role="img" aria-label={`Energy from protein ${sp.protein}%, carbs ${sp.carbs}%, fat ${sp.fat}%`}>
                  <i style={{ width: `${sp.protein}%`, background: 'var(--pro)' }} />
                  <i style={{ width: `${sp.carbs}%`, background: 'var(--carb)' }} />
                  <i style={{ width: `${sp.fat}%`, background: 'var(--fat)' }} />
                </div>
                <div className="between"><span className="mono pro">Protein {sp.protein}%</span><span className="mono" style={{ color: 'var(--carb)' }}>Carbs {sp.carbs}%</span><span className="mono mut">Fat {sp.fat}%</span></div>
              </div>
            );
          })()}
          {show('train') && (
            <div className="between rule" style={{ marginTop: 12, paddingTop: 12, alignItems: 'center', gap: 10 }}>
              <span className="small mut">{day.boost ? `Training day: target +${energy(day.boost, unit)} ${unit}` : 'Training today? Your target can go up.'}</span>
              <button className="chip" aria-pressed={!!day.boost} onClick={() => s.setBoost(date, day.boost ? 0 : boostKcal)}>
                <Icon name="bolt" size={14} /> Training day
              </button>
            </div>
          )}
        </section>

        {isToday && hour >= 18 && !day.entries.length && g.streak.current > 0 && (
          <a href="#/food" className="card tight" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink)', textDecoration: 'none', boxShadow: 'inset 0 0 0 1.5px var(--fuel)' }}>
            <span className="fuel"><Icon name="flame" size={22} stroke={2.2} /></span>
            <span className="grow small">Nothing logged today. Add anything to keep your {g.streak.current}-day streak.</span>
            <Icon name="right" size={18} />
          </a>
        )}

        {order.map((id) => <Fragment key={id}>{cards[id]}</Fragment>)}

        <a href="#/profile?open=display" className="btn sm" style={{ alignSelf: 'center' }}><Icon name="pencil" size={14} /> Customise this page</a>
      </div>

      {editing && <EditSheet date={date} entry={editing} onClose={() => setEditing(null)} />}
      {saving && <SaveMealSheet entries={saving} onClose={() => setSaving(null)} onSaved={() => { setSaving(null); setPicked(null); }} />}
    </>
  );
}

/** A short note about the day, edited in place. */
function DayNote({ date, note }: { date: string; note: string }) {
  const setNote = useStore((s) => s.setNote);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note);
  useEffect(() => setText(note), [note, date]);
  const save = () => {
    if (text.trim() !== note) setNote(date, text);
    setEditing(false);
  };
  if (editing)
    return (
      <section className="card tight stack" style={{ gap: 8 }}>
        <span className="mono mut">Note for the day</span>
        <textarea
          className="input"
          rows={2}
          maxLength={200}
          autoFocus
          value={text}
          placeholder="Gym day, felt full, school camp…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), save())}
          style={{ resize: 'none', minHeight: 64, paddingTop: 10 }}
        />
        <div className="row">
          <button className="btn sm" onClick={() => { setText(note); setEditing(false); }}>Cancel</button>
          <button className="btn sm primary grow" onClick={save}>Save note</button>
        </div>
      </section>
    );
  return (
    <button className="card tight" style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', color: 'var(--ink)', border: 0 }} onClick={() => setEditing(true)}>
      <span className="mut"><Icon name="pencil" size={18} /></span>
      <span className="grow" style={note ? undefined : { color: 'var(--mut)' }}>{note || 'Add a note for the day'}</span>
    </button>
  );
}

/** Favourites, topped up with recent foods, as one-tap chips (one serving each, with Undo). */
function QuickLog({ date }: { date: string }) {
  const favourites = useStore((s) => s.favourites);
  const recents = useStore((s) => s.recents);
  const unit = useStore((s) => s.settings.unit);
  const addEntries = useStore((s) => s.addEntries);
  const seen = new Set<string>();
  const foods = [...favourites, ...recents].filter((f) => !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase())).slice(0, 10);
  const today = useToday();
  const now = useNow();
  const link = (open: string) => `#/food?open=${open}${date === today ? '' : `&d=${date}`}`;
  const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
  const days = useStore((s) => s.days);
  const again = date === today ? lastSection(days, today, momentOf(hour)) : null;
  return (
    <section className="stack" style={{ gap: 6 }}>
      <span className="mono mut">Quick log{foods.length ? ' · tap a food for your usual amount, hold to choose' : ''}</span>
      <div className="quick">
        <a className="chip" href={link('scan')}><Icon name="barcode" size={16} /> Scan</a>
        <a className="chip" href={link('photo')}><Icon name="camera" size={16} /> Snap meal</a>
        <a className="chip" href={link('manual')}><Icon name="pencil" size={16} /> Numbers</a>
        {again && (
          <button
            className="chip"
            title={again.entries.map((e) => e.name).join(', ')}
            onClick={() => {
              const items = again.entries.map(({ name, serving, base, qty, source, foodId }) => ({ name, serving, base, qty, source, foodId }));
              const ids = addEntries(date, items);
              toastAdded(`Added ${SECTION_LABEL[momentOf(hour)].toLowerCase()} again (${items.length} food${items.length === 1 ? '' : 's'})`, Math.min(items.length, XP.mealCap) * XP.meal, date, ids);
            }}
          >
            <Icon name="copy" size={16} /> {date === today && again.date === addDays(today, -1) ? 'Yesterday’s' : 'Last'} {SECTION_LABEL[momentOf(hour)].toLowerCase()}
            <span className="mono fuel" style={{ fontSize: 11 }}>{energy(again.kcal, unit)}</span>
          </button>
        )}
        {foods.map((f) => (
          <QuickChip
            key={f.id + f.name}
            food={f}
            unit={unit}
            onTap={() => {
              const qty = lastQty(useStore.getState().days, date, f.name, f.serving);
              const ids = addEntries(date, [{ name: f.name, serving: f.serving, base: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat }, qty, source: f.barcode ? 'off' : 'db', foodId: f.id }], [f]);
              toastAdded(`Added ${qty !== 1 ? `${qty}× ` : ''}${f.name}`, XP.meal, date, ids);
            }}
            onHold={() => go(`food?add=${encodeURIComponent(f.name)}${date === today ? '' : `&d=${date}`}`)}
          />
        ))}
      </div>
    </section>
  );
}

/** A Quick log food: tap adds your usual amount, press and hold opens its sheet to choose. */
function QuickChip({ food, unit, onTap, onHold }: { food: Food; unit: 'kcal' | 'kJ'; onTap: () => void; onHold: () => void }) {
  const press = useLongPress(onHold);
  return (
    <button className="chip" {...press.handlers} onClick={() => !press.wasLong() && onTap()} style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}>
      {food.name.length > 22 ? `${food.name.slice(0, 21)}…` : food.name}
      <span className="mono fuel" style={{ fontSize: 11 }}>{energy(food.kcal, unit)}</span>
    </button>
  );
}

/** Monday to Sunday of the shown day's week: energy and protein against target. Tap a day to open it. */
function WeekStrip({ date, today, onPick }: { date: string; today: string; onPick: (k: string) => void }) {
  const days = useStore((s) => s.days);
  const T = useStore((s) => s.settings.targets);
  const start = weekStart(date);
  const H = 56;
  const bar = (frac: number, color: string) => <i style={{ height: Math.max(3, Math.min(1, frac) * H), background: color }} />;
  return (
    <section className="card tight">
      <div className="between" style={{ marginBottom: 8 }}>
        <span className="mono mut">This week</span>
        <span className="mono dim">Energy · protein</span>
      </div>
      <div className="week">
        {Array.from({ length: 7 }, (_, i) => {
          const k = addDays(start, i);
          const t = dayTotals(days[k]);
          const future = k > today;
          return (
            <button key={k} className="week-day" aria-current={k === date ? 'date' : undefined} disabled={future} aria-label={`${fmtDate(k, { weekday: 'long' })}: ${fmt(t.kcal)} kcal, ${fmt(t.protein)} g protein`} onClick={() => onPick(k)}>
              <span className="week-bars" style={{ height: H }}>
                {bar(t.kcal / dayTargets(T, days[k]).kcal, 'var(--fuel)')}
                {bar(t.protein / T.protein, 'var(--pro)')}
              </span>
              <span className="mono" style={{ fontSize: 11 }}>{fmtDate(k, { weekday: 'narrow' })}</span>
              <span className="week-marks" aria-hidden="true">
                {days[k]?.boost ? <Icon name="bolt" size={10} stroke={2.6} /> : null}
                {days[k]?.note ? <i /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function EditSheet({ date, entry, onClose }: { date: string; entry: Entry; onClose: () => void }) {
  const s = useStore();
  const today = useToday();
  const [qty, setQty] = useState(entry.qty);
  const [day, setDay] = useState(date);
  const when = useEatenAt(day, entry.at);
  const unit = s.settings.unit;
  // Name and per-serving numbers, editable to correct an estimate after logging.
  const toUnit = (kcal: number) => String(Math.round(unit === 'kJ' ? kcal * KJ : kcal));
  const [info, setInfo] = useState({ name: entry.name, serving: entry.serving, energy: toUnit(entry.base.kcal), protein: String(entry.base.protein), carbs: String(entry.base.carbs), fat: String(entry.base.fat) });
  const n = (v: string) => Math.max(0, parseFloat(v) || 0);
  const kcalIn = unit === 'kJ' ? n(info.energy) / KJ : n(info.energy);
  const base = info.energy === toUnit(entry.base.kcal) ? { ...entry.base } : { ...entry.base, kcal: Math.round(kcalIn) };
  base.protein = n(info.protein);
  base.carbs = n(info.carbs);
  base.fat = n(info.fat);
  const name = info.name.trim().slice(0, 80) || entry.name;
  const infoPatch = name !== entry.name || info.serving !== entry.serving || (['kcal', 'protein', 'carbs', 'fat'] as const).some((k) => base[k] !== entry.base[k]) ? { name, serving: info.serving.trim().slice(0, 60), base } : {};
  const field = (k: keyof typeof info, label: string, numeric = true) => (
    <label className="field">
      <span>{label}</span>
      <input className="input" value={info[k]} inputMode={numeric ? 'decimal' : undefined} type={numeric ? 'number' : 'text'} min={numeric ? '0' : undefined} onChange={(e) => setInfo({ ...info, [k]: e.target.value })} />
    </label>
  );
  const m = entryMacros({ ...entry, ...infoPatch, qty });
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
      <label className="field">
        <span>Day eaten</span>
        <input className="input" type="date" max={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value <= today ? e.target.value : today)} aria-label="Day eaten" />
      </label>
      <details className="rule">
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}>Change name or numbers</summary>
        <div className="stack" style={{ gap: 10, paddingBottom: 6 }}>
          {field('name', 'Food', false)}
          {field('serving', 'One serving is', false)}
          <div className="grid2">
            {field('energy', `Energy per serving (${unit})`)}
            {field('protein', 'Protein (g)')}
            {field('carbs', 'Carbs (g)')}
            {field('fat', 'Fat (g)')}
          </div>
        </div>
      </details>
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
        <button
          className="btn primary grow"
          onClick={() => {
            if (day !== date) {
              s.moveEntry(date, day, { ...entry, qty, ...infoPatch, at: when.at });
              toast(`Moved to ${fmtDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}`);
            } else s.updateEntry(date, entry.id, { qty, ...infoPatch, ...(when.hhmm === hhmmOf(entry.at) ? {} : { at: when.at }) });
            onClose();
          }}
        >
          {day !== date ? 'Move' : 'Save'}
        </button>
      </div>
      <button
        className="btn dashed"
        onClick={() => {
          const ids = s.addEntries(today, [{ name: entry.name, serving: entry.serving, base: entry.base, ...infoPatch, qty, source: entry.source, foodId: entry.foodId }]);
          toastAdded(`Logged ${name} again${date === today ? '' : ' today'}`, XP.meal, today, ids);
          onClose();
        }}
      >
        <Icon name="copy" size={16} /> Have it again now
      </button>
    </Sheet>
  );
}

/** Name the picked foods and save them as one favourite, so the whole meal logs in a tap. */
function SaveMealSheet({ entries, onClose, onSaved }: { entries: Entry[]; onClose: () => void; onSaved: () => void }) {
  const favourites = useStore((s) => s.favourites);
  const unit = useStore((s) => s.settings.unit);
  const first = new Date(Math.min(...entries.map((e) => e.at)));
  const [name, setName] = useState(`My ${SECTION_LABEL[momentOf(first.getHours() + first.getMinutes() / 60)].toLowerCase()}`);
  const food = combineAsFood(entries, name);
  const taken = favourites.some((f) => f.name.toLowerCase() === food.name.toLowerCase());
  const save = () => {
    if (!food.name || taken) return;
    useStore.getState().toggleFavourite(food);
    toast(`Saved ${food.name} to favourites. It’s in Quick log now.`);
    onSaved();
  };
  return (
    <Sheet onClose={onClose} label="Save as meal">
      <div className="stack" style={{ gap: 2 }}>
        <span className="mono mut">{entries.length} foods as one favourite</span>
        <h2 className="h2" style={{ fontSize: 26 }}>Save as meal</h2>
      </div>
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </label>
      {taken && <span className="small" style={{ color: 'var(--warn)' }}>You already have a favourite called {food.name}.</span>}
      <p className="small mut" style={{ margin: 0 }}>{food.serving}</p>
      <MacroGrid kcal={food.kcal} protein={food.protein} carbs={food.carbs} fat={food.fat} unit={unit} />
      <button className="btn primary block" disabled={!food.name || taken} onClick={save}>Save to favourites</button>
    </Sheet>
  );
}
