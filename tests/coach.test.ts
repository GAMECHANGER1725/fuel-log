import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

import { allowedChange, applyCheckIn, briefDue, checkIn, dayReport, digestDue, guardTargets, parseBrief, parseDigest, ideasRequest, kcalBounds, MAX_STEP, parseIdeas, parseRecipeEdit, parseReview, snapshot, undoCheckIn, useCoach, type Snapshot } from '../src/lib/coach';
import { RECIPES, recipeFor, recipeMacros, withEdit } from '../src/lib/recipes';
import { FOODS } from '../src/lib/foods';
import { applyDoc, toDoc } from '../src/lib/syncdoc';
import { normalize } from '../src/lib/backup';
import { useStore } from '../src/lib/store';
import { buildBody, MAX_PHOTOS } from '../src/lib/ai';
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
  it('includes water: today, the week average and days at goal', () => {
    const d = data(3000, 0.1);
    d.settings.waterL = 2;
    d.days[addDays(today, -1)].water = 8; // 2 L
    d.days[addDays(today, -2)].water = 4; // 1 L
    d.days[today] = { entries: [], water: 3, checks: {} };
    const s = snapshot(d);
    expect(s.days[0].waterL).toBe(2);
    expect(s.water).toEqual({ targetL: 2, todayL: 0.75, avg7L: 0.4, daysAtGoal7: 1 });
  });
});

describe('meal ideas request', () => {
  it('puts the note last as the priority, and lists ideas already seen', () => {
    const msg = ideasRequest({ now: '16:00' }, '  no blender ', ['PB shake', 'Lassi']);
    expect(msg.trim().endsWith('MY NOTE (follow this first, it overrides the usual rules): no blender')).toBe(true);
    expect(msg).toContain('already seen today (suggest different ones): PB shake; Lassi.');
    expect(ideasRequest({}, '')).not.toContain('MY NOTE');
  });
});

describe('recipe edits', () => {
  const orig = RECIPES[0];
  const raw = JSON.stringify({ serving: '1 glass (~550 ml)', time: '5 min', ingredients: [{ amount: '350 ml', item: 'full cream milk' }, { amount: '', item: '' }], steps: ['Blend.'], kcal: 9000, protein: 20, carbs: 80, fat: 20, changes: 'More milk.' });
  it('keeps the name, drops empty lines and trusts macros over a wrong kcal', () => {
    const { recipe, changes } = parseRecipeEdit(`Sure!\n${raw}`, orig);
    expect(recipe.name).toBe(orig.name);
    expect(recipe.lines).toEqual([[null, 0, '350 ml', 'full cream milk']]);
    expect(recipeMacros(recipe)).toEqual({ kcal: 20 * 4 + 80 * 4 + 20 * 9, protein: 20, carbs: 80, fat: 20 });
    expect(changes).toBe('More milk.');
  });
  it('replaces the built-in recipe and food numbers, and survives backup and sync', () => {
    const { recipe } = parseRecipeEdit(raw, orig);
    const edits = { [orig.name.toLowerCase()]: recipe };
    const food = FOODS.find((f) => f.name === orig.name)!;
    expect(withEdit(food, edits)).toMatchObject({ id: food.id, serving: '1 glass (~550 ml)', kcal: 580 });
    expect(recipeFor(food, edits)).toBe(recipe);
    expect(recipeFor(food)).toBe(orig);
    const d = normalize({ ...structuredClone(DEFAULT_DATA), recipeEdits: edits });
    expect(d.recipeEdits).toEqual(edits);
    expect(applyDoc(structuredClone(DEFAULT_DATA), toDoc(d)).recipeEdits).toEqual(edits);
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
    const parts = body.messages[1].content as Record<string, unknown>[];
    expect(parts.filter((p) => p.type === 'image_url')).toHaveLength(MAX_PHOTOS);
    expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,img0' } });
    expect(parts.some((p) => p.text === 'Photo 2:')).toBe(true);
    // Photos come first, then the notes, then the question.
    expect(parts[0]).toEqual({ type: 'text', text: 'Photo 1:' });
    expect(String(parts[parts.length - 2].text)).toContain('cooked in ghee');
  });
  it('keeps a single photo simple', () => {
    const parts = buildBody('photo', { images: [{ base64: 'a', mimeType: 'image/jpeg' }] }).messages[1].content as Record<string, unknown>[];
    expect(parts).toHaveLength(2);
  });
});

describe('check-in, apply and undo', () => {
  let reply: Record<string, unknown>;
  beforeEach(() => {
    reply = { targets: { kcal: 9999, protein: 120, carbs: 1, fat: 90 }, headline: 'h', summary: 's', focus: ['a', 'b', 'c'] };
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }) })) as unknown as typeof fetch;
    const d = data(3000, 0.1);
    d.settings.aiKey = 'k';
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

describe('morning brief and nightly digest', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m);
  it('makes the brief once a day from 5 am until the digest time', () => {
    expect(briefDue(at(4, 59), null)).toBe(false);
    expect(briefDue(at(5), null)).toBe(true);
    expect(briefDue(at(13), '2026-10-28')).toBe(true);
    expect(briefDue(at(13), '2026-10-29')).toBe(false);
    expect(briefDue(at(21, 30), null)).toBe(false);
  });
  it('makes the digest once a day from 9:30 pm until midnight', () => {
    expect(digestDue(at(21, 29), null)).toBe(false);
    expect(digestDue(at(21, 30), null)).toBe(true);
    expect(digestDue(at(23, 59), '2026-10-28')).toBe(true);
    expect(digestDue(at(22), '2026-10-29')).toBe(false);
    expect(digestDue(at(6), null)).toBe(false);
  });
  it('works out the day in code', () => {
    const d = data(3000, null, 1);
    d.days[addDays(today, -1)].water = 6;
    d.settings.waterL = 2;
    const r = dayReport(d, addDays(today, -1));
    expect(r).toMatchObject({ kcal: 3000, protein: 100, meals: 2, kcalPct: 1, hitKcal: true, hitProtein: false, waterL: 1.5, waterGoalL: 2, last: '19:00' });
    expect(r.target).toEqual(T);
    expect(dayReport(d, today)).toMatchObject({ kcal: 0, items: 0, last: '' });
  });
  it('reads the brief and needs at least one focus point', () => {
    const r = dayReport(data(3000, null, 1), addDays(today, -1));
    const b = parseBrief('Sure: {"headline":"Big breakfast day","yesterday":"3,000 kcal, nice.","focus":["a","b","c","d"]}', r, today, 'm', 5);
    expect(b).toMatchObject({ date: today, headline: 'Big breakfast day', focus: ['a', 'b', 'c'], at: 5, model: 'm' });
    expect(() => parseBrief('{"headline":"x","focus":[]}', r, today, 'm')).toThrow();
    expect(() => parseBrief('no json', r, today, 'm')).toThrow();
  });
  it('only keeps a before-bed snack when he is really short', () => {
    const reply = '{"headline":"Close one","wins":["Breakfast"],"fix":["Lunch"],"beforeBed":"Warm milk, 250 ml","tomorrow":"Shake at recess"}';
    const full = dayReport(data(3000, null, 1), addDays(today, -1)); // 3000 kcal, 100 g protein of 115
    expect(parseDigest(reply, full, 'm').beforeBed).toBe('');
    const short = dayReport(data(2000, null, 1), addDays(today, -1));
    const g = parseDigest(reply, short, 'm');
    expect(g).toMatchObject({ headline: 'Close one', wins: ['Breakfast'], fix: ['Lunch'], beforeBed: 'Warm milk, 250 ml', tomorrow: 'Shake at recess' });
    expect(() => parseDigest('{"wins":[]}', short, 'm')).toThrow();
  });
});
