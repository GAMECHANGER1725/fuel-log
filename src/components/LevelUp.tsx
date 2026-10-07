import { useEffect } from 'react';
import { rankFor, RANKS, type Game } from '../lib/game';

export default function LevelUp({ level, game, onClose }: { level: number; game: Game; onClose: () => void }) {
  const rank = rankFor(level);
  const newRank = RANKS.some((r) => r.level === level);
  useEffect(() => {
    navigator.vibrate?.([30, 40, 60]);
  }, []);
  const line = newRank
    ? `New rank. You're ${/^[AEIOU]/.test(rank.name) ? 'an' : 'a'} ${rank.name} now.`
    : game.streak.current >= 2
      ? `${game.streak.current} days logged in a row. You're eating like you mean it.`
      : 'Every meal you log stacks up. Keep it going.';
  return (
    <div className="levelup" role="dialog" aria-modal="true" aria-label={`Level ${level} reached`}>
      <span className="num ghost" aria-hidden="true">{level}</span>
      <span className="mono" style={{ fontWeight: 600 }}>Level up</span>
      <span className="num big" style={{ marginTop: 12 }}>{level}</span>
      <span className="num" style={{ fontSize: 64, lineHeight: 0.9, textTransform: 'uppercase', marginTop: 8 }}>{rank.name}</span>
      <p style={{ marginTop: 12, fontSize: 16, maxWidth: 300 }}>{line}</p>
      <div style={{ flex: 1 }} />
      <div className="rows" style={{ borderTop: '2px solid #0e0f0c' }}>
        <div><span>Total XP</span><span className="mono" style={{ fontWeight: 600 }}>{game.xp.toLocaleString('en-AU')}</span></div>
        <div><span>Next rank</span><span className="mono" style={{ fontWeight: 600 }}>{rank.next ? `${rank.next.name} · level ${rank.next.level}` : 'Max rank'}</span></div>
        <div><span>Streak freezes</span><span className="mono" style={{ fontWeight: 600 }}>{game.streak.freezes} banked</span></div>
      </div>
      <button className="btn block" style={{ marginTop: 20, background: '#0e0f0c', color: '#f2f1ea', borderColor: '#0e0f0c', minHeight: 56 }} onClick={onClose} autoFocus>
        Keep fuelling
      </button>
    </div>
  );
}
