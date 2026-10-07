import { describe, expect, it } from 'vitest';
import { dayTotals, energy, forGrams } from '../src/lib/nutrition';
import { FOODS, gapSuggestions, searchFoods } from '../src/lib/foods';
import { addDays, weekStart } from '../src/lib/dates';
import { suggestTargets, trendLine, weeklyNudge, weeklyRate, projectedDate } from '../src/lib/targets';
import { computeGame, levelFromXp, questsFor, rankFor, streaks, type DayStats } from '../src/lib/game';
import { DEFAULT_DATA, exportText, normalize, parseBackup } from '../src/lib/backup';
import { parseProduct } from '../src/lib/off';
import { errorFromResponse, extractText, parseReply } from '../src/lib/gemini';
import type { AppData, DayLog, Entry } from '../src/lib/types';

const entry = (kcal: number, protein: number, extra: Partial<Entry> = {}): Entry => ({
  id: Math.random().toString(36),
  name: 'x',
  serving: '',
  base: { kcal, protein, carbs: 0, fat: 0 },
  qty: 1,
  source: 'db',
  at: new Date('2026-10-07T12:00:00').getTime(),
  ...extra,
});
const day = (entries: Entry[], water = 0): DayLog => ({ entries, water, checks: {} });
const data = (patch: Partial<AppData> = {}): AppData => ({ ...structuredClone(DEFAULT_DATA), ...patch });

describe('nutrition', () => {
  it('totals multiply by qty', () => {
    expect(dayTotals(day([entry(100, 10, { qty: 2.5 }), entry(50, 1)])).kcal).toBe(300);
  });
  it('converts to kJ for display', () => {
    expect(energy(100, 'kJ')).toBe('418');
    expect(energy(3000, 'kcal')).toBe('3,000');
  });
  it('scales per-100 g', () => {
    expect(forGrams({ kcal: 200, protein: 10, carbs: 20, fat: 5 }, 150)).toEqual({ kcal: 300, protein: 15, carbs: 30, fat: 7.5 });
  });
});

describe('foods', () => {
  it('has unique ids', () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
  });
  it('energy roughly matches macros (catches typos)', () => {
    for (const f of FOODS) {
      const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9;
      expect(Math.abs(fromMacros - f.kcal) / f.kcal, f.name).toBeLessThan(0.25);
    }
  });
  it('searches by every word', () => {
    expect(searchFoods(FOODS, 'paneer').length).toBeGreaterThan(3);
    expect(searchFoods(FOODS, 'toor dal')[0].name).toBe('Toor dal');
  });
  it('close the gap: skips whey by default, ranks protein-dense fillers', () => {
    const picks = gapSuggestions({ kcal: 1100, protein: 45 }, FOODS, { wheyOk: false, atSchool: false });
    expect(picks).toHaveLength(3);
    expect(picks.some((f) => f.tags?.includes('w'))).toBe(false);
    expect(picks.every((f) => f.kcal >= 300)).toBe(true);
    expect(gapSuggestions({ kcal: 50, protein: 2 }, FOODS, { wheyOk: false, atSchool: false })).toEqual([]);
  });
  it('is vegetarian (eggs and dairy OK)', () => {
    const meat = /chicken|beef|lamb|pork|ham\b|bacon|steak|mince|salmon|tuna|fish|prawn|meat pie|sausage roll'|bolognese|pepperoni|kebab/i;
    expect(FOODS.filter((f) => meat.test(f.name) && !/veg|vegetarian|lentil/i.test(f.name)).map((f) => f.name)).toEqual([]);
  });
  it('close the gap: at school prefers packable food', () => {
    const picks = gapSuggestions({ kcal: 600, protein: 30 }, FOODS, { wheyOk: false, atSchool: true });
    expect(picks.every((f) => f.tags?.includes('p'))).toBe(true);
  });
});

describe('targets', () => {
  it('suggests a sensible bulk for a 182 cm / 58.3 kg 15-year-old, matching the built-in defaults', () => {
    const t = suggestTargets(DEFAULT_DATA.profile);
    expect(DEFAULT_DATA.settings.targets).toEqual(t);
    expect(t.kcal).toBeGreaterThanOrEqual(2900);
    expect(t.kcal).toBeLessThanOrEqual(3200);
    expect(t.protein).toBe(115);
    expect(t.protein * 4 + t.carbs * 4 + t.fat * 9).toBeCloseTo(t.kcal, -1);
  });
  it('weekly rate: regression over 3+ points, fallback to two points', () => {
    const w = [0, 7, 14, 21].map((i) => ({ date: addDays('2026-09-09', i), kg: 57.6 + 0.2 * (i / 7) }));
    expect(weeklyRate(w, '2026-10-07')).toBeCloseTo(0.2, 5);
    expect(weeklyRate(w.slice(0, 2), '2026-10-07')).toBeCloseTo(0.2, 5);
    expect(weeklyRate(w.slice(0, 1), '2026-10-07')).toBeNull();
  });
  it('trend averages the last 7 days', () => {
    const t = trendLine([{ date: '2026-10-01', kg: 58 }, { date: '2026-10-03', kg: 59 }, { date: '2026-10-09', kg: 60 }]);
    expect(t[1].trend).toBe(58.5);
    expect(t[2].trend).toBe(59.5); // 3 Oct is within 7 days of 9 Oct
  });
  it('nudges up when gaining slowly and eating to target, asks to eat more otherwise', () => {
    const today = '2026-10-07';
    const weighIns = [0, 7, 14, 21].map((i) => ({ date: addDays('2026-09-16', i), kg: 58 + 0.05 * (i / 7) }));
    const T = DEFAULT_DATA.settings.targets.kcal;
    const ate = (kcal: number) => Object.fromEntries(Array.from({ length: 7 }, (_, i) => [addDays(today, -i - 1), day([entry(kcal, 100)])]));
    expect(weeklyNudge(data({ weighIns, days: ate(T) }), today)).toMatchObject({ kind: 'raise', to: DEFAULT_DATA.settings.targets.kcal + 200 });
    expect(weeklyNudge(data({ weighIns, days: ate(2000) }), today)).toMatchObject({ kind: 'eat-more' });
    expect(weeklyNudge(data({ weighIns, days: ate(T), nudgeDismissed: weekStart(today) }), today)).toBeNull();
    const fast = weighIns.map((w, i) => ({ ...w, kg: 58 + i }));
    expect(weeklyNudge(data({ weighIns: fast }), today)).toMatchObject({ kind: 'lower', to: DEFAULT_DATA.settings.targets.kcal - 150 });
  });
  it('projects a goal date', () => {
    expect(projectedDate(60, 62, 0.5, '2026-10-07')).toBe('2026-11-04');
    expect(projectedDate(60, 62, -0.1, '2026-10-07')).toBeNull();
  });
});

describe('game', () => {
  it('levels and ranks', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 150 });
    expect(levelFromXp(150).level).toBe(2);
    expect(levelFromXp(399)).toEqual({ level: 2, into: 249, need: 250 });
    expect(rankFor(7).name).toBe('Fueler');
    expect(rankFor(8).name).toBe('Furnace');
  });
  it('quests are 3 distinct and stable per date', () => {
    const q = questsFor('2026-10-07').map((x) => x.id);
    expect(new Set(q).size).toBe(3);
    expect(questsFor('2026-10-07').map((x) => x.id)).toEqual(q);
  });
  it('streak: freeze earned after 7 days covers one missed day', () => {
    const s = (date: string, logged: boolean) => ({ date, logged }) as DayStats;
    const days = Array.from({ length: 7 }, (_, i) => s(addDays('2026-10-01', i), true));
    const r1 = streaks([...days, s('2026-10-08', false), s('2026-10-09', true)], '2026-10-09');
    expect(r1).toMatchObject({ current: 8, freezes: 0, frozen: ['2026-10-08'] });
    const r2 = streaks([...days.slice(0, 3), s('2026-10-04', false), s('2026-10-05', true)], '2026-10-05');
    expect(r2.current).toBe(1);
    const r3 = streaks([...days.slice(0, 3), s('2026-10-04', false)], '2026-10-04');
    expect(r3.current).toBe(3); // today not over yet
  });
  it('computes XP, hits and badges from the log, and XP goes away when food is deleted', () => {
    const today = '2026-10-07';
    const big = day([entry(1500, 60, { source: 'scan' }), entry(1600, 60, { source: 'ai-photo' })], 8);
    const g = computeGame(data({ days: { [today]: big } }), today);
    expect(g.today.hitKcal && g.today.hitProtein && g.today.water).toBe(true);
    expect(g.xp).toBeGreaterThanOrEqual(20 + 10 + 50 + 50 + 25 + 15);
    const earned = g.badges.filter((b) => b.earned).map((b) => b.id);
    expect(earned).toEqual(expect.arrayContaining(['first-meal', 'first-scan', 'first-ai', 'kcal-3000']));
    expect(computeGame(data(), today).xp).toBe(0);
  });
});

describe('backup', () => {
  it('round-trips v3', () => {
    const d = data({ days: { '2026-10-07': day([entry(500, 20)], 3) }, weighIns: [{ date: '2026-10-07', kg: 58.3 }] });
    const back = parseBackup(exportText(d));
    expect(back.days['2026-10-07'].entries[0].base.kcal).toBe(500);
    expect(back.weighIns).toEqual(d.weighIns);
  });
  it('imports the original Fuel Log (v2) artifact backup', () => {
    const v2 = {
      app: 'fuel-log',
      v: 2,
      data: {
        v: 2,
        settings: { kcal: 3000, protein: 100, waterL: 2, gainLow: 0.25, gainHigh: 0.5, unit: 'kJ', theme: 'dark' },
        days: { '2026-10-01': { meals: [{ id: 'a', name: 'Oats', kcal: 300, protein: 10 }], water: 4, checks: { veg: true } } },
        checkins: [{ date: '2026-10-01', weight: 58.3 }],
        quick: [{ id: 'q0', name: 'Milk, 300 ml glass', kcal: 195, protein: 10 }],
      },
    };
    const d = parseBackup(JSON.stringify(v2));
    expect(d.settings.unit).toBe('kJ');
    expect(d.settings.targets.protein).toBe(100);
    expect(d.days['2026-10-01'].entries[0]).toMatchObject({ name: 'Oats', source: 'imported', base: { kcal: 300, protein: 10 } });
    expect(d.days['2026-10-01'].water).toBe(4);
    expect(d.weighIns).toEqual([{ date: '2026-10-01', kg: 58.3 }]);
    expect(d.favourites[0].name).toBe('Milk, 300 ml glass');
  });
  it('rejects junk and cleans bad values', () => {
    expect(() => parseBackup('hello')).toThrow();
    expect(() => parseBackup('{"a":1}')).toThrow();
    const n = normalize({ settings: { waterL: 99, targets: { kcal: -5 } }, days: { bad: {}, '2026-10-07': { water: 'x' } } });
    expect(n.settings.waterL).toBe(6);
    expect(n.settings.targets.kcal).toBe(DEFAULT_DATA.settings.targets.kcal);
    expect(Object.keys(n.days)).toEqual(['2026-10-07']);
  });
});

describe('open food facts', () => {
  it('parses per-serving and per-100 g, converting kJ', () => {
    const f = parseProduct(
      { status: 1, product: { product_name: 'Greek Yoghurt', brands: 'Farm', serving_quantity: 170, serving_size: '170 g', nutriments: { energy_100g: 418.4, proteins_100g: 10, carbohydrates_100g: 4, fat_100g: 5 } } },
      '9300000000001',
    )!;
    expect(f.name).toBe('Farm Greek Yoghurt');
    expect(f.per100!.kcal).toBe(100);
    expect(f.kcal).toBe(170);
    expect(f.protein).toBe(17);
    expect(parseProduct({ status: 0 }, '1')).toBeNull();
  });
});

describe('gemini', () => {
  it('parses and clamps the reply', () => {
    const r = parseReply('```json\n{"items":[{"name":"Rotli","portion":"3","kcal":99999,"protein":"10","carbs":50,"fat":-3}],"confidence":"high","notes":"ok"}\n```', 'm');
    expect(r.items[0]).toEqual({ name: 'Rotli', portion: '3', kcal: 3000, protein: 10, carbs: 50, fat: 0 });
    expect(r.confidence).toBe('high');
  });
  it('skips thought parts', () => {
    expect(extractText({ candidates: [{ content: { parts: [{ text: 'hmm', thought: true }, { text: '{}' }] } }] })).toBe('{}');
  });
  it('maps errors', () => {
    expect(errorFromResponse(429, {}).kind).toBe('rate-limit');
    expect(errorFromResponse(400, { error: { message: 'API key not valid' } }).kind).toBe('bad-key');
    expect(errorFromResponse(503, {}).kind).toBe('busy');
  });
});
