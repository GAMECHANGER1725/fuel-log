import { useState } from 'react';
import { useStore, dataOf } from '../lib/store';
import { addDays, dateOf, daysBetween, fmtDate, weekStart } from '../lib/dates';
import { dayTotals, energy, fmt, r1 } from '../lib/nutrition';
import { chartWindow, goalProgress, projectedDate, trendLine, weeklyNudge, weeklyRate, withKcal } from '../lib/targets';

import { XP } from '../lib/game';
import { useCoach } from '../lib/coach';
import { records, topFoods, weekStats, weekSummary } from '../lib/meals';
import { hasAi } from '../lib/ai';
import { Bar, Icon, Sheet, toast, useGame, useRoute, useToday } from '../components/ui';

export default function Progress() {
  const today = useToday();
  const s = useStore();
  const g = useGame();
  // #/progress?weigh=1 (from Today's reminder) opens the weigh-in sheet.
  const { params } = useRoute();
  const [weighing, setWeighing] = useState(params.get('weigh') === '1');
  const unit = s.settings.unit;

  const line = trendLine(s.weighIns);
  const latest = line[line.length - 1];
  const rate = weeklyRate(s.weighIns, today);
  const since = line.length >= 2 ? latest.trend - line[0].trend : null;
  // With the coach checking in by itself, its weekly targets replace this simpler nudge.
  const coachAuto = useCoach((c) => c.auto) && hasAi(s.settings);
  const nudge = coachAuto ? null : weeklyNudge(dataOf(s), today);
  const proj = latest ? projectedDate(latest.trend, s.profile.goalKg, rate, today) : null;

  // Heatmap: 5 weeks, Monday first; ‹ › page back through older 5-week stretches.
  const [page, setPage] = useState(0);
  const [span, setSpan] = useState<number | null>(56);
  const firstDay = g.stats[0]?.date ?? today;
  const start = addDays(weekStart(today), -28 - page * 35);
  const cells = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const olderExists = start > weekStart(firstDay);
  const elapsed = cells.filter((k) => k < today && k >= firstDay);
  const hitBoth = elapsed.filter((k) => {
    const st = g.byDate.get(k);
    return st?.hitKcal && st.hitProtein;
  }).length;

  // Weekly averages over logged days.
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(weekStart(today), -7 * i)).filter((w) => w >= weekStart(firstDay)).map((w) => {
    const logged = Array.from({ length: 7 }, (_, i) => s.days[addDays(w, i)]).filter((d) => d?.entries.length);
    const t = logged.map(dayTotals);
    return {
      w,
      n: logged.length,
      kcal: t.length ? t.reduce((a, b) => a + b.kcal, 0) / t.length : null,
      protein: t.length ? t.reduce((a, b) => a + b.protein, 0) / t.length : null,
    };
  });

  return (
    <>
      <header className="head" style={{ alignItems: 'flex-end' }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="mono mut">{s.weighIns.length} weigh-in{s.weighIns.length === 1 ? '' : 's'}</span>
          <h1 className="title">Progress</h1>
        </div>
        <button className="btn ink" onClick={() => setWeighing(true)}>Weigh in</button>
      </header>

      <div className="page">
        <section className="card">
          <div className="grid3">
            <Stat label="Trend" value={latest ? r1(latest.trend).toFixed(1) : '–'} unit=" kg" />
            <Stat label="Per week" value={rate === null ? '–' : `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}`} color={rate === null ? undefined : rate < s.settings.gainLow ? 'var(--carb)' : rate > s.settings.gainHigh * 1.4 ? 'var(--danger)' : 'var(--fuel)'} />
            <Stat label="Since start" value={since === null ? '–' : `${since >= 0 ? '+' : ''}${since.toFixed(1)}`} color="var(--fuel)" />
          </div>
          {line.length >= 2 && daysBetween(line[0].date, today) > 56 && (
            <div className="row" style={{ gap: 6, marginTop: 12 }} role="group" aria-label="Chart range">
              {([[56, '8 weeks'], [182, '6 months'], [null, 'All']] as const).map(([d, label]) => (
                <button key={label} className="chip" aria-pressed={span === d} onClick={() => setSpan(d)}>{label}</button>
              ))}
            </div>
          )}
          <WeightChart line={line} today={today} low={s.settings.gainLow} high={s.settings.gainHigh} span={span} />
          <p className="small mut" style={{ marginTop: 8 }}>
            {rate === null
              ? 'Weigh in once or twice a week: same morning, before breakfast, same scales. The trend appears after two weigh-ins a week apart.'
              : proj
                ? `At this rate you reach ${s.profile.goalKg} kg around ${fmtDate(proj, { day: 'numeric', month: 'short', year: 'numeric' })}.`
                : `Your range is +${s.settings.gainLow} to +${s.settings.gainHigh} kg a week.`}
          </p>
          <GoalBar start={line[0]?.trend ?? s.profile.weightKg} now={latest?.trend ?? s.profile.weightKg} />
        </section>

        {nudge && (
          <section className="card outline stack" style={{ gap: 10 }}>
            <span className="mono fuel">Weekly check-in</span>
            <p style={{ fontSize: 16, fontWeight: 600 }}>{nudge.message}</p>
            {nudge.kind === 'raise' && <p className="small mut">That’s about one extra glass of milk and a banana a day.</p>}
            <div className="row">
              {nudge.kind !== 'eat-more' && (
                <button
                  className="btn primary grow"
                  onClick={() => {
                    s.setTargets(withKcal(s.settings.targets, nudge.to));
                    toast(`Target set to ${fmt(nudge.to)} kcal`);
                  }}
                >
                  {nudge.kind === 'raise' ? 'Bump' : 'Ease back'} to {energy(nudge.to, unit)} {unit}
                </button>
              )}
              <button className="btn" onClick={() => s.dismissNudge(weekStart(today))}>{nudge.kind === 'eat-more' ? 'Got it' : 'Not now'}</button>
            </div>
          </section>
        )}

        <section className="card">
          <div className="between" style={{ marginBottom: 12 }}>
            <h2 className="h2">Days hit</h2>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn icon sm" style={{ width: 34 }} aria-label="Older weeks" disabled={!olderExists} onClick={() => setPage(page + 1)}><Icon name="left" size={16} /></button>
              <button className="btn icon sm" style={{ width: 34 }} aria-label="Newer weeks" disabled={page === 0} onClick={() => setPage(page - 1)}><Icon name="right" size={16} /></button>
            </div>
          </div>
          <div className="between" style={{ margin: '-4px 0 10px' }}>
            <span className="mono dim">{fmtDate(cells[0])} – {fmtDate(cells[34])}</span>
            <span className="mono mut">{hitBoth} of {elapsed.length} · tap a day</span>
          </div>
          <div className="heat" role="img" aria-label={`Hit both targets on ${hitBoth} of the last ${elapsed.length} days`}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={i} className="mono dim" style={{ textAlign: 'center', fontSize: 10 }}>{d}</span>
            ))}
            {cells.map((k) => {
              const st = g.byDate.get(k);
              const cls = k > today ? 'future' : k === today ? 'today' : k < firstDay ? 'pre' : st?.hitKcal && st.hitProtein ? 'both' : st?.hitKcal || st?.hitProtein ? 'one' : '';
              // Past and today's cells open that day's log.
              return k > today || k < firstDay ? <i key={k} className={cls} /> : <a key={k} className={cls} href={k === today ? '#/today' : `#/today?d=${k}`} aria-label={`Open ${fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' })}`} />;
            })}
          </div>
          <div className="row" style={{ gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
            <Legend color="var(--fuel)" label="Kcal + protein" />
            <Legend color="var(--fuel-dim)" label="One of them" />
            <Legend color="var(--track)" label="Missed" />
          </div>
        </section>

        <WeekCompare today={today} />

        <DailyChart today={today} />

        {(() => {
          const r = records(s.days);
          if (!r.kcal && !r.water) return null;
          const tile = (label: string, value: string, date: string | undefined) => (
            <a href={date ? (date === today ? '#/today' : `#/today?d=${date}`) : undefined} className="card stack" style={{ padding: 12, gap: 2, color: 'var(--ink)', textDecoration: 'none', background: 'var(--s2)' }}>
              <span className="num" style={{ fontSize: 24, lineHeight: 1 }}>{value}</span>
              <span className="mono mut" style={{ fontSize: 10 }}>{label}</span>
              {date && <span className="mono dim" style={{ fontSize: 10 }}>{fmtDate(date, { day: 'numeric', month: 'short' })}</span>}
            </a>
          );
          return (
            <section className="card">
              <h2 className="h2" style={{ marginBottom: 10 }}>Personal records</h2>
              <div className="grid2" style={{ gap: 8 }}>
                {tile(`Most ${unit} in a day`, r.kcal ? energy(r.kcal.value, unit) : '–', r.kcal?.date)}
                {tile('Most protein in a day', r.protein ? `${fmt(r.protein.value)} g` : '–', r.protein?.date)}
                {tile('Most water in a day', r.water ? `${(r.water.value * 0.25).toFixed(2).replace(/0$/, '')} L` : '–', r.water?.date)}
                {tile('Best streak', `${g.streak.best} day${g.streak.best === 1 ? '' : 's'}`, undefined)}
              </div>
            </section>
          );
        })()}

        <TopFoods today={today} />

        <section className="card">
          <h2 className="h2" style={{ marginBottom: 8 }}>Weekly averages</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr .8fr', fontSize: 14 }}>
            {['Week of', unit, 'Protein', 'Days'].map((h, i) => (
              <span key={h} className="mono dim" style={{ padding: '8px 0', fontSize: 10, textAlign: i ? 'right' : 'left' }}>{h}</span>
            ))}
            {weeks.map((w) => (
              <WeekRow key={w.w} label={w.w === weekStart(today) ? 'This week' : fmtDate(w.w)} cells={[w.kcal === null ? '–' : energy(w.kcal, unit), w.protein === null ? '–' : `${fmt(w.protein)} g`, `${w.n}/7`]} />
            ))}
          </div>
        </section>

        {(() => {
          const notes = Object.entries(s.days).filter(([, d]) => d.note).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 10);
          return notes.length > 0 && (
            <section className="card">
              <h2 className="h2" style={{ marginBottom: 4 }}>Recent notes</h2>
              {notes.map(([k, d]) => (
                <a key={k} href={k === today ? '#/today' : `#/today?d=${k}`} className="item" style={{ padding: '8px 0', color: 'var(--ink)', textDecoration: 'none' }}>
                  <span className="mono dim" style={{ width: 84, flex: 'none' }}>{fmtDate(k, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="grow">{d.note}</span>
                  <span className="mono mut" style={{ flex: 'none' }}>{energy(dayTotals(d).kcal, unit)}</span>
                </a>
              ))}
            </section>
          );
        })()}

        {s.weighIns.length > 0 && (
          <section className="card">
            <h2 className="h2" style={{ marginBottom: 4 }}>Weigh-ins</h2>
            {[...s.weighIns].reverse().slice(0, 10).map((w) => (
              <div key={w.date} className="item" style={{ padding: '8px 0' }}>
                <span className="grow">{fmtDate(w.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="num" style={{ fontSize: 20 }}>{w.kg.toFixed(1)} kg</span>
                <button className="btn icon sm" style={{ width: 36 }} aria-label={`Delete weigh-in ${w.date}`} onClick={() => s.removeWeighIn(w.date)}><Icon name="trash" size={16} /></button>
              </div>
            ))}
          </section>
        )}
      </div>

      {weighing && (
        <WeighSheet
          today={today}
          onClose={() => {
            setWeighing(false);
            if (params.get('weigh')) window.location.replace('#/progress');
          }}
        />
      )}
    </>
  );
}

/** This week so far next to last week: averages, days logged and days on target. */
function WeekCompare({ today }: { today: string }) {
  const days = useStore((s) => s.days);
  const T = useStore((s) => s.settings.targets);
  const unit = useStore((s) => s.settings.unit);
  const thisWk = weekStats(days, weekStart(today), today, T);
  const lastWk = weekStats(days, addDays(weekStart(today), -7), today, T);
  if (!thisWk.logged && !lastWk.logged) return null;
  const row = (label: string, a: number | null, b: number | null, show: (v: number) => string) => {
    const diff = a !== null && b !== null ? a - b : null;
    return (
      <div className="item" style={{ padding: '8px 0' }}>
        <span className="grow">{label}</span>
        <span className="mono mut" style={{ width: 84, textAlign: 'right' }}>{b === null ? '–' : show(b)}</span>
        <span className="num" style={{ width: 92, textAlign: 'right', fontSize: 18 }}>{a === null ? '–' : show(a)}</span>
        <span className="mono" style={{ width: 22, textAlign: 'right', color: diff === null || Math.abs(diff) < 1e-9 ? 'var(--mut)' : diff > 0 ? 'var(--fuel)' : 'var(--warn)' }}>
          {diff === null || Math.abs(diff) < 1e-9 ? '' : diff > 0 ? '▲' : '▼'}
        </span>
      </div>
    );
  };
  return (
    <section className="card">
      <div className="between" style={{ marginBottom: 4 }}>
        <h2 className="h2">This week vs last</h2>
        <button
          className="btn sm"
          onClick={async () => {
            const rate = weeklyRate(useStore.getState().weighIns, today);
            const text = weekSummary(`Week of ${fmtDate(weekStart(today), { day: 'numeric', month: 'long' })}`, thisWk, lastWk, rate, (k) => `${energy(k, unit)} ${unit}`);
            try {
              if (navigator.share) await navigator.share({ text });
              else {
                await navigator.clipboard.writeText(text);
                toast('Week summary copied');
              }
            } catch (e) {
              if ((e as Error).name !== 'AbortError') toast('Could not share. Try again.');
            }
          }}
        >
          <Icon name="copy" size={14} /> Share
        </button>
      </div>
      <div className="between" style={{ marginBottom: 2 }}>
        <span />
        <span className="mono dim">Last · This</span>
      </div>
      {row('Avg energy', thisWk.kcal, lastWk.kcal, (v) => `${energy(v, unit)}`)}
      {row('Avg protein', thisWk.protein, lastWk.protein, (v) => `${fmt(v)} g`)}
      {row('Days logged', thisWk.logged, lastWk.logged, (v) => String(v))}
      {row('Days on target', thisWk.hit, lastWk.hit, (v) => String(v))}
    </section>
  );
}

/** Last 14 days as bars against the target line; energy or protein. Each bar opens that day. */
/** The foods that gave the most protein or energy over the last 14 days. */
function TopFoods({ today }: { today: string }) {
  const days = useStore((s) => s.days);
  const unit = useStore((s) => s.settings.unit);
  const [what, setWhat] = useState<'kcal' | 'protein'>('protein');
  const list = topFoods(days, today, what);
  if (!topFoods(days, today, 'kcal').length) return null;
  const color = what === 'kcal' ? 'var(--fuel)' : 'var(--pro)';
  return (
    <section className="card">
      <div className="between" style={{ marginBottom: 6, alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h2 className="h2">Top foods</h2>
        <div className="row" style={{ gap: 6 }}>
          <button className="chip" aria-pressed={what === 'protein'} onClick={() => setWhat('protein')}>Protein</button>
          <button className="chip" aria-pressed={what === 'kcal'} onClick={() => setWhat('kcal')}>Energy</button>
        </div>
      </div>
      <p className="small mut" style={{ margin: '0 0 8px' }}>Where your {what === 'kcal' ? 'energy' : 'protein'} came from in the last 14 days.</p>
      {list.length === 0 && <p className="small mut" style={{ margin: 0 }}>Nothing with protein logged yet.</p>}
      {list.map((f) => (
        <div key={f.name} className="stack" style={{ gap: 4, padding: '6px 0' }}>
          <div className="between" style={{ gap: 8 }}>
            <span className="grow" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{f.name} <span className="mono dim">×{f.times}</span></span>
            <span className="mono mut" style={{ flex: 'none' }}>{what === 'kcal' ? `${energy(f.value, unit)} ${unit}` : `${fmt(f.value)} g`} · {Math.round(f.share * 100)}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--s2)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(2, f.share * 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </section>
  );
}

function DailyChart({ today }: { today: string }) {
  const days = useStore((s) => s.days);
  const T = useStore((s) => s.settings.targets);
  const unit = useStore((s) => s.settings.unit);
  const [what, setWhat] = useState<'kcal' | 'protein'>('kcal');
  const keys = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const vals = keys.map((k) => dayTotals(days[k])[what]);
  const target = T[what];
  const top = Math.max(target * 1.25, ...vals);
  const H = 120;
  const color = what === 'kcal' ? 'var(--fuel)' : 'var(--pro)';
  const logged = vals.filter((v, i) => v > 0 && keys[i] < today);
  const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null;
  const show = (v: number) => (what === 'kcal' ? `${energy(v, unit)} ${unit}` : `${fmt(v)} g`);
  return (
    <section className="card">
      <div className="between" style={{ marginBottom: 10, alignItems: 'center' }}>
        <h2 className="h2">Last 14 days</h2>
        <div className="row" style={{ gap: 6 }}>
          <button className="chip" aria-pressed={what === 'kcal'} onClick={() => setWhat('kcal')}>Energy</button>
          <button className="chip" aria-pressed={what === 'protein'} onClick={() => setWhat('protein')}>Protein</button>
        </div>
      </div>
      <div className="chart14" style={{ height: H }}>
        <span className="chart14-target" style={{ bottom: (target / top) * H }} />
        {keys.map((k, i) => (
          <a key={k} href={k === today ? '#/today' : `#/today?d=${k}`} aria-label={`${fmtDate(k, { weekday: 'long', day: 'numeric', month: 'short' })}: ${show(vals[i])}`}>
            <i style={{ height: Math.max(vals[i] ? 3 : 0, (vals[i] / top) * H), background: vals[i] >= (what === 'kcal' ? target + (days[k]?.boost ?? 0) : target) ? color : `color-mix(in srgb, ${color} 55%, var(--track))` }} />
          </a>
        ))}
      </div>
      <div className="between" style={{ marginTop: 6 }}>
        <span className="mono dim" style={{ fontSize: 10 }}>{fmtDate(keys[0])}</span>
        <span className="mono dim" style={{ fontSize: 10 }}>Today</span>
      </div>
      <p className="small mut" style={{ marginTop: 6 }}>
        Line = target ({show(target)}). {avg === null ? 'Log a few days to see your average.' : `Average on logged days: ${show(avg)}, ${logged.filter((v) => v >= target).length} of ${logged.length} hit.`}
      </p>
    </section>
  );
}

/** Start → goal weight bar, or a field to set a goal. */
function GoalBar({ start, now }: { start: number; now: number }) {
  const goal = useStore((s) => s.profile.goalKg);
  const setProfile = useStore((s) => s.setProfile);
  const [text, setText] = useState('');
  const frac = goalProgress(start, now, goal);
  if (goal && frac !== null)
    return (
      <div className="stack rule" style={{ gap: 6, marginTop: 12, paddingTop: 12 }}>
        <div className="between">
          <span className="mono mut">Goal {r1(start).toFixed(1)} → {goal} kg</span>
          <span className="mono fuel">{Math.round(frac * 100)}% there · {Math.max(0, goal - now).toFixed(1)} kg to go</span>
        </div>
        <Bar value={frac} max={1} color="var(--fuel)" height={8} />
      </div>
    );
  const v = parseFloat(text);
  return (
    <div className="row rule" style={{ marginTop: 12, paddingTop: 12, gap: 8 }}>
      <label className="field grow" style={{ margin: 0 }}>
        <span>{goal ? `Goal ${goal} kg is at or below your start. New goal (kg)` : 'Set a goal weight (kg)'}</span>
        <input className="input" type="number" inputMode="decimal" step="0.5" value={text} onChange={(e) => setText(e.target.value)} placeholder={String(Math.round(now + 5))} />
      </label>
      <button className="btn" style={{ alignSelf: 'flex-end', minHeight: 48 }} disabled={!(v > now && v < 200)} onClick={() => { setProfile({ goalKg: Math.round(v * 10) / 10 }); toast(`Goal set to ${v} kg`); }}>Set</button>
    </div>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="mono mut" style={{ fontSize: 10 }}>{label}</span>
      <span className="num" style={{ fontSize: 28, lineHeight: 1, color }}>{value}{unit && <span className="mut" style={{ fontSize: 16 }}>{unit}</span>}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="mono mut row" style={{ gap: 6, fontSize: 10 }}>
      <span style={{ width: 10, height: 10, background: color }} />
      {label}
    </span>
  );
}

function WeekRow({ label, cells }: { label: string; cells: string[] }) {
  const b = { padding: '10px 0', borderTop: '1px solid var(--line)' };
  return (
    <>
      <span style={b}>{label}</span>
      {cells.map((c, i) => (
        <span key={i} className="num" style={{ ...b, textAlign: 'right', fontSize: 18 }}>{c}</span>
      ))}
    </>
  );
}

function WeightChart({ line, today, low, high, span: days }: { line: { date: string; kg: number; trend: number }[]; today: string; low: number; high: number; span: number | null }) {
  if (line.length < 2) return <p className="empty" style={{ marginTop: 14 }}>{line.length ? 'One more weigh-in and your trend line appears.' : 'Your first weigh-in starts the line.'}</p>;
  const W = 326, H = 180, L = 36, R = 316, T = 10, B = 150;
  const pts = chartWindow(line, today, days);
  const first = pts[0];
  const span = Math.max(7, daysBetween(first.date, today));
  const weeks = span / 7;
  const bandHi = first.trend + high * weeks;
  const bandLo = first.trend + low * weeks;
  const vals = [...pts.flatMap((p) => [p.kg, p.trend]), bandHi, first.trend];
  const lo = Math.min(...vals) - 0.3;
  const hi = Math.max(...vals) + 0.3;
  const x = (k: string) => L + (daysBetween(first.date, k) / span) * (R - L);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (B - T);
  const ticks = [hi - 0.3, (hi + lo) / 2, lo + 0.3];
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Weight trend ${first.trend.toFixed(1)} to ${last.trend.toFixed(1)} kg`} style={{ display: 'block', marginTop: 14 }}>
      <polygon points={`${L},${y(first.trend)} ${R},${y(bandHi)} ${R},${y(bandLo)}`} fill="var(--fuel)" fillOpacity={0.12} />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--mut)" fontFamily="var(--font)">{v.toFixed(1)}</text>
        </g>
      ))}
      {pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={2.5} fill="var(--dim)" />)}
      {pts.length > 1 && <polyline points={pts.map((p) => `${x(p.date)},${y(p.trend)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(last.date)} cy={y(last.trend)} r={5} fill="var(--fuel)" stroke="var(--bg)" strokeWidth={2} />
      <text x={L} y={H - 8} fontSize="10" fill="var(--mut)" fontFamily="var(--font)">{fmtDate(first.date)}</text>
      <text x={R} y={H - 8} textAnchor="end" fontSize="10" fill="var(--mut)" fontFamily="var(--font)">{dateOf(today).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</text>
    </svg>
  );
}

function WeighSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const s = useStore();
  const [date, setDate] = useState(today);
  const existing = s.weighIns.find((w) => w.date === date);
  const [kg, setKg] = useState(String(existing?.kg ?? s.weighIns[s.weighIns.length - 1]?.kg ?? s.profile.weightKg));
  const v = parseFloat(kg);
  const ok = v >= 20 && v <= 300;
  return (
    <Sheet onClose={onClose} label="Weigh in">
      <h2 className="h2" style={{ fontSize: 26 }}>Weigh in</h2>
      <p className="small mut">Same morning, before breakfast, same scales. One reading means little; the trend is what counts.</p>
      <div className="grid2">
        <label className="field"><span>Weight (kg)</span><input className="input num" style={{ fontSize: 28 }} type="number" inputMode="decimal" step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus /></label>
        <label className="field"><span>Date</span><input className="input" type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
      </div>
      <button
        className="btn primary block"
        disabled={!ok}
        onClick={() => {
          s.addWeighIn(date, Math.round(v * 10) / 10);
          toast('Weigh-in saved', existing ? 0 : XP.weighIn);
          onClose();
        }}
      >
        Save · +{XP.weighIn} XP
      </button>
    </Sheet>
  );
}
