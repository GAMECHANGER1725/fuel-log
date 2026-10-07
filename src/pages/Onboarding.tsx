import { useState } from 'react';
import { useStore } from '../lib/store';
import { suggestTargets } from '../lib/targets';
import { parseBackup } from '../lib/backup';
import { computeGame } from '../lib/game';
import { todayKey } from '../lib/dates';
import { fmt } from '../lib/nutrition';
import type { Activity, Profile } from '../lib/types';

export default function Onboarding() {
  const s = useStore();
  const [p, setP] = useState({ name: '', heightCm: '', weightKg: '', age: '', sex: 'male' as Profile['sex'], activity: 'moderate' as Activity, goalKg: '' });
  const [err, setErr] = useState('');
  const n = (v: string) => parseFloat(v) || 0;
  const valid = n(p.heightCm) >= 100 && n(p.heightCm) <= 250 && n(p.weightKg) >= 25 && n(p.weightKg) <= 300 && n(p.age) >= 10 && n(p.age) <= 100;
  const profile: Profile = { name: p.name.trim().slice(0, 40), heightCm: n(p.heightCm), weightKg: n(p.weightKg), age: Math.round(n(p.age)), sex: p.sex, activity: p.activity, goalKg: n(p.goalKg) || null };
  const t = valid ? suggestTargets(profile) : null;
  const field = (k: keyof typeof p, label: string, mode: 'text' | 'decimal' = 'decimal', ph = '') => (
    <label className="field">
      <span>{label}</span>
      <input className="input" inputMode={mode} type={mode === 'text' ? 'text' : 'number'} value={p[k]} placeholder={ph} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
    </label>
  );

  return (
    <div className="app" style={{ paddingBottom: 40 }}>
      <section style={{ padding: '40px 16px 24px' }} className="stack">
        <span className="mono fuel">Calorie + protein tracker</span>
        <h1 className="num" style={{ fontSize: 88, lineHeight: 0.85, textTransform: 'uppercase' }}>Fuel<br />Log</h1>
        <p className="mut" style={{ maxWidth: 320 }}>Log food in seconds: scan barcodes, snap your plate or just describe it. Earn XP, keep your streak, beat the weekly boss.</p>
      </section>

      <div className="page">
        <section className="card stack" style={{ gap: 12 }}>
          <h2 className="h2">Set up</h2>
          {field('name', 'First name (optional)', 'text')}
          <div className="grid3">
            {field('heightCm', 'Height cm', 'decimal', '175')}
            {field('weightKg', 'Weight kg', 'decimal', '60')}
            {field('age', 'Age', 'decimal', '15')}
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {(['male', 'female'] as const).map((x) => <button key={x} className="chip" aria-pressed={p.sex === x} onClick={() => setP({ ...p, sex: x })}>{x === 'male' ? 'Male' : 'Female'}</button>)}
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {(['light', 'moderate', 'high'] as const).map((a) => (
              <button key={a} className="chip" aria-pressed={p.activity === a} onClick={() => setP({ ...p, activity: a })}>
                {a === 'light' ? 'Light activity' : a === 'moderate' ? 'Gym 3–4×/week' : 'Very active'}
              </button>
            ))}
          </div>
          {field('goalKg', 'Goal weight kg (optional)')}
          {t && (
            <div className="card hot stack" style={{ gap: 4 }}>
              <span className="mono" style={{ fontWeight: 600 }}>Your starting targets</span>
              <span className="num" style={{ fontSize: 36, lineHeight: 1 }}>{fmt(t.kcal)} kcal · {t.protein} g protein</span>
              <span className="small">A lean bulk: maintenance plus about 350 kcal. The app checks your weight trend each week and suggests changes. You can edit these any time in Profile.</span>
            </div>
          )}
          <button className="btn primary block" disabled={!t} onClick={() => t && s.finishOnboarding(profile, t)}>Start logging</button>
        </section>

        <section className="card stack">
          <h2 className="h2">Already have a backup?</h2>
          <p className="small mut">Import a Fuel Log backup, including one exported from the original Fuel Log artifact.</p>
          <input
            type="file"
            accept=".json,application/json,text/plain"
            aria-label="Choose a backup file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const d = parseBackup(await f.text());
                const g = computeGame(d, todayKey());
                s.replaceAll({ ...d, onboarded: true, seen: { level: g.level, badges: g.badges.filter((b) => b.earned).map((b) => b.id) } });
              } catch {
                setErr('That file isn’t a Fuel Log backup.');
              }
            }}
          />
          {err && <p className="small" style={{ color: 'var(--danger)' }} role="alert">{err}</p>}
        </section>
        <p className="small mut">Talk to a parent and your GP before making big changes to how you eat. Your data stays on this phone.</p>
      </div>
    </div>
  );
}
