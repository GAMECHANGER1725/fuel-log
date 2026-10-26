import { useEffect, useState } from 'react';
import { CODE_LENGTH, useAuth } from '../lib/auth';
import { Icon } from '../components/ui';

export default function Lock() {
  const unlock = useAuth((s) => s.unlock);
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);

  const press = (d: string) => {
    if (code.length >= CODE_LENGTH) return;
    setWrong(false);
    setCode(code + d);
  };

  useEffect(() => {
    if (code.length < CODE_LENGTH) return;
    unlock(code).then((ok) => {
      if (!ok) {
        setWrong(true);
        navigator.vibrate?.(120);
        setTimeout(() => setCode(''), 350);
      }
    });
  }, [code, unlock]);

  // Hardware keyboard support on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const key = (label: string, onClick: () => void, aria?: string) => (
    <button className="btn num" style={{ minHeight: 68, fontSize: 28, borderRadius: 24 }} onClick={onClick} aria-label={aria ?? label}>
      {label}
    </button>
  );

  return (
    <main className="app" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <section className="stack" style={{ padding: '56px 20px 0', gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 20, background: 'var(--acc)', color: 'var(--on-acc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="flame" size={30} stroke={2.2} />
        </div>
        <h1 className="num" style={{ fontSize: 56, lineHeight: 0.95 }}>
          Fuel
          <br />
          Log
        </h1>
        <p className="mut">Calories and protein for your bulk.</p>
      </section>

      <div style={{ flex: 1 }} />

      <section className="page" style={{ gap: 20 }}>
        <div className="stack" style={{ alignItems: 'center', gap: 14 }}>
          <span className="mono mut" role="status" style={wrong ? { color: 'var(--danger)' } : undefined}>{wrong ? 'Wrong passcode' : 'Enter passcode'}</span>
          <div className={wrong ? 'shake' : undefined} style={{ display: 'flex', gap: 16 }} aria-label={`${code.length} of ${CODE_LENGTH} digits entered`}>
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <span key={i} style={{ width: 16, height: 16, borderRadius: 999, background: i < code.length ? (wrong ? 'var(--danger)' : 'var(--acc)') : 'transparent', boxShadow: i < code.length ? 'none' : 'inset 0 0 0 2px var(--line2)' }} />
            ))}
          </div>
        </div>
        <div className="grid3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d)))}
          <span />
          {key('0', () => press('0'))}
          <button className="btn" style={{ minHeight: 68, borderRadius: 24, background: 'transparent' }} aria-label="Delete digit" onClick={() => setCode(code.slice(0, -1))}>
            <Icon name="left" size={24} />
          </button>
        </div>
      </section>
    </main>
  );
}
