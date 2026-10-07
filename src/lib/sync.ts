// Sync between devices through ONE private (secret) GitHub Gist that holds `fuel-log-sync.json`.
// Each device needs a GitHub token with only the "gist" permission, pasted once in Profile.
// The token lives in this browser only (never in the synced file, backups, or the repo).
// Sync = read the gist, merge with local (see syncdoc.ts), apply, and write back only if it changed.

import { create } from 'zustand';
import { dataOf, useStore } from './store';
import { mergeDocs, parseDoc, sameDoc, toDoc, type SyncDoc } from './syncdoc';
import { computeGame } from './game';
import { todayKey } from './dates';

const API = 'https://api.github.com';
const FILE = 'fuel-log-sync.json';
const LS_KEY = 'fuel-log-sync';
export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Fuel%20Log%20sync';

interface Conn {
  token: string;
  gistId: string;
}

const readConn = (): Conn | null => {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
    return v && typeof v.token === 'string' && typeof v.gistId === 'string' ? v : null;
  } catch {
    return null;
  }
};
const writeConn = (c: Conn | null) => {
  try {
    if (c) localStorage.setItem(LS_KEY, JSON.stringify(c));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* storage blocked: stays connected for this session only */
  }
};

export const useSync = create<{ conn: Conn | null; status: 'off' | 'idle' | 'syncing' | 'error'; error: string; kind: string; last: number | null }>(() => {
  const conn = readConn();
  return { conn, status: conn ? 'idle' : 'off', error: '', kind: '', last: null };
});

// ----- GitHub API --------------------------------------------------------------

type ErrKind = 'auth' | 'gone' | 'rate' | 'offline' | 'bad' | 'http';
export class SyncError extends Error {
  constructor(
    public kind: ErrKind,
    message: string,
  ) {
    super(message);
  }
}

export function friendly(e: unknown): string {
  const kind = e instanceof SyncError ? e.kind : 'http';
  switch (kind) {
    case 'auth': return 'GitHub didn’t accept that token. Make a new one with the “gist” permission only.';
    case 'gone': return 'The sync gist was deleted. Disconnect and connect again to make a new one.';
    case 'rate': return 'GitHub is limiting requests for a moment. It will retry.';
    case 'offline': return 'Offline. It will sync when you’re back online.';
    case 'bad': return 'The sync file on GitHub is damaged, so nothing was overwritten. Delete the “fuel-log-sync.json” gist and connect again.';
    default: return `Sync failed${e instanceof Error && e.message ? `: ${e.message}` : ''}.`;
  }
}

async function gh(token: string, path: string, init: RequestInit = {}, missing: ErrKind = 'gone'): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      cache: 'no-store', // GitHub allows caching a GET for a minute, which would show stale data
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('offline', 'Network error');
  }
  if (res.ok) return res;
  if (res.status === 401) throw new SyncError('auth', 'Bad token');
  if (res.status === 404) throw new SyncError(missing, 'Not found');
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) throw new SyncError('rate', 'Rate limited');
  if (res.status === 403) throw new SyncError('auth', 'Token lacks the gist permission');
  throw new SyncError('http', `GitHub said ${res.status}`);
}

const body = (doc: SyncDoc) => JSON.stringify({ files: { [FILE]: { content: JSON.stringify(doc) } } });

async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const list = (await (await gh(token, `/gists?per_page=100&page=${page}`, {}, 'auth')).json()) as { id: string; files: Record<string, unknown> }[];
    const hit = list.find((g) => FILE in g.files);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

async function createGist(token: string, doc: SyncDoc): Promise<string> {
  const res = await gh(token, '/gists', { method: 'POST', body: JSON.stringify({ description: 'Fuel Log sync data (managed by the app)', public: false, files: { [FILE]: { content: JSON.stringify(doc) } } }) });
  return ((await res.json()) as { id: string }).id;
}

async function readGist({ token, gistId }: Conn): Promise<SyncDoc | null> {
  const g = (await (await gh(token, `/gists/${gistId}`)).json()) as { files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }> };
  const f = g.files?.[FILE];
  if (!f) return null;
  let text = f.content;
  if (f.truncated || typeof text !== 'string') {
    try {
      text = await (await fetch(f.raw_url!, { cache: 'no-store' })).text();
    } catch {
      throw new SyncError('offline', 'Network error');
    }
  }
  try {
    return parseDoc(text);
  } catch {
    throw new SyncError('bad', 'Unreadable sync file');
  }
}

// ----- Sync runner ----------------------------------------------------------------

let inflight: Promise<void> | null = null;
let queued = false;
let applying = false;

/** Merge with the gist now. Calls made while a sync is running are folded into one follow-up run. */
export function syncNow(): Promise<void> {
  if (inflight) {
    queued = true;
    return inflight;
  }
  inflight = run().finally(() => {
    inflight = null;
    if (queued) {
      queued = false;
      void syncNow();
    }
  });
  return inflight;
}

async function run() {
  const conn = useSync.getState().conn;
  if (!conn) return;
  useSync.setState({ status: 'syncing' });
  try {
    const remote = await readGist(conn);
    // No await from here to the apply, so we merge against the freshest local state.
    const local = toDoc(dataOf(useStore.getState()));
    const merged = remote ? mergeDocs(local, remote) : local;
    if (!sameDoc(merged, local)) {
      applying = true;
      try {
        useStore.getState().applySynced(merged);
        // Level-ups and badges from the other device shouldn't pop up here.
        const g = computeGame(dataOf(useStore.getState()), todayKey());
        useStore.getState().markSeen(g.level, g.badges.filter((b) => b.earned).map((b) => b.id));
      } finally {
        applying = false;
      }
    }
    if (!remote || !sameDoc(merged, remote)) await gh(conn.token, `/gists/${conn.gistId}`, { method: 'PATCH', body: body(merged) });
    useSync.setState({ status: 'idle', error: '', kind: '', last: Date.now() });
  } catch (e) {
    useSync.setState({ status: 'error', error: friendly(e), kind: e instanceof SyncError ? e.kind : 'http' });
  }
}

/** Link this device: reuse the sync gist if one exists on the account, else create it. Throws a friendly message. */
export async function connect(rawToken: string): Promise<void> {
  const token = rawToken.trim();
  if (!token) throw new Error('Paste your GitHub token first.');
  try {
    const gistId = (await findGist(token)) ?? (await createGist(token, toDoc(dataOf(useStore.getState()))));
    const conn = { token, gistId };
    writeConn(conn);
    useSync.setState({ conn, status: 'idle', error: '', kind: '' });
  } catch (e) {
    throw new Error(friendly(e));
  }
  await syncNow();
}

export function disconnect() {
  writeConn(null);
  useSync.setState({ conn: null, status: 'off', error: '', kind: '', last: null });
}

/** Start background syncing: on open, after changes, when you come back to the app, and every minute. */
export function startSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useStore.subscribe((s, prev) => {
    if (applying || !useSync.getState().conn) return;
    if (s.days !== prev.days || s.tomb !== prev.tomb || s.mod !== prev.mod) {
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), 3000);
    }
  });
  const visible = () => document.visibilityState === 'visible' && void syncNow();
  const online = () => void syncNow();
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('online', online);
  const poll = setInterval(visible, 60_000);
  void syncNow();
  return () => {
    unsub();
    clearTimeout(timer);
    clearInterval(poll);
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('online', online);
  };
}
