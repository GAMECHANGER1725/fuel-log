import { useEffect, useRef, useState } from 'react';
import { useStore } from './lib/store';
import { hasAi } from './lib/ai';
import { Icon, Toast, toast, useGame, useRoute, useToday } from './components/ui';
import Today from './pages/Today';
import FoodPage from './pages/Food';
import Progress from './pages/Progress';
import ProfilePage from './pages/Profile';
import Coach from './pages/Coach';
import LevelUp from './components/LevelUp';
import { WhatsNewOnce } from './components/WhatsNew';
import Lock from './pages/Lock';
import { useAuth } from './lib/auth';
import { startSync, useSync } from './lib/sync';
import { autoDue, checkIn, useCoach } from './lib/coach';
import { startReminders } from './lib/reminders';
import { autoBoostDue, usePrefs } from './lib/prefs';
import { dateOf } from './lib/dates';
import { badgeCount, dayTargets, dayTotals, targetsCrossed } from './lib/nutrition';

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const accent = usePrefs((p) => p.accent);
  const size = usePrefs((p) => p.size);
  const unlocked = useAuth((s) => s.unlocked);
  const { path } = useRoute();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    // Black is the dark theme with blacker surfaces, so every dark rule (accents too) still applies.
    else root.setAttribute('data-theme', theme === 'black' ? 'dark' : theme);
    root.toggleAttribute('data-black', theme === 'black');
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#14110E');
  }, [theme]);

  useEffect(() => {
    if (accent === 'ember') document.documentElement.removeAttribute('data-accent');
    else document.documentElement.setAttribute('data-accent', accent);
  }, [accent]);

  useEffect(() => {
    if (size === 'normal') document.documentElement.removeAttribute('data-size');
    else document.documentElement.setAttribute('data-size', size);
  }, [size]);

  useEffect(() => {
    // Ask the browser not to evict our data under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  // Background sync runs only while signed in.
  useEffect(() => (unlocked ? startSync() : undefined), [unlocked]);
  useEffect(() => (unlocked ? startReminders() : undefined), [unlocked]);
  const sync = useSync();

  // Weekly coach check-in, by itself. With sync on, waits for the first sync so it works from both devices' data.
  const hasKey = useStore((s) => hasAi(s.settings));
  const auto = useCoach((c) => c.auto);
  const today = useToday();
  const synced = !sync.conn || (sync.status !== 'syncing' && (!!sync.last || sync.status === 'error'));
  useEffect(() => {
    if (!unlocked || !hasKey || !synced || !autoDue(today)) return;
    const t = setTimeout(() => {
      if (!autoDue(today)) return;
      useCoach.getState().set({ tried: Date.now() });
      checkIn()
        .then((r) => r.applied && toast('Your coach updated your targets. See Coach.'))
        .catch(() => {}); // Tried again in a few hours.
    }, 3000);
    return () => clearTimeout(t);
  }, [unlocked, hasKey, synced, auto, today]);

  // Training days chosen in Profile get the boost by themselves, once a day (turning it off again sticks).
  const trainDays = usePrefs((p) => p.trainDays);
  useEffect(() => {
    if (!unlocked) return;
    const p = usePrefs.getState();
    const s = useStore.getState();
    if (!autoBoostDue(today, dateOf(today).getDay(), trainDays, p.lastAutoBoost, !!s.days[today]?.boost)) return;
    s.setBoost(today, p.boostKcal);
    p.setLastAutoBoost(today);
  }, [unlocked, today, trainDays]);

  // What's left today on the home-screen icon, where the phone supports app badges (installed PWA).
  // ponytail: set only while the app runs, so after midnight it shows yesterday's number until it's opened.
  const badge = usePrefs((p) => p.badge);
  const badgeNum = useStore((s) => badgeCount(badge, dayTargets(s.settings.targets, s.days[today]), dayTotals(s.days[today]), s.settings.unit));
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    (unlocked && badgeNum ? nav.setAppBadge(badgeNum) : nav.clearAppBadge?.())?.catch(() => {});
  }, [unlocked, badgeNum]);

  const online = useOnline();
  if (!unlocked) return <Lock />;

  const page =
    path === 'food' ? <FoodPage /> : path === 'coach' ? <Coach /> : path === 'progress' ? <Progress /> : path === 'profile' ? <ProfilePage /> : <Today />;

  return (
    <div className="app">
      {sync.status === 'error' && sync.kind !== 'offline' && sync.kind !== 'rate' && path !== 'profile' && (
        <a href="#/profile?open=sync" className="card tight" style={{ display: 'block', margin: '12px 16px 0', boxShadow: 'inset 0 0 0 1.5px var(--danger)', color: 'var(--ink)', textDecoration: 'none' }}>
          <span className="mono" style={{ color: 'var(--danger)' }}>Sync problem</span>
          <span className="small" style={{ display: 'block' }}>{sync.error} Tap to fix.</span>
        </a>
      )}
      {!online && (
        <div className="offline" role="status">Offline. Logging still works; sync catches up when you’re back.</div>
      )}
      {page}
      <Nav path={path} />
      <Celebrations />
      <WhatsNewOnce />
      <TargetCheer />
      <Toast />
    </div>
  );
}

function Nav({ path }: { path: string }) {
  const link = (to: string, icon: string, label: string) => (
    <a href={`#/${to}`} aria-current={path === to ? 'page' : undefined} aria-label={label}>
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );
  return (
    <nav className="nav" aria-label="Sections">
      <div>
        {link('today', 'today', 'Today')}
        {link('coach', 'bolt', 'Coach')}
        <a href="#/food?mode=new" className="fab" aria-label="Add food">
          <Icon name="plus" size={26} stroke={2.6} />
        </a>
        {link('progress', 'trend', 'Progress')}
        {link('profile', 'star', 'Profile')}
      </div>
    </nav>
  );
}

/** Whether the browser thinks it's online, kept up to date. */
function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

/** A toast when today's log first passes the energy or protein target. */
function TargetCheer() {
  const today = useToday();
  const day = useStore((s) => s.days[today]);
  const T = dayTargets(useStore((s) => s.settings.targets), day);
  const t = dayTotals(day);
  const prev = useRef<{ date: string; kcal: number; protein: number } | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = { date: today, kcal: t.kcal, protein: t.protein };
    if (!before || before.date !== today) return;
    const hit = targetsCrossed({ ...t, ...before }, t, T);
    if (!hit.kcal && !hit.protein) return;
    // After the "+XP" toast for the add that did it.
    const msg = hit.kcal && hit.protein ? 'Both targets hit today. Great work!' : hit.kcal ? 'Energy target hit for today!' : 'Protein target hit for today!';
    const timer = setTimeout(() => toast(msg), 1600);
    return () => clearTimeout(timer);
  }, [t.kcal, t.protein, today]);
  return null;
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
