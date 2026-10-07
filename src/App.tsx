import { useEffect, useState } from 'react';
import { useStore } from './lib/store';
import { Icon, Toast, toast, useGame, useRoute } from './components/ui';
import Today from './pages/Today';
import FoodPage from './pages/Food';
import Progress from './pages/Progress';
import ProfilePage from './pages/Profile';
import Onboarding from './pages/Onboarding';
import LevelUp from './components/LevelUp';

export default function App() {
  const onboarded = useStore((s) => s.onboarded);
  const theme = useStore((s) => s.settings.theme);
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

  useEffect(() => window.scrollTo(0, 0), [path]);

  if (!onboarded) return <Onboarding />;

  const page =
    path === 'food' ? <FoodPage /> : path === 'progress' ? <Progress /> : path === 'profile' ? <ProfilePage /> : <Today />;

  return (
    <div className="app">
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
