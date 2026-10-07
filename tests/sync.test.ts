import { beforeEach, describe, expect, it, vi } from 'vitest';

// Browser storage for the stores, and a clock we can step so edits get distinct timestamps.
vi.hoisted(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

import { dataOf, useStore } from '../src/lib/store';
import { connect, disconnect, syncNow, useSync } from '../src/lib/sync';
import { DEFAULT_DATA } from '../src/lib/backup';
import { applyDoc, mergeDocs, parseDoc, toDoc } from '../src/lib/syncdoc';
import type { AppData, Entry } from '../src/lib/types';

// ---- A fake GitHub Gists API ------------------------------------------------------
const gists = new Map<string, { id: string; files: Record<string, { content: string }> }>();
let calls: string[] = [];
const GOOD = 'ghp_good';

async function fakeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url);
  const method = init.method ?? 'GET';
  calls.push(`${method} ${u.pathname}`);
  const auth = (init.headers as Record<string, string>)?.Authorization;
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
  if (auth !== `Bearer ${GOOD}`) return json({ message: 'Bad credentials' }, 401);
  if (u.pathname === '/gists' && method === 'GET') return json([...gists.values()].map((g) => ({ id: g.id, files: Object.fromEntries(Object.keys(g.files).map((f) => [f, {}])) })));
  if (u.pathname === '/gists' && method === 'POST') {
    const b = JSON.parse(init.body as string);
    expect(b.public).toBe(false); // must be a secret gist
    const id = `gist${gists.size + 1}`;
    gists.set(id, { id, files: b.files });
    return json({ id }, 201);
  }
  const m = u.pathname.match(/^\/gists\/(\w+)$/);
  const g = m && gists.get(m[1]);
  if (!g) return json({ message: 'Not Found' }, 404);
  if (method === 'PATCH') {
    Object.assign(g.files, JSON.parse(init.body as string).files);
    return json({ id: g.id });
  }
  return json(g);
}

// ---- Two devices sharing one browser-less environment ------------------------------------
type Dev = { data: AppData; conn: ReturnType<typeof useSync.getState>['conn'] };
const devs: Record<string, Dev> = {};
let cur = '';
function on(name: string) {
  if (cur) devs[cur] = { data: dataOf(useStore.getState()), conn: useSync.getState().conn };
  cur = name;
  const d = devs[name] ?? { data: structuredClone(DEFAULT_DATA), conn: null };
  useStore.setState({ ...d.data });
  useSync.setState({ conn: d.conn, status: d.conn ? 'idle' : 'off', error: '' });
}
let clock = 1_790_000_000_000;
const tick = (ms = 1000) => void vi.setSystemTime((clock += ms));
const log = (name: string, kcal = 300) => {
  tick();
  useStore.getState().addEntries('2026-10-07', [{ name, serving: '', base: { kcal, protein: 10, carbs: 0, fat: 0 }, qty: 1, source: 'db' }]);
};
const names = () => (useStore.getState().days['2026-10-07']?.entries ?? []).map((e) => e.name).sort();
const idOf = (name: string) => useStore.getState().days['2026-10-07'].entries.find((e) => e.name === name)!.id;
const remote = () => parseDoc(gists.get('gist1')!.files['fuel-log-sync.json'].content);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubGlobal('fetch', fakeFetch);
  gists.clear();
  calls = [];
  for (const k of Object.keys(devs)) delete devs[k];
  cur = '';
  clock += 10_000_000;
  tick();
});

describe('sync between two devices (fake GitHub)', () => {
  it('creates a secret gist on the first device and the second finds it', async () => {
    on('phone');
    log('oats');
    log('milk');
    await connect(GOOD);
    expect(gists.size).toBe(1);
    expect(remote().days['2026-10-07'].entries.map((e) => e.name).sort()).toEqual(['milk', 'oats']);

    on('laptop');
    expect(names()).toEqual([]);
    await connect(GOOD);
    expect(gists.size).toBe(1); // reused, not duplicated
    expect(names()).toEqual(['milk', 'oats']);
  });

  it('merges food logged on both devices without losing either', async () => {
    on('phone'); log('oats'); await connect(GOOD);
    on('laptop'); await connect(GOOD);
    log('laptop-lunch');
    on('phone'); log('phone-snack');
    await syncNow(); // phone pushes
    on('laptop'); await syncNow(); // laptop merges + pushes
    on('phone'); await syncNow();
    expect(names()).toEqual(['laptop-lunch', 'oats', 'phone-snack']);
    on('laptop');
    expect(names()).toEqual(['laptop-lunch', 'oats', 'phone-snack']);
  });

  it('keeps a deleted item deleted on both devices', async () => {
    on('phone'); log('oats'); log('mistake'); await connect(GOOD);
    on('laptop'); await connect(GOOD);
    on('phone'); tick(); useStore.getState().removeEntry('2026-10-07', idOf('mistake')); await syncNow();
    on('laptop'); await syncNow();
    expect(names()).toEqual(['oats']);
    await syncNow(); on('phone'); await syncNow();
    expect(names()).toEqual(['oats']);
  });

  it('later edit wins; later water change wins', async () => {
    on('phone'); log('oats'); await connect(GOOD);
    on('laptop'); await connect(GOOD);
    on('phone'); tick(); useStore.getState().updateEntry('2026-10-07', idOf('oats'), { qty: 2 }); useStore.getState().setWater('2026-10-07', 5); await syncNow();
    on('laptop'); await syncNow();
    expect(useStore.getState().days['2026-10-07'].entries[0].qty).toBe(2);
    expect(useStore.getState().days['2026-10-07'].water).toBe(5);
    tick(); useStore.getState().setWater('2026-10-07', 1); await syncNow(); // laptop lowers it later
    on('phone'); await syncNow();
    expect(useStore.getState().days['2026-10-07'].water).toBe(1);
  });

  it('newest change to targets wins, and Gemini key and theme stay per device', async () => {
    on('phone'); await connect(GOOD);
    useStore.getState().setSettings({ geminiKey: 'PHONE-KEY', theme: 'dark' });
    on('laptop'); await connect(GOOD);
    useStore.getState().setSettings({ geminiKey: 'LAPTOP-KEY', theme: 'light' });
    tick(); useStore.getState().setTargets({ kcal: 3300, protein: 120, carbs: 480, fat: 90 }); await syncNow();
    on('phone'); await syncNow();
    expect(useStore.getState().settings.targets.kcal).toBe(3300);
    expect(useStore.getState().settings.geminiKey).toBe('PHONE-KEY');
    expect(useStore.getState().settings.theme).toBe('dark');
    // Nothing secret ever reaches the gist.
    const raw = gists.get('gist1')!.files['fuel-log-sync.json'].content;
    expect(raw).not.toMatch(/KEY|geminiKey|ghp_/);
  });

  it('first sync from pre-sync data (no timestamps) keeps the phone weigh-ins, targets and favourites', async () => {
    on('phone');
    // Simulate data saved before sync existed: tracked changes with mod 0.
    useStore.setState({ weighIns: [{ date: '2026-10-01', kg: 58.3 }, { date: '2026-10-06', kg: 58.9 }], mod: 0 });
    useStore.setState({ settings: { ...useStore.getState().settings, targets: { kcal: 3300, protein: 120, carbs: 480, fat: 90 } }, favourites: [{ id: 'fav-1', name: 'My shake', serving: '1', kcal: 500, protein: 30, carbs: 50, fat: 10 }] });
    await connect(GOOD);
    on('laptop'); // fresh install, also mod 0
    await connect(GOOD);
    expect(useStore.getState().weighIns.map((w) => w.kg)).toEqual([58.3, 58.9]);
    expect(useStore.getState().settings.targets.kcal).toBe(3300);
    expect(useStore.getState().favourites.map((f) => f.name)).toEqual(['My shake']);
    on('phone'); await syncNow();
    expect(useStore.getState().weighIns).toHaveLength(2);
    expect(useStore.getState().settings.targets.kcal).toBe(3300);
  });

  it('two devices with different old data both keep everything, and settle (no ping-pong)', async () => {
    on('phone');
    useStore.setState({ weighIns: [{ date: '2026-10-01', kg: 58.3 }], mod: 0 });
    await connect(GOOD);
    on('laptop');
    useStore.setState({ weighIns: [{ date: '2026-10-05', kg: 58.7 }], mod: 0 });
    await connect(GOOD);
    on('phone'); await syncNow();
    on('laptop'); await syncNow();
    on('phone'); calls = []; await syncNow();
    expect(calls.filter((c) => c.startsWith('PATCH'))).toEqual([]);
    expect(useStore.getState().weighIns.map((w) => w.date)).toEqual(['2026-10-01', '2026-10-05']);
    on('laptop');
    expect(useStore.getState().weighIns.map((w) => w.date)).toEqual(['2026-10-01', '2026-10-05']);
  });

  it('saving only a Gemini key does not count as a settings change', async () => {
    on('phone'); await connect(GOOD);
    on('laptop'); await connect(GOOD);
    tick(); useStore.getState().setTargets({ kcal: 3200, protein: 115, carbs: 470, fat: 88 }); await syncNow();
    on('phone'); tick(); useStore.getState().setSettings({ geminiKey: 'new-key' }); await syncNow();
    expect(useStore.getState().settings.targets.kcal).toBe(3200); // not reverted by the stale phone copy
  });

  it('clearing all data on one device clears the other', async () => {
    on('phone'); log('oats'); log('milk'); await connect(GOOD);
    on('laptop'); await connect(GOOD);
    on('phone'); tick(); await syncNow(); useStore.getState().reset(); await syncNow();
    on('laptop'); await syncNow();
    expect(names()).toEqual([]);
    on('phone'); await syncNow();
    expect(names()).toEqual([]);
  });

  it('is stable: a second sync with no changes does not write', async () => {
    on('phone'); log('oats'); await connect(GOOD);
    calls = [];
    await syncNow();
    expect(calls.filter((c) => c.startsWith('PATCH'))).toEqual([]);
  });

  it('rejects a bad token without connecting', async () => {
    on('phone');
    await expect(connect('wrong')).rejects.toThrow(/didn’t accept that token/);
    expect(useSync.getState().conn).toBeNull();
  });

  it('refuses to overwrite a damaged sync file', async () => {
    on('phone'); log('oats'); await connect(GOOD);
    gists.get('gist1')!.files['fuel-log-sync.json'].content = 'oops not json';
    await syncNow();
    expect(useSync.getState().status).toBe('error');
    expect(gists.get('gist1')!.files['fuel-log-sync.json'].content).toBe('oops not json');
    expect(names()).toEqual(['oats']); // local data untouched
  });

  it('reports a deleted gist and can be disconnected', async () => {
    on('phone'); await connect(GOOD);
    gists.clear();
    await syncNow();
    expect(useSync.getState().error).toMatch(/deleted/);
    disconnect();
    expect(useSync.getState().conn).toBeNull();
  });
});

describe('merge', () => {
  const entry = (id: string, at: number, extra: Partial<Entry> = {}): Entry => ({ id, name: id, serving: '', base: { kcal: 1, protein: 1, carbs: 0, fat: 0 }, qty: 1, source: 'db', at, ...extra });
  const doc = (entries: Entry[], extra: Partial<AppData> = {}) => toDoc({ ...structuredClone(DEFAULT_DATA), days: { '2026-10-07': { entries, water: 0, checks: {} } }, ...extra });

  it('is order-independent and idempotent', () => {
    const a = doc([entry('a', 1), entry('b', 2)], { tomb: { z: 5 } });
    const b = doc([entry('b', 2, { upd: 9, qty: 3 }), entry('c', 3)], { mod: 4 });
    const ab = mergeDocs(a, b, 10);
    expect(ab).toEqual(mergeDocs(b, a, 10));
    expect(mergeDocs(ab, ab, 10)).toEqual(ab);
    expect(ab.days['2026-10-07'].entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(ab.days['2026-10-07'].entries.find((e) => e.id === 'b')!.qty).toBe(3);
  });

  it('forgets old tombstones', () => {
    const a = doc([], { tomb: { old: 1, fresh: 200 * 86_400_000 } });
    expect(Object.keys(mergeDocs(a, a, 250 * 86_400_000).tomb)).toEqual(['fresh']);
  });

  it('applyDoc keeps local-only fields', () => {
    const local = { ...structuredClone(DEFAULT_DATA), recents: [{ id: 'r', name: 'r', serving: '', kcal: 1, protein: 1, carbs: 1, fat: 1 }] };
    expect(applyDoc(local, doc([entry('a', 1)])).recents).toHaveLength(1);
  });

  it('parseDoc rejects junk', () => {
    expect(() => parseDoc('{}')).toThrow();
    expect(() => parseDoc('{"v":1,"days":5}')).toThrow();
    expect(parseDoc(JSON.stringify(doc([entry('a', 1)]))).days['2026-10-07'].entries).toHaveLength(1);
  });
});
