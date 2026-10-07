import { useState, type ReactNode } from 'react';
import { useStore, dataOf } from '../lib/store';
import { RANKS, BOSS_XP, computeGame } from '../lib/game';
import { suggestTargets } from '../lib/targets';
import { exportText, parseBackup } from '../lib/backup';
import { GEMINI_MODELS, friendlyError, testKey } from '../lib/gemini';
import { fmt, KJ } from '../lib/nutrition';
import { todayKey, fmtDate } from '../lib/dates';
import type { AppData, Macros } from '../lib/types';
import { Bar, toast, useGame, useRoute } from '../components/ui';

const TONE = { fuel: 'var(--fuel)', protein: 'var(--pro)', sand: 'var(--carb)', ink: 'var(--ink)' };

export default function ProfilePage() {
  const s = useStore();
  const g = useGame();
  const { params } = useRoute();
  const open = params.get('open');
  const earned = g.badges.filter((b) => b.earned).length;

  return (
    <>
      <section style={{ padding: '24px 16px 18px' }} className="stack">
        <span className="mono mut">{s.profile.name ? `${s.profile.name} · ` : ''}rank {g.rank.index + 1} of {RANKS.length}</span>
        <div className="row" style={{ alignItems: 'flex-end', gap: 14 }}>
          <span className="num fuel" style={{ fontSize: 112, lineHeight: 0.8 }}>{g.level}</span>
          <div className="stack" style={{ gap: 2, paddingBottom: 4 }}>
            <span className="num" style={{ fontSize: 40, lineHeight: 0.9, textTransform: 'uppercase' }}>{g.rank.name}</span>
            <span className="mut small">{g.rank.next ? `Next: ${g.rank.next.name} at level ${g.rank.next.level}` : 'Top rank'}</span>
          </div>
        </div>
        <Bar value={g.into} max={g.need} color="var(--fuel)" height={10} />
        <div className="between">
          <span className="mono mut">{fmt(g.into)} / {fmt(g.need)} XP</span>
          <span className="mono mut">{fmt(g.need - g.into)} to go</span>
        </div>
      </section>

      <div className="page">
        <div className="grid3">
          <Tile v={g.streak.current} l="Day streak" />
          <Tile v={g.streak.best} l="Best streak" />
          <Tile v={g.streak.freezes} l="Freezes" color="var(--pro)" />
        </div>
        <p className="small mut" style={{ marginTop: -4 }}>Log any food to keep your streak. Every 7 days in a row earns a freeze (max 2) that saves a missed day.</p>

        <section className="card inv stack" style={{ gap: 10 }}>
          <div className="between">
            <span className="mono" style={{ fontWeight: 600 }}>Weekly boss · {g.boss.daysLeft === 0 ? 'last day' : `${g.boss.daysLeft} day${g.boss.daysLeft === 1 ? '' : 's'} left`}</span>
            <span className="mono" style={{ fontWeight: 600 }}>+{BOSS_XP} XP</span>
          </div>
          <h2 className="num" style={{ fontSize: 28, lineHeight: 1, textTransform: 'uppercase' }}>{g.boss.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${g.boss.need}, minmax(0,1fr))`, gap: 4 }}>
            {Array.from({ length: g.boss.need }, (_, i) => (
              <div key={i} style={{ height: 12, background: i < g.boss.have ? 'var(--fuel)' : 'color-mix(in srgb, var(--bg) 18%, transparent)' }} />
            ))}
          </div>
          <span className="small">{g.boss.won ? 'Beaten. Nice.' : `${g.boss.have} down, ${g.boss.need - g.boss.have} to go.`} {g.bossWins > 0 && `${g.bossWins} boss${g.bossWins === 1 ? '' : 'es'} beaten so far.`}</span>
        </section>

        <section style={{ marginTop: 8 }}>
          <div className="between" style={{ marginBottom: 12 }}>
            <h2 className="h2">Badges</h2>
            <span className="mono mut">{earned} / {g.badges.length}</span>
          </div>
          <div className="grid4" style={{ rowGap: 14 }}>
            {g.badges.map((b) => (
              <button key={b.id} className={`badge${b.earned ? '' : ' locked'}`} onClick={() => toast(`${b.name}: ${b.desc}${b.earned ? ' ✓' : ` (${b.have}/${b.need})`}`)}>
                <div className="hex" style={{ background: TONE[b.tone] }}>
                  <span className="num" style={{ fontSize: b.glyph.length > 2 ? 17 : 20 }}>{b.glyph}</span>
                </div>
                <span style={{ fontSize: 12 }}>{b.name}</span>
                {!b.earned && <span className="mono dim" style={{ fontSize: 10, marginTop: -4 }}>{b.have}/{b.need}</span>}
              </button>
            ))}
          </div>
        </section>

        <h2 className="h2" style={{ marginTop: 16 }}>Settings</h2>
        <Section title="Daily targets" hint={`${fmt(s.settings.targets.kcal)} kcal · ${s.settings.targets.protein} g`} open={open === 'targets'}>
          <TargetsForm />
        </Section>
        <Section title="AI food scanner" hint={s.settings.geminiKey ? 'Gemini key added' : 'Not set up'} hintColor={s.settings.geminiKey ? 'var(--pro)' : undefined} open={open === 'ai'}>
          <AiForm />
        </Section>
        <Section title="Display and food" hint={`${s.settings.unit} · ${s.settings.theme === 'auto' ? 'match device' : s.settings.theme}`}>
          <DisplayForm />
        </Section>
        <Section title="Backup and import" hint={s.lastExport ? `Last export ${fmtDate(s.lastExport)}` : 'Never exported'} open={open === 'backup'}>
          <BackupForm />
        </Section>
        <p className="small mut rule" style={{ paddingTop: 12 }}>
          Talk to a parent and your GP before big target changes, before starting any supplement, or if your weight is dropping despite eating more. These numbers are starting points, not rules.
        </p>
        <p className="mono dim" style={{ paddingBottom: 12 }}>Fuel Log · your data stays on this phone</p>
      </div>
    </>
  );
}

function Tile({ v, l, color }: { v: number; l: string; color?: string }) {
  return (
    <div className="card stack" style={{ padding: 12, gap: 2 }}>
      <span className="num" style={{ fontSize: 30, lineHeight: 1, color }}>{v}</span>
      <span className="mono mut" style={{ fontSize: 10 }}>{l}</span>
    </div>
  );
}

function Section({ title, hint, hintColor, open, children }: { title: string; hint: string; hintColor?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="rule" open={open} style={{ padding: '4px 0' }}>
      <summary className="between" style={{ alignItems: 'center', minHeight: 52, cursor: 'pointer', listStyle: 'none' }}>
        <span>{title}</span>
        <span className="mono" style={{ color: hintColor ?? 'var(--mut)' }}>{hint}</span>
      </summary>
      <div className="stack" style={{ gap: 12, padding: '4px 0 16px' }}>{children}</div>
    </details>
  );
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number | string; onChange: (v: string) => void; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TargetsForm() {
  const s = useStore();
  const p = s.profile;
  const kj = s.settings.unit === 'kJ';
  const [t, setT] = useState({ ...s.settings.targets, kcal: Math.round(kj ? s.settings.targets.kcal * KJ : s.settings.targets.kcal) });
  const [other, setOther] = useState({ waterL: s.settings.waterL, gainLow: s.settings.gainLow, gainHigh: s.settings.gainHigh, goalKg: p.goalKg ?? '' });
  const [stats, setStats] = useState({ heightCm: p.heightCm, weightKg: p.weightKg, age: p.age, activity: p.activity });
  const num = (v: string | number) => Math.max(0, parseFloat(String(v)) || 0);

  const recalc = () => {
    const sug = suggestTargets({ ...p, ...stats, heightCm: num(stats.heightCm), weightKg: num(stats.weightKg), age: num(stats.age) });
    setT({ ...sug, kcal: Math.round(kj ? sug.kcal * KJ : sug.kcal) });
    toast('Suggested targets filled in. Save to use them.');
  };
  const save = () => {
    const kcal = Math.round(kj ? num(t.kcal) / KJ : num(t.kcal));
    if (kcal < 1200 || kcal > 6000) return toast('Energy target should be 1,200–6,000 kcal');
    const targets: Macros = { kcal, protein: Math.round(num(t.protein)), carbs: Math.round(num(t.carbs)), fat: Math.round(num(t.fat)) };
    s.setTargets(targets);
    s.setSettings({ waterL: Math.min(6, Math.max(0.5, num(other.waterL))), gainLow: num(other.gainLow), gainHigh: Math.max(num(other.gainLow), num(other.gainHigh)) });
    s.setProfile({ ...stats, heightCm: num(stats.heightCm), weightKg: num(stats.weightKg), age: Math.round(num(stats.age)), goalKg: other.goalKg === '' ? null : num(other.goalKg) || null });
    toast('Targets saved');
  };

  return (
    <>
      <div className="grid2">
        <Num label={`Energy (${s.settings.unit})`} value={t.kcal} onChange={(v) => setT({ ...t, kcal: num(v) })} />
        <Num label="Protein (g)" value={t.protein} onChange={(v) => setT({ ...t, protein: num(v) })} />
        <Num label="Carbs (g)" value={t.carbs} onChange={(v) => setT({ ...t, carbs: num(v) })} />
        <Num label="Fat (g)" value={t.fat} onChange={(v) => setT({ ...t, fat: num(v) })} />
        <Num label="Water (L)" value={other.waterL} step={0.25} onChange={(v) => setOther({ ...other, waterL: num(v) })} />
        <Num label="Goal weight (kg)" value={other.goalKg} step={0.5} onChange={(v) => setOther({ ...other, goalKg: v })} />
        <Num label="Gain/week low (kg)" value={other.gainLow} step={0.05} onChange={(v) => setOther({ ...other, gainLow: num(v) })} />
        <Num label="Gain/week high (kg)" value={other.gainHigh} step={0.05} onChange={(v) => setOther({ ...other, gainHigh: num(v) })} />
      </div>
      <span className="mono mut" style={{ marginTop: 6 }}>Your stats</span>
      <div className="grid3">
        <Num label="Height cm" value={stats.heightCm} onChange={(v) => setStats({ ...stats, heightCm: num(v) })} />
        <Num label="Weight kg" value={stats.weightKg} step={0.1} onChange={(v) => setStats({ ...stats, weightKg: num(v) })} />
        <Num label="Age" value={stats.age} onChange={(v) => setStats({ ...stats, age: num(v) })} />
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {(['light', 'moderate', 'high'] as const).map((a) => (
          <button key={a} className="chip" aria-pressed={stats.activity === a} onClick={() => setStats({ ...stats, activity: a })}>
            {a === 'light' ? 'Light activity' : a === 'moderate' ? 'Gym 3–4×/week' : 'Very active'}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={recalc}>Suggest from stats</button>
        <button className="btn primary grow" onClick={save}>Save targets</button>
      </div>
    </>
  );
}

function AiForm() {
  const s = useStore();
  const [key, setKey] = useState(s.settings.geminiKey);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState('');
  const custom = !GEMINI_MODELS.some((m) => m.id === s.settings.geminiModel);
  return (
    <>
      <p className="small mut">
        Snap meal, Read label and Describe it use Google Gemini with your own free key. It’s stored only on this phone and sent only to Google. Get one at{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>. Google requires an adult (18+) to create the key, so ask a parent.
      </p>
      <label className="field">
        <span>Gemini API key</span>
        <div className="row">
          <input className="input" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste key" />
          <button className="btn" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
      </label>
      <label className="field">
        <span>Model</span>
        <select className="input" value={custom ? 'custom' : s.settings.geminiModel} onChange={(e) => s.setSettings({ geminiModel: e.target.value === 'custom' ? '' : e.target.value })}>
          {GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.hint}</option>)}
          <option value="custom">Custom model ID…</option>
        </select>
      </label>
      {custom && <input className="input" placeholder="e.g. gemini-3.8-flash" value={s.settings.geminiModel} onChange={(e) => s.setSettings({ geminiModel: e.target.value.trim() })} aria-label="Custom model ID" />}
      <div className="row">
        <button
          className="btn"
          onClick={async () => {
            setStatus('Testing…');
            try {
              await testKey(key, s.settings.geminiModel || GEMINI_MODELS[0].id);
              setStatus('Key works.');
            } catch (e) {
              setStatus(friendlyError(e));
            }
          }}
        >
          Test
        </button>
        <button className="btn primary grow" onClick={() => { s.setSettings({ geminiKey: key.trim() }); toast(key.trim() ? 'Key saved' : 'Key removed'); }}>Save key</button>
      </div>
      {status && <p className="small" role="status">{status}</p>}
    </>
  );
}

function DisplayForm() {
  const s = useStore();
  const opt = <T extends string>(cur: T, set: (v: T) => void, items: [T, string][]) => (
    <div className="row" style={{ flexWrap: 'wrap' }}>
      {items.map(([v, l]) => <button key={v} className="chip" aria-pressed={cur === v} onClick={() => set(v)}>{l}</button>)}
    </div>
  );
  return (
    <>
      <span className="mono mut">Energy units</span>
      {opt(s.settings.unit, (unit) => s.setSettings({ unit }), [['kcal', 'Calories (kcal)'], ['kJ', 'Kilojoules (kJ)']])}
      <span className="mono mut">Theme</span>
      {opt(s.settings.theme, (theme) => s.setSettings({ theme }), [['auto', 'Match device'], ['dark', 'Dark'], ['light', 'Light']])}
      <span className="mono mut">Suggestions</span>
      <label className="row small">
        <input type="checkbox" checked={s.settings.wheyOk} onChange={(e) => s.setSettings({ wheyOk: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--fuel)' }} />
        Include whey protein in “Close the gap” (off by default; whey can make acne worse for some people)
      </label>
    </>
  );
}

function BackupForm() {
  const s = useStore();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<AppData | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const doExport = () => {
    const blob = new Blob([exportText(dataOf(s))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fuel-log-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    s.markExported();
    toast('Backup downloaded');
  };
  const check = (t: string) => {
    try {
      setPending(parseBackup(t));
    } catch {
      setPending(null);
      toast('That isn’t a Fuel Log backup');
    }
  };

  return (
    <>
      <p className="small mut">Your log lives only in this browser. Export now and then so a cleared browser or new phone doesn’t cost you your history. Backups from the original Fuel Log artifact import here too.</p>
      <button className="btn primary" onClick={doExport}>Export backup</button>
      <span className="mono mut">Import</span>
      <input
        type="file"
        accept=".json,application/json,text/plain"
        aria-label="Choose a backup file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) check(await f.text());
        }}
      />
      <textarea className="input" rows={3} placeholder="Or paste backup text" value={text} onChange={(e) => setText(e.target.value)} aria-label="Paste backup text" style={{ fontSize: 13 }} />
      <button className="btn" disabled={!text.trim()} onClick={() => check(text)}>Check pasted backup</button>
      {pending && (
        <div className="card outline stack">
          <p>This backup has {Object.keys(pending.days).length} logged days and {pending.weighIns.length} weigh-ins. Importing replaces everything here.</p>
          <div className="row">
            <button
              className="btn primary grow"
              onClick={() => {
                const g = computeGame(pending, todayKey());
                s.replaceAll({ ...pending, seen: { level: g.level, badges: g.badges.filter((b) => b.earned).map((b) => b.id) } });
                setPending(null);
                setText('');
                toast('Backup imported');
              }}
            >
              Replace my data
            </button>
            <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      <span className="mono mut" style={{ marginTop: 8 }}>Start over</span>
      {confirmReset ? (
        <div className="row">
          <button className="btn danger grow" onClick={() => { s.reset(); toast('All data cleared'); }}>Delete everything</button>
          <button className="btn" onClick={() => setConfirmReset(false)}>Keep my data</button>
        </div>
      ) : (
        <button className="btn danger" onClick={() => setConfirmReset(true)}>Clear all data</button>
      )}
    </>
  );
}
