import { useState } from 'react';
import { useStore, dataOf } from '../lib/store';
import { addDays, dateOf, daysBetween, fmtDate, weekStart } from '../lib/dates';
import { dayTotals, energy, fmt, r1 } from '../lib/nutrition';
import { projectedDate, trendLine, weeklyNudge, weeklyRate, withKcal } from '../lib/targets';

import { XP } from '../lib/game';
import { Icon, Sheet, toast, useGame, useToday } from '../components/ui';

export default function Progress() {
  const today = useToday();
  const s = useStore();
  const g = useGame();
  const [weighing, setWeighing] = useState(false);
  const unit = s.settings.unit;

  const line = trendLine(s.weighIns);
  const latest = line[line.length - 1];
  const rate = weeklyRate(s.weighIns, today);
  const since = line.length >= 2 ? latest.trend - line[0].trend : null;
  const nudge = weeklyNudge(dataOf(s), today);
  const proj = latest ? projectedDate(latest.trend, s.profile.goalKg, rate, today) : null;

  // Heatmap: 5 weeks, Monday first.
  const start = addDays(weekStart(today), -28);
  const cells = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const firstDay = g.stats[0]?.date ?? today;
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
          <WeightChart line={line} today={today} low={s.settings.gainLow} high={s.settings.gainHigh} />
          <p className="small mut" style={{ marginTop: 8 }}>
            {rate === null
              ? 'Weigh in once or twice a week: same morning, before breakfast, same scales. The trend appears after two weigh-ins a week apart.'
              : proj
                ? `At this rate you reach ${s.profile.goalKg} kg around ${fmtDate(proj, { day: 'numeric', month: 'short', year: 'numeric' })}.`
                : `Your range is +${s.settings.gainLow} to +${s.settings.gainHigh} kg a week.${s.profile.goalKg ? '' : ' Set a goal weight in Profile to see a finish date.'}`}
          </p>
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
            <span className="mono mut">{hitBoth} of {elapsed.length}</span>
          </div>
          <div className="heat" role="img" aria-label={`Hit both targets on ${hitBoth} of the last ${elapsed.length} days`}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={i} className="mono dim" style={{ textAlign: 'center', fontSize: 10 }}>{d}</span>
            ))}
            {cells.map((k) => {
              const st = g.byDate.get(k);
              const cls = k > today ? 'future' : k === today ? 'today' : k < firstDay ? 'pre' : st?.hitKcal && st.hitProtein ? 'both' : st?.hitKcal || st?.hitProtein ? 'one' : '';
              return <i key={k} className={cls} title={k} />;
            })}
          </div>
          <div className="row" style={{ gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
            <Legend color="var(--fuel)" label="Kcal + protein" />
            <Legend color="var(--fuel-dim)" label="One of them" />
            <Legend color="var(--track)" label="Missed" />
          </div>
        </section>

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

      {weighing && <WeighSheet today={today} onClose={() => setWeighing(false)} />}
    </>
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
  const b = { padding: '10px 0', borderTop: '2px solid var(--line)' };
  return (
    <>
      <span style={b}>{label}</span>
      {cells.map((c, i) => (
        <span key={i} className="num" style={{ ...b, textAlign: 'right', fontSize: 18 }}>{c}</span>
      ))}
    </>
  );
}

function WeightChart({ line, today, low, high }: { line: { date: string; kg: number; trend: number }[]; today: string; low: number; high: number }) {
  if (line.length < 2) return <p className="empty" style={{ marginTop: 14 }}>{line.length ? 'One more weigh-in and your trend line appears.' : 'Your first weigh-in starts the line.'}</p>;
  const W = 326, H = 180, L = 36, R = 316, T = 10, B = 150;
  const pts = line.filter((p) => daysBetween(p.date, today) <= 56);
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
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--mut)" fontFamily="var(--mono)">{v.toFixed(1)}</text>
        </g>
      ))}
      {pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={2.5} fill="var(--dim)" />)}
      {pts.length > 1 && <polyline points={pts.map((p) => `${x(p.date)},${y(p.trend)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(last.date)} cy={y(last.trend)} r={5} fill="var(--fuel)" stroke="var(--bg)" strokeWidth={2} />
      <text x={L} y={H - 8} fontSize="10" fill="var(--mut)" fontFamily="var(--mono)">{fmtDate(first.date).toUpperCase()}</text>
      <text x={R} y={H - 8} textAnchor="end" fontSize="10" fill="var(--mut)" fontFamily="var(--mono)">{dateOf(today).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }).toUpperCase()}</text>
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
