import { useEffect, useState } from 'react';
import { useStore } from './lib/store';
import { Icon, Toast, toast, useGame, useRoute } from './components/ui';
import Today from './pages/Today';
import FoodPage from './pages/Food';
import Progress from './pages/Progress';
import ProfilePage from './pages/Profile';
import LevelUp from './components/LevelUp';
import Lock from './pages/Lock';
import { useAuth } from './lib/auth';
import { startSync, useSync } from './lib/sync';

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const unlocked = useAuth((s) => s.unlocked);
  const { path } = useRoute();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0E0F0C');
  }, [theme]);

  useEffect(() => {
    // Ask the browser not to evict our data under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  // Background sync runs only while signed in.
  useEffect(() => (unlocked ? startSync() : undefined), [unlocked]);
  const sync = useSync();

  if (!unlocked) return <Lock />;

  const page =
    path === 'food' ? <FoodPage /> : path === 'progress' ? <Progress /> : path === 'profile' ? <ProfilePage /> : <Today />;

  return (
    <div className="app">
      {sync.status === 'error' && sync.kind !== 'offline' && sync.kind !== 'rate' && path !== 'profile' && (
        <a href="#/profile?open=sync" className="card tight" style={{ display: 'block', margin: '12px 16px 0', borderColor: 'var(--danger)', color: 'var(--ink)', textDecoration: 'none' }}>
          <span className="mono" style={{ color: 'var(--danger)' }}>Sync problem</span>
          <span className="small" style={{ display: 'block' }}>{sync.error} Tap to fix.</span>
        </a>
      )}
      {page}
      <Nav path={path} />
      <Celebrations />
      <Toast />
    </div>
  );
}

function Nav({ path }: { path: string }) {
  const link = (to: string, icon: string, label: string) => (
    <a href={`#/${to}`} aria-current={path === to ? 'page' : undefined}>
      <Icon name={icon} />
      <span className="mono" style={{ fontSize: 10 }}>{label}</span>
    </a>
  );
  return (
    <nav className="nav" aria-label="Sections">
      <div>
        {link('today', 'today', 'Today')}
        {link('food', 'search', 'Food')}
        <a href="#/food?mode=new" className="fab" aria-label="Add food">
          <Icon name="plus" size={26} stroke={3} />
        </a>
        {link('progress', 'trend', 'Progress')}
        {link('profile', 'star', 'Profile')}
      </div>
    </nav>
  );
}

/** Level-ups get a full-screen moment; new badges get a toast. */
function Celebrations() {
  const g = useGame();
  const seen = useStore((s) => s.seen);
  const markSeen = useStore((s) => s.markSeen);
  const [show, setShow] = useState<number | null>(null);
  const earned = g.badges.filter((b) => b.earned).map((b) => b.id);
  const fresh = g.badges.filter((b) => b.earned && !seen.badges.includes(b.id));

  useEffect(() => {
    if (g.level > seen.level) setShow(g.level);
    else if (fresh.length) {
      markSeen(Math.max(seen.level, g.level), earned);
      // Let the "+XP" toast for the action that earned it show first.
      setTimeout(() => toast(`Badge unlocked: ${fresh.map((b) => b.name).join(', ')}`), 1600);
    } else if (g.level < seen.level) markSeen(g.level, seen.badges);
  }, [g.level, fresh.length]);

  if (show === null) return null;
  return (
    <LevelUp
      level={show}
      game={g}
      onClose={() => {
        setShow(null);
        markSeen(g.level, earned);
      }}
    />
  );
}
