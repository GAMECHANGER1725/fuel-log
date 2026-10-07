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
    <button className="btn" style={{ minHeight: 64, fontSize: 28, fontFamily: 'var(--display)', fontStretch: '68%', fontWeight: 800 }} onClick={onClick} aria-label={aria ?? label}>
      {label}
    </button>
  );

  return (
    <main className="app" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <section className="stack" style={{ padding: '48px 16px 0', gap: 12 }}>
        <span className="mono fuel">Calorie + protein tracker</span>
        <h1 className="num" style={{ fontSize: 88, lineHeight: 0.85, textTransform: 'uppercase' }}>Fuel<br />Log</h1>
      </section>

      <div style={{ flex: 1 }} />

      <section className="page" style={{ gap: 20 }}>
        <div className="stack" style={{ alignItems: 'center', gap: 14 }}>
          <span className="mono mut" role="status" style={wrong ? { color: 'var(--danger)' } : undefined}>{wrong ? 'Wrong passcode' : 'Enter passcode'}</span>
          <div className={wrong ? 'shake' : undefined} style={{ display: 'flex', gap: 14 }} aria-label={`${code.length} of ${CODE_LENGTH} digits entered`}>
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <span key={i} style={{ width: 16, height: 16, borderRadius: 2, background: i < code.length ? (wrong ? 'var(--danger)' : 'var(--fuel)') : 'transparent', border: `2px solid ${i < code.length ? 'transparent' : 'var(--line2)'}` }} />
            ))}
          </div>
        </div>
        <div className="grid3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d)))}
          <span />
          {key('0', () => press('0'))}
          <button className="btn" style={{ minHeight: 64 }} aria-label="Delete digit" onClick={() => setCode(code.slice(0, -1))}>
            <Icon name="left" size={24} />
          </button>
        </div>
      </section>
    </main>
  );
}
