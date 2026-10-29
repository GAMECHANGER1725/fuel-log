import { useState, type ReactNode } from 'react';
import { useStore, dataOf } from '../lib/store';
import { RANKS, BOSS_XP, computeGame } from '../lib/game';
import { suggestTargets } from '../lib/targets';
import { DEFAULT_CHECKS, MAX_CHECKS, exportCsv, exportText, parseBackup } from '../lib/backup';
import { AI_MODELS, GEMINI_MODELS, PROVIDER_NAME, friendlyError, hasAi, testKey, type Provider } from '../lib/ai';
import { fmt, KJ, type BadgeMode } from '../lib/nutrition';
import { todayKey, fmtDate } from '../lib/dates';
import type { AppData, Macros } from '../lib/types';
import { Bar, toast, useGame, useRoute, Icon } from '../components/ui';
import { useAuth } from '../lib/auth';
import { EAT_GAPS, FOOD_HOURS, WATER_GAPS, hourLabel, reminderTimes, remindersOn, remindersSupported, setReminderTimes, setReminders, setWrap, wrapOn } from '../lib/reminders';
import { TOKEN_URL, connect, disconnect, syncNow, useSync } from '../lib/sync';
import { ACCENTS, BOOSTS, BOTTLES, CARDS, MAX_TAGS, QUICK_COUNTS, STARTS, WEIGH_EVERY, ORDER_LABEL, QUICK_ACTIONS, SIZES, usePrefs, type Card } from '../lib/prefs';
import { NOTE_TAGS } from '../lib/meals';
import WhatsNew from '../components/WhatsNew';

const TONE = { fuel: 'var(--fuel)', protein: 'var(--pro)', sand: 'var(--carb)', ink: 'var(--ink)' };

export default function ProfilePage() {
  const s = useStore();
  const g = useGame();
  const { params } = useRoute();
  const open = params.get('open');
  const earned = g.badges.filter((b) => b.earned).length;
  const sync = useSync();
  const [news, setNews] = useState(false);
  const syncHint = !sync.conn ? 'Not connected' : sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? 'Problem' : sync.last ? `Synced ${ago(sync.last)}` : 'Connected';

  return (
    <>
      <section style={{ padding: '24px 16px 18px' }} className="stack">
        <span className="mono mut">{s.profile.name ? `${s.profile.name} · ` : ''}rank {g.rank.index + 1} of {RANKS.length}</span>
        <div className="row" style={{ alignItems: 'flex-end', gap: 14 }}>
          <span className="num fuel" style={{ fontSize: 112, lineHeight: 0.8 }}>{g.level}</span>
          <div className="stack" style={{ gap: 2, paddingBottom: 4 }}>
            <span className="num" style={{ fontSize: 40, lineHeight: 1 }}>{g.rank.name}</span>
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
        <a href="../Fitness-Tracker/" className="card tight" style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--ink)', textDecoration: 'none' }}>
          <span style={{ width: 44, height: 44, borderRadius: 16, background: '#5be3a6', color: '#04140d', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></svg>
          </span>
          <span className="grow">
            <span className="bold" style={{ display: 'block' }}>Fitness Tracker</span>
            <span className="small mut">Home workouts, wake-ups and sleep. Reads this log for your food.</span>
          </span>
          <Icon name="right" />
        </a>
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
          <h2 className="num" style={{ fontSize: 26, lineHeight: 1.05 }}>{g.boss.title}</h2>
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
        <Section title="AI" hint={aiHint(s.settings)} hintColor={hasAi(s.settings) ? 'var(--pro)' : undefined} open={open === 'ai'}>
          <AiForm />
        </Section>
        <Section title="Sync between devices" hint={syncHint} hintColor={sync.status === 'error' && sync.kind !== 'offline' ? 'var(--danger)' : sync.conn ? 'var(--pro)' : undefined} open={open === 'sync'}>
          <SyncForm />
        </Section>
        <Section title="Food-quality checks" hint={`${s.settings.checks.length} checks`} open={open === 'checks'}>
          <ChecksForm />
        </Section>
        <Section title="Look" hint={`${s.settings.unit} · ${s.settings.theme === 'auto' ? 'match device' : s.settings.theme}`} open={open === 'look' || open === 'display'}>
          <LookForm />
        </Section>
        <Section title="Today page" hint="Cards, buttons, tags" open={open === 'today'}>
          <TodayForm />
        </Section>
        <Section title="Reminders" hint={remindersOn() ? 'On' : 'Off'} hintColor={remindersOn() ? 'var(--pro)' : undefined} open={open === 'reminders'}>
          <ReminderToggle />
          {'setAppBadge' in navigator && (
            <>
              <span className="mono mut">App icon badge (this device)</span>
              <BadgePicker />
            </>
          )}
        </Section>
        <Section title="Backup and import" hint={s.lastExport ? `Last export ${fmtDate(s.lastExport)}` : 'Never exported'} open={open === 'backup'}>
          <BackupForm />
        </Section>
        <p className="small mut rule" style={{ paddingTop: 12 }}>
          Talk to a parent and your GP before big target changes, before starting any supplement, or if your weight is dropping despite eating more. These numbers are starting points, not rules.
        </p>
        <button className="btn block" onClick={() => setNews(true)}>What’s new</button>
        <button className="btn block" onClick={() => useAuth.getState().lock()}>Log out</button>
        <p className="mono dim" style={{ paddingBottom: 12 }}>Fuel Log · your data stays on this phone</p>
      </div>
      {news && <WhatsNew onClose={() => setNews(false)} />}
    </>
  );
}

/** "just now", "5 min ago", "2 h ago". */
function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
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

const aiHint = (st: { aiKey: string; geminiKey: string }) =>
  st.aiKey && st.geminiKey ? 'DeepSeek + Gemini' : st.aiKey ? 'DeepSeek key added' : st.geminiKey ? 'Gemini key added' : 'Not set up';

function AiForm() {
  const s = useStore();
  const first = s.settings.aiFirst;
  return (
    <>
      <p className="small mut">
        Snap meal, Read label, Describe it, recipe edits and the coach use your own free key for DeepSeek (through TokenHarbor), Google Gemini, or both. With
        both, the app tries your first choice and switches to the other when it hits its limit. Keys are stored only on this phone and sent only to that provider.
      </p>
      {s.settings.aiKey && s.settings.geminiKey && (
        <label className="field">
          <span>Try first</span>
          <div className="row">
            {(['deepseek', 'gemini'] as const).map((p) => (
              <button key={p} className="chip" aria-pressed={first === p} onClick={() => s.setSettings({ aiFirst: p })}>{PROVIDER_NAME[p]}</button>
            ))}
          </div>
        </label>
      )}
      <KeyForm
        provider="deepseek"
        label="TokenHarbor API key (DeepSeek)"
        link={<>Get one at <a href="https://tokenharbor.ai/dashboard/api-keys" target="_blank" rel="noreferrer">tokenharbor.ai</a> (API Keys).</>}
        saved={s.settings.aiKey}
        models={AI_MODELS}
        model={s.settings.aiModel}
        placeholder="e.g. deepseek-v4.1-flash:free"
        save={(k) => s.setSettings({ aiKey: k })}
        setModel={(m) => s.setSettings({ aiModel: m })}
      />
      <KeyForm
        provider="gemini"
        label="Gemini API key"
        link={<>Get one free at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a> (Get API key).</>}
        saved={s.settings.geminiKey}
        models={GEMINI_MODELS}
        model={s.settings.geminiModel}
        placeholder="e.g. gemini-flash-latest"
        save={(k) => s.setSettings({ geminiKey: k })}
        setModel={(m) => s.setSettings({ geminiModel: m })}
      />
    </>
  );
}

function KeyForm(p: {
  provider: Provider;
  label: string;
  link: ReactNode;
  saved: string;
  models: { id: string; label: string; hint: string }[];
  model: string;
  placeholder: string;
  save: (key: string) => void;
  setModel: (m: string) => void;
}) {
  const [key, setKey] = useState(p.saved);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState('');
  const custom = !p.models.some((m) => m.id === p.model);
  return (
    <div className="rule" style={{ paddingTop: 12, display: 'grid', gap: 10 }}>
      <label className="field">
        <span>{p.label}{p.saved ? ' · added' : ''}</span>
        <div className="row">
          <input className="input" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste key" />
          <button className="btn" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
      </label>
      <p className="small mut">{p.link}</p>
      <label className="field">
        <span>Model</span>
        <select className="input" value={custom ? 'custom' : p.model} onChange={(e) => p.setModel(e.target.value === 'custom' ? '' : e.target.value)}>
          {p.models.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.hint}</option>)}
          <option value="custom">Custom model ID…</option>
        </select>
      </label>
      {custom && <input className="input" placeholder={p.placeholder} value={p.model} onChange={(e) => p.setModel(e.target.value.trim())} aria-label="Custom model ID" />}
      <div className="row">
        <button
          className="btn"
          onClick={async () => {
            setStatus('Testing…');
            try {
              await testKey(p.provider, key, p.model || p.models[0].id);
              setStatus('Key works.');
            } catch (e) {
              setStatus(friendlyError(e, false));
            }
          }}
        >
          Test
        </button>
        <button className="btn primary grow" onClick={() => { p.save(key.trim()); toast(key.trim() ? 'Key saved' : 'Key removed'); }}>Save key</button>
      </div>
      {status && <p className="small" role="status">{status}</p>}
    </div>
  );
}

/** Units, theme and per-device look. */
function LookForm() {
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
      {opt(s.settings.theme, (theme) => s.setSettings({ theme }), [['auto', 'Match device'], ['dark', 'Dark'], ['black', 'Black (OLED)'], ['light', 'Light']])}
      <span className="mono mut">Open the app on (this device)</span>
      <StartPicker />
      <span className="mono mut">Accent colour (this device)</span>
      <AccentPicker />
      <span className="mono mut">Text size (this device)</span>
      <TextSizePicker />
    </>
  );
}

/** What Today shows and how its buttons behave. */
function TodayForm() {
  const s = useStore();
  return (
    <>
      <span className="mono mut">Water bottle button (this device)</span>
      <BottlePicker />
      <span className="mono mut">Training day adds (this device)</span>
      <BoostPicker />
      <span className="mono mut">Training days (this device)</span>
      <TrainDaysPicker />
      <span className="mono mut">Weigh-in reminder (this device)</span>
      <WeighPicker />
      <span className="mono mut">Show on Today (this device)</span>
      <TodayCards />
      <span className="mono mut">Day note tags (this device)</span>
      <TagsEditor />
      <span className="mono mut">Suggestions</span>
      <label className="row small">
        <input type="checkbox" checked={s.settings.wheyOk} onChange={(e) => s.setSettings({ wheyOk: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--fuel)' }} />
        Include whey protein in “Close the gap” (off by default; whey can make acne worse for some people)
      </label>
      <HiddenSuggestions />
    </>
  );
}

function AccentPicker() {
  const { accent, setAccent } = usePrefs();
  return (
    <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Accent colour">
      {ACCENTS.map(([id, label, swatch]) => (
        <button key={id} className="chip" aria-pressed={accent === id} onClick={() => setAccent(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 14, borderRadius: 999, background: swatch, flex: 'none' }} />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Add, remove or reset the one-tap tags under Today's day note. */
function TagsEditor() {
  const { tags, setTags } = usePrefs();
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    setTags([...tags, text]);
    setText('');
  };
  const isDefault = tags.join('|') === NOTE_TAGS.join('|');
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {tags.map((t) => (
          <button key={t} className="chip" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>{t} ✕</button>
        ))}
      </div>
      {tags.length < MAX_TAGS && (
        <div className="row">
          <input className="input grow" value={text} maxLength={24} placeholder="New tag, e.g. School camp" aria-label="New tag" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn sm" disabled={!text.trim()} onClick={add}>Add</button>
        </div>
      )}
      {!isDefault && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setTags([...NOTE_TAGS])}>Reset tags</button>}
    </>
  );
}

function HiddenSuggestions() {
  const { noSuggest, toggleSuggest } = usePrefs();
  if (!noSuggest.length) return null;
  return (
    <>
      <span className="small mut">Not suggested in Close the gap (tap to bring back)</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {noSuggest.map((n) => (
          <button key={n} className="chip" onClick={() => toggleSuggest(n)} style={{ textTransform: 'capitalize' }}>{n} ✕</button>
        ))}
      </div>
    </>
  );
}

/** Rename, add (up to MAX_CHECKS) or remove the food-quality checks on Today. Synced with settings. */
function ChecksForm() {
  const checks = useStore((s) => s.settings.checks);
  const setSettings = useStore((s) => s.setSettings);
  const [rows, setRows] = useState(checks);
  const save = (next: [string, string][]) => {
    setRows(next);
    const valid = next.filter(([, l]) => l.trim());
    if (valid.length) setSettings({ checks: valid.map(([k, l]) => [k, l.trim().slice(0, 30)] as [string, string]) });
  };
  // New keys are random letters, since DayLog.checks keys are a-z only.
  const newKey = () => 'x' + Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  return (
    <>
      <p className="small mut" style={{ margin: 0 }}>Daily ticks on Today, worth 5 XP each. Up to {MAX_CHECKS}.</p>
      {rows.map(([k, label], i) => (
        <div key={k} className="row" style={{ gap: 8 }}>
          <input className="input grow" value={label} maxLength={30} aria-label={`Check ${i + 1}`} onChange={(e) => save(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <button className="btn icon danger" aria-label={`Remove ${label}`} disabled={rows.length <= 1} onClick={() => save(rows.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button>
        </div>
      ))}
      <div className="row">
        {rows.length < MAX_CHECKS && <button className="btn sm" onClick={() => setRows([...rows, [newKey(), '']])}><Icon name="plus" size={14} /> Add a check</button>}
        <button className="btn sm" onClick={() => save(DEFAULT_CHECKS)}>Reset to default</button>
      </div>
    </>
  );
}

function BadgePicker() {
  const { badge, setBadge } = usePrefs();
  const unit = useStore((s) => s.settings.unit);
  const items: [BadgeMode, string][] = [['off', 'Off'], ['protein', 'Protein left (g)'], ['kcal', `Energy left (${unit})`]];
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="App icon badge">
        {items.map(([id, label]) => <button key={id} className="chip" aria-pressed={badge === id} onClick={() => setBadge(id)}>{label}</button>)}
      </div>
      <span className="small mut">Shows on the home-screen icon while the app is installed. It updates when you open the app.</span>
    </>
  );
}

function StartPicker() {
  const { start, setStart } = usePrefs();
  return (
    <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Open the app on">
      {STARTS.map(([id, label]) => <button key={id} className="chip" aria-pressed={start === id} onClick={() => setStart(id)}>{label}</button>)}
    </div>
  );
}

function WeighPicker() {
  const { weighEvery, setWeighEvery } = usePrefs();
  const label: Record<number, string> = { 1: 'Daily', 3: 'Every 3 days', 7: 'Weekly', 14: 'Fortnightly' };
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Weigh-in reminder">
        {WEIGH_EVERY.map((d) => <button key={d} className="chip" aria-pressed={weighEvery === d} onClick={() => setWeighEvery(d)}>{label[d]}</button>)}
      </div>
      <span className="small mut">Daily weigh-ins bounce around; the trend line on Progress smooths them out. Weigh at the same time each day, before eating.</span>
    </>
  );
}

function BottlePicker() {
  const { bottleMl, setBottleMl } = usePrefs();
  return (
    <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Bottle size">
      {BOTTLES.map((ml) => <button key={ml} className="chip" aria-pressed={bottleMl === ml} onClick={() => setBottleMl(ml)}>{ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`}</button>)}
    </div>
  );
}

function BoostPicker() {
  const { boostKcal, setBoostKcal } = usePrefs();
  const unit = useStore((s) => s.settings.unit);
  return (
    <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Training day boost">
      {BOOSTS.map((k) => <button key={k} className="chip" aria-pressed={boostKcal === k} onClick={() => setBoostKcal(k)}>+{unit === 'kJ' ? Math.round(k * KJ) : k} {unit}</button>)}
    </div>
  );
}

/** Weekdays whose target gets the training-day boost by itself. */
function TrainDaysPicker() {
  const { trainDays, setTrainDays } = usePrefs();
  const days: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Training days">
        {days.map(([d, l]) => (
          <button key={d} className="chip" aria-pressed={trainDays.includes(d)} onClick={() => setTrainDays(trainDays.includes(d) ? trainDays.filter((x) => x !== d) : [...trainDays, d])}>{l}</button>
        ))}
      </div>
      <span className="small mut">On these days the boost switches on by itself when you open the app. Turn it off on Today if you skip a session.</span>
    </>
  );
}

function TextSizePicker() {
  const { size, setSize } = usePrefs();
  return (
    <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Text size">
      {SIZES.map(([id, label]) => <button key={id} className="chip" aria-pressed={size === id} onClick={() => setSize(id)}>{label}</button>)}
    </div>
  );
}

function TodayCards() {
  const { hidden, toggle, order, move, resetOrder, quickCount, quickWrap, setQuick } = usePrefs();
  const hideable = (id: string): id is Card => CARDS.some(([c]) => c === id);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="row small">
        <input type="checkbox" checked={!hidden.includes('macros')} onChange={() => toggle('macros')} style={{ width: 20, height: 20, accentColor: 'var(--fuel)' }} />
        Carbs, fat and energy split in the top card
      </label>
      <label className="row small">
        <input type="checkbox" checked={!hidden.includes('train')} onChange={() => toggle('train')} style={{ width: 20, height: 20, accentColor: 'var(--fuel)' }} />
        Training day button in the top card
      </label>
      <span className="small mut">Quick log buttons (your foods always show)</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Quick log buttons">
        {QUICK_ACTIONS.map((id) => (
          <button key={id} className="chip" aria-pressed={!hidden.includes(id)} onClick={() => toggle(id)}>
            {CARDS.find(([c]) => c === id)?.[1]}
          </button>
        ))}
      </div>
      <span className="small mut">Quick log foods</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Quick log foods">
        {QUICK_COUNTS.map((n) => <button key={n} className="chip" aria-pressed={quickCount === n} onClick={() => setQuick({ quickCount: n })}>{n}</button>)}
        <button className="chip" aria-pressed={!quickWrap} onClick={() => setQuick({ quickWrap: false })}>One row</button>
        <button className="chip" aria-pressed={quickWrap} onClick={() => setQuick({ quickWrap: true })}>Show all</button>
      </div>
      <span className="small mut">Cards, top to bottom. Tick to show, arrows to move.</span>
      {order.map((id, i) => (
        <div key={id} className="row" style={{ gap: 8, minHeight: 44 }}>
          {hideable(id) ? (
            <input type="checkbox" aria-label={`Show ${ORDER_LABEL[id]}`} checked={!hidden.includes(id)} onChange={() => toggle(id)} style={{ width: 20, height: 20, accentColor: 'var(--fuel)', flex: 'none' }} />
          ) : (
            <span style={{ width: 20, flex: 'none' }} />
          )}
          <span className="grow" style={hideable(id) && hidden.includes(id) ? { color: 'var(--mut)' } : undefined}>{ORDER_LABEL[id]}</span>
          <button className="btn icon sm" style={{ width: 36 }} aria-label={`Move ${ORDER_LABEL[id]} up`} disabled={i === 0} onClick={() => move(id, -1)}><span style={{ transform: 'rotate(90deg)', display: 'flex' }}><Icon name="left" size={16} /></span></button>
          <button className="btn icon sm" style={{ width: 36 }} aria-label={`Move ${ORDER_LABEL[id]} down`} disabled={i === order.length - 1} onClick={() => move(id, 1)}><span style={{ transform: 'rotate(90deg)', display: 'flex' }}><Icon name="right" size={16} /></span></button>
        </div>
      ))}
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={resetOrder}>Reset order</button>
    </div>
  );
}

function ReminderToggle() {
  const [on, setOn] = useState(remindersOn);
  const [times, setTimes] = useState(reminderTimes);
  const [wrap, setWrapState] = useState(wrapOn);
  const pick = (p: Partial<typeof times>) => {
    setReminderTimes(p);
    setTimes({ ...times, ...p });
  };
  if (!remindersSupported()) return <p className="small mut">This browser can’t show notifications. On iPhone, add the app to your Home Screen first.</p>;
  return (
    <>
      <label className="row small">
        <input
          type="checkbox"
          checked={on}
          style={{ width: 20, height: 20, accentColor: 'var(--fuel)' }}
          onChange={async (e) => {
            const ok = await setReminders(e.target.checked);
            setOn(ok);
            if (e.target.checked && !ok) toast('Notifications are blocked. Allow them for this app in your browser settings.');
          }}
        />
        Remind me to drink water if I haven’t for {times.waterGapH} hour{times.waterGapH === 1 ? '' : 's'} (8 am to 9 pm), and what to eat at {hourLabel(times.foodHour)}
      </label>
      {on && (
        <>
          <span className="small mut">Water reminder after</span>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {WATER_GAPS.map((h) => <button key={h} className="chip" aria-pressed={times.waterGapH === h} onClick={() => pick({ waterGapH: h })}>{h} h</button>)}
          </div>
          <span className="small mut">Food reminder at</span>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {FOOD_HOURS.map((h) => <button key={h} className="chip" aria-pressed={times.foodHour === h} onClick={() => pick({ foodHour: h })}>{hourLabel(h)}</button>)}
          </div>
          <span className="small mut">Nudge me if I haven’t eaten for (until the energy target is hit)</span>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {EAT_GAPS.map((h) => <button key={h} className="chip" aria-pressed={times.eatGapH === h} onClick={() => pick({ eatGapH: h })}>{h ? `${h} h` : 'Off'}</button>)}
          </div>
          <label className="row small">
            <input type="checkbox" checked={wrap} onChange={(e) => { setWrap(e.target.checked); setWrapState(e.target.checked); }} style={{ width: 20, height: 20, accentColor: 'var(--fuel)' }} />
            9 PM wrap-up: today’s totals and what’s left
          </label>
        </>
      )}
      <p className="small mut" style={{ margin: 0 }}>Reminders arrive while the app is open or running in the background. They can’t fire once your phone has fully closed it.</p>
    </>
  );
}

function SyncForm() {
  const { conn, status, error, last } = useSync();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!conn)
    return (
      <>
        <p className="small mut">
          Keeps your log the same on your phone and laptop. It saves a private copy of your data in a secret GitHub Gist on your own account. Do this once on each device:
        </p>
        <ol className="small mut" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
          <li><a href={TOKEN_URL} target="_blank" rel="noreferrer">Open GitHub’s token page</a> (the “gist” permission is already ticked; leave everything else off).</li>
          <li>Set Expiration to <b>No expiration</b>, tap <b>Generate token</b> and copy it (starts with <code>ghp_</code>).</li>
          <li>Paste it here and tap Connect. On your other device, paste the same token.</li>
        </ol>
        <input className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste GitHub token" aria-label="GitHub token" />
        <button
          className="btn primary"
          disabled={busy || !token.trim()}
          onClick={async () => {
            setBusy(true);
            setMsg('');
            try {
              await connect(token);
              setToken('');
              toast('Sync connected');
            } catch (e) {
              setMsg((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        {msg && <p className="small" style={{ color: 'var(--danger)' }} role="alert">{msg}</p>}
      </>
    );

  return (
    <>
      <p className="small" role="status">
        {status === 'syncing' ? 'Syncing…' : status === 'error' ? <span style={{ color: 'var(--danger)' }}>{error}</span> : last ? `Up to date. Last synced ${ago(last)}.` : 'Connected.'}
      </p>
      <p className="small mut">It syncs when you open the app, a few seconds after each change, and every minute while it’s open. Your AI key, theme and recents stay on each device.</p>
      <div className="row">
        <button className="btn primary grow" disabled={status === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
        <button className="btn danger" onClick={() => { disconnect(); toast('Disconnected. Your data stays on this device.'); }}>Disconnect</button>
      </div>
    </>
  );
}

function BackupForm() {
  const s = useStore();
  const connected = !!useSync((x) => x.conn);
  // With sync on, bring in the other device's data first so everything gets cleared/replaced everywhere.
  const withSync = async (fn: () => void) => {
    if (connected) await syncNow();
    fn();
    if (connected) void syncNow();
  };
  const [text, setText] = useState('');
  const [pending, setPending] = useState<AppData | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const download = (name: string, text: string, type: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const doExport = () => {
    download(`fuel-log-backup-${todayKey()}.json`, exportText(dataOf(s)), 'application/json');
    s.markExported();
    toast('Backup downloaded');
  };
  const doCsv = () => {
    download(`fuel-log-${todayKey()}.csv`, exportCsv(dataOf(s)), 'text/csv');
    toast('Spreadsheet downloaded');
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
      <button className="btn" onClick={doCsv}>Download log as a spreadsheet (CSV)</button>
      <p className="small mut" style={{ margin: 0 }}>The spreadsheet is for reading (Excel, Numbers, Google Sheets); only the backup file can be imported again.</p>
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
          <p>This backup has {Object.keys(pending.days).length} logged days and {pending.weighIns.length} weigh-ins. Importing replaces everything{connected ? ', on your synced devices too' : ' here'}.</p>
          <div className="row">
            <button
              className="btn primary grow"
              onClick={() => {
                const g = computeGame(pending, todayKey());
                void withSync(() => s.replaceAll({ ...pending, seen: { level: g.level, badges: g.badges.filter((b) => b.earned).map((b) => b.id) } }));
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
          <button className="btn danger grow" onClick={() => { void withSync(() => s.reset()); setConfirmReset(false); toast('All data cleared'); }}>Delete everything</button>
          <button className="btn" onClick={() => setConfirmReset(false)}>Keep my data</button>
        </div>
      ) : (
        <button className="btn danger" onClick={() => setConfirmReset(true)}>Clear all data</button>
      )}
    </>
  );
}
