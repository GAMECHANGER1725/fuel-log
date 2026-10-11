import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

import { allowedChange, applyCheckIn, checkIn, guardTargets, kcalBounds, MAX_STEP, parseIdeas, parseReview, snapshot, undoCheckIn, useCoach, type Snapshot } from '../src/lib/coach';
import { useStore } from '../src/lib/store';
import { buildBody, MAX_PHOTOS } from '../src/lib/gemini';
import { DEFAULT_DATA } from '../src/lib/backup';
import { addDays, todayKey } from '../src/lib/dates';
import type { AppData, Entry } from '../src/lib/types';

const T = { kcal: 3000, protein: 115, carbs: 440, fat: 85 };
const today = todayKey();
const entry = (date: string, kcal: number, protein: number, hour = 12): Entry => ({
  id: Math.random().toString(36),
  name: 'Milk',
  serving: '',
  base: { kcal, protein, carbs: 0, fat: 0 },
  qty: 1,
  source: 'db',
  at: new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime(),
});

/** n logged days in a row before today, each eating `kcal`, plus weigh-ins giving `rate` kg/week over 3 weeks. */
function data(kcal: number, rate: number | null, days = 7, patch: Partial<AppData> = {}): AppData {
  const d: AppData = { ...structuredClone(DEFAULT_DATA), ...patch };
  d.settings.targets = T;
  for (let i = 1; i <= days; i++) {
    const k = addDays(today, -i);
    d.days[k] = { entries: [entry(k, kcal * 0.4, 40, 8), entry(k, kcal * 0.6, 60, 19)], water: 0, checks: {} };
  }
  if (rate !== null) d.weighIns = [0, 7, 14, 21].map((ago) => ({ date: addDays(today, -ago), kg: 58 - (rate * ago) / 7 }));
  return d;
}

describe('coach snapshot', () => {
  it('summarises days, timing and the weight rate', () => {
    const s = snapshot(data(3000, 0.1));
    expect(s.loggedDays7).toBe(7);
    expect(s.avg7?.kcal).toBe(3000);
    expect(s.days[0].meals).toBe(2);
    expect(s.days[0].beforeThree).toBe(0.4);
    expect(s.rate).toBeCloseTo(0.1, 2);
    expect(s.usualFoods).toEqual(['Milk']);
  });
});

describe('coach guardrails', () => {
  const snap = (kcal: number, rate: number | null, days = 7, patch?: Partial<AppData>) => snapshot(data(kcal, rate, days, patch));

  it('only raises calories when gaining too slowly while eating the target', () => {
    expect(allowedChange(snap(3000, 0.1))).toMatchObject({ up: true, down: false });
    expect(allowedChange(snap(2400, 0.1))).toMatchObject({ up: false, down: false }); // eat the target first
    expect(allowedChange(snap(3000, 0.4))).toMatchObject({ up: false, down: false }); // in range
    expect(allowedChange(snap(3000, 0.8))).toMatchObject({ up: false, down: true });
    expect(allowedChange(snap(3000, null))).toMatchObject({ up: false, down: false }); // no weigh-ins
    expect(allowedChange(snap(3000, 0.1, 3))).toMatchObject({ up: false, down: false }); // too few logs
  });
  it('waits a week after a target change', () => {
    const recent = snap(3000, 0.1, 7, { targetChanges: [{ date: addDays(today, -3), from: 2800, to: 3000 }] });
    expect(allowedChange(recent).up).toBe(false);
  });
  it('caps the step, keeps protein and fat in range, and makes macros add up', () => {
    const g = guardTargets(T, { kcal: 4200, protein: 300, fat: 10 }, 58, { up: true, down: false });
    expect(g.kcal).toBe(T.kcal + MAX_STEP);
    expect(g.protein).toBe(130); // 2.2 g/kg
    expect(g.fat).toBe(Math.round((g.kcal * 0.2) / 9));
    expect(Math.abs(g.protein * 4 + g.carbs * 4 + g.fat * 9 - g.kcal)).toBeLessThan(4);
  });
  it('ignores a calorie change that isn’t allowed', () => {
    expect(guardTargets(T, { kcal: 2000 }, 58, { up: true, down: false }).kcal).toBe(T.kcal);
    expect(guardTargets(T, { kcal: 3600 }, 58, { up: false, down: false }).kcal).toBe(T.kcal);
  });
  it('keeps the absolute 1,800–4,500 range without breaking the step or the direction', () => {
    expect(kcalBounds(1500, { up: true, down: false })).toEqual([1500, 1500]);
    expect(kcalBounds(1600, { up: false, down: true })).toEqual([1600, 1600]);
    expect(kcalBounds(5000, { up: true, down: false })).toEqual([5000, 5000]);
    expect(kcalBounds(4400, { up: true, down: false })).toEqual([4400, 4500]);
  });
  it('never moves targets on a reply without real numbers', () => {
    const s = snap(3000, 0.8); // a cut would be allowed
    expect(() => parseReview('{"headline":"x","summary":"x","focus":[]}', T, s, 'm')).toThrow();
    expect(() => parseReview('{"targets":{"kcal":"","protein":120,"fat":80}}', T, s, 'm')).toThrow();
    expect(() => parseReview('null', T, s, 'm')).toThrow();
  });
  it('takes the status from the data, not the model', () => {
    const r = parseReview('{"status":"on-track","targets":{"kcal":3000,"protein":115,"carbs":440,"fat":85},"headline":"h","summary":"s","focus":[]}', T, snap(2400, 0.1), 'm');
    expect(r.status).toBe('eat-more');
  });
  it('parses a review through the guardrails', () => {
    const s: Snapshot = snap(3000, 0.1);
    const r = parseReview('```json\n{"status":"too-slow","headline":"Up it","summary":"x","targets":{"kcal":9999,"protein":120,"carbs":1,"fat":90},"focus":["a","b","c","d"]}\n```', T, s, 'm');
    expect(r.to.kcal).toBe(3250);
    expect(r.focus).toHaveLength(3);
    expect(r.applied).toBe(false);
  });
});

describe('coach meal ideas', () => {
  const idea = (o: Record<string, unknown>) => ({ name: 'x', kind: 'shake', serving: '1', kcal: 500, protein: 20, carbs: 60, fat: 20, ingredients: ['milk'], steps: ['blend'], why: '', ...o });
  it('puts quick and liquid ideas first, drops whey when off, fixes bad kcal', () => {
    const raw = JSON.stringify({
      five: [idea({ name: 'Whey shake', ingredients: ['30 g whey'] }), idea({ name: 'PB shake', kcal: 5000 })],
      ten: [idea({ name: 'Toastie', kind: 'food' }), idea({ name: 'Lassi', kind: 'drink' })],
    });
    const list = parseIdeas(raw, false);
    expect(list.map((i) => i.name)).toEqual(['PB shake', 'Lassi', 'Toastie']);
    expect(list[0].minutes).toBe(5);
    expect(list[0].kcal).toBe(20 * 4 + 60 * 4 + 20 * 9);
    expect(list[1].liquid).toBe(true);
    expect(parseIdeas(raw, true).some((i) => i.name === 'Whey shake')).toBe(true);
  });
});

describe('multi-photo meal check', () => {
  it('sends every photo, numbered, up to the limit', () => {
    const images = Array.from({ length: MAX_PHOTOS + 2 }, (_, i) => ({ base64: `img${i}`, mimeType: 'image/jpeg' }));
    const body = buildBody('photo', { images, text: 'cooked in ghee' });
    const parts = body.contents[0].parts as Record<string, unknown>[];
    expect(parts.filter((p) => p.inline_data)).toHaveLength(MAX_PHOTOS);
    expect(parts.some((p) => p.text === 'Photo 2:')).toBe(true);
    // Photos come first, then the notes, then the question.
    expect(parts[0]).toEqual({ text: 'Photo 1:' });
    expect(String(parts[parts.length - 2].text)).toContain('cooked in ghee');
  });
  it('keeps a single photo simple', () => {
    const parts = buildBody('photo', { images: [{ base64: 'a', mimeType: 'image/jpeg' }] }).contents[0].parts as Record<string, unknown>[];
    expect(parts).toHaveLength(2);
  });
});

describe('check-in, apply and undo', () => {
  let reply: Record<string, unknown>;
  beforeEach(() => {
    reply = { targets: { kcal: 9999, protein: 120, carbs: 1, fat: 90 }, headline: 'h', summary: 's', focus: ['a', 'b', 'c'] };
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) })) as unknown as typeof fetch;
    const d = data(3000, 0.1);
    d.settings.geminiKey = 'k';
    useStore.setState({ ...d });
    useCoach.setState({ auto: true, review: null, tried: 0, chat: [], ideas: null });
  });

  it('applies once, a same-day re-check can’t stack, and undo goes all the way back', async () => {
    const r = await checkIn();
    expect(r.applied).toBe(true);
    expect(useStore.getState().settings.targets.kcal).toBe(3250);
    const again = await checkIn();
    expect(useStore.getState().settings.targets.kcal).toBe(3250); // changed today, so frozen
    expect(again.from.kcal).toBe(3000);
    expect(undoCheckIn()).toBe(true);
    expect(useStore.getState().settings.targets.kcal).toBe(3000);
  });
  it('won’t undo or apply over targets that changed since', async () => {
    await checkIn();
    useStore.getState().setTargets({ kcal: 3500, protein: 120, carbs: 500, fat: 90 }); // e.g. synced from the other device
    expect(undoCheckIn()).toBe(false);
    expect(useStore.getState().settings.targets.kcal).toBe(3500);

    useCoach.setState({ auto: false, review: null });
    useStore.setState({ targetChanges: [] });
    const r = await checkIn();
    expect(r.applied).toBe(false);
    useStore.getState().setTargets({ ...useStore.getState().settings.targets, protein: 100 });
    expect(applyCheckIn()).toBe(false);
  });
  it('a bad reply leaves the targets alone', async () => {
    reply = { headline: 'h' };
    await expect(checkIn()).rejects.toThrow();
    expect(useStore.getState().settings.targets).toEqual(T);
  });
});
