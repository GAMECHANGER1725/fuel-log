import { describe, expect, it } from 'vitest';
import { allowedChange, guardTargets, MAX_STEP, parseIdeas, parseReview, snapshot, type Snapshot } from '../src/lib/coach';
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
  it('parses a review through the guardrails', () => {
    const s: Snapshot = snap(3000, 0.1);
    const r = parseReview('```json\n{"status":"too-slow","headline":"Up it","summary":"x","targets":{"kcal":9999,"protein":120,"carbs":1,"fat":90},"focus":["a","b","c","d"]}\n```', T, s, 'm');
    expect(r.to.kcal).toBe(3250);
    expect(r.focus).toHaveLength(3);
    expect(r.applied).toBe(false);
  });
});

describe('coach meal ideas', () => {
  const idea = (o: Record<string, unknown>) => ({ name: 'x', minutes: 5, kind: 'shake', serving: '1', kcal: 500, protein: 20, carbs: 60, fat: 20, ingredients: ['milk'], steps: ['blend'], why: '', ...o });
  it('puts quick and liquid ideas first, drops whey when off, fixes bad kcal', () => {
    const raw = JSON.stringify({
      ideas: [
        idea({ name: 'Toastie', minutes: 10, kind: 'food' }),
        idea({ name: 'Lassi', minutes: 10, kind: 'drink' }),
        idea({ name: 'Whey shake', minutes: 5, ingredients: ['30 g whey'] }),
        idea({ name: 'PB shake', minutes: 4, kcal: 5000 }),
      ],
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
    expect(parts[0]).toEqual({ text: 'Extra details: cooked in ghee' });
  });
  it('keeps a single photo simple', () => {
    const parts = buildBody('photo', { images: [{ base64: 'a', mimeType: 'image/jpeg' }] }).contents[0].parts as Record<string, unknown>[];
    expect(parts).toHaveLength(2);
  });
});
