import { describe, expect, it } from 'vitest';
import { dayTotals, energy, energySplit, forGrams, paceGap, sinceLast } from '../src/lib/nutrition';
import { foodDue, hourLabel, waterDue } from '../src/lib/reminders';
import { FOODS, browseFoods, wordForms, gapFocus, gapSuggestions, mealsLeft, momentOf, searchFoods, timeFit } from '../src/lib/foods';
import { RECIPES, recipeFor, recipeMacros } from '../src/lib/recipes';
import { addDays, atOn, hhmmOf, weekStart } from '../src/lib/dates';
import { suggestTargets, trendLine, weeklyNudge, weeklyRate, projectedDate } from '../src/lib/targets';
import { computeGame, levelFromXp, questsFor, rankFor, streaks, type DayStats } from '../src/lib/game';
import { DEFAULT_DATA, exportCsv, exportText, normalize, parseBackup } from '../src/lib/backup';
import { parseProduct } from '../src/lib/off';
import { errorFromResponse, extractText, parseReply } from '../src/lib/ai';
import type { AppData, DayLog, Entry } from '../src/lib/types';
import { checkPasscode, hashCode } from '../src/lib/auth';
import { ORDER, cleanAccent, cleanHidden, cleanOrder, cleanSize, moveIn, toggleIn } from '../src/lib/prefs';
import { daySummary, logSections, mealGroups } from '../src/lib/meals';

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

const TARGETS = { kcal: 3000, protein: 115, carbs: 450, fat: 85 };
const NEED = { kcal: 1100, protein: 45, carbs: 150, fat: 35 };

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
    const picks = gapSuggestions(NEED, TARGETS, FOODS, { wheyOk: false, atSchool: false });
    expect(picks).toHaveLength(3);
    expect(picks.some((f) => f.tags?.includes('w'))).toBe(false);
    expect(picks.every((f) => f.kcal >= 300)).toBe(true);
    expect(gapSuggestions({ kcal: 50, protein: 2, carbs: 5, fat: 2 }, TARGETS, FOODS, { wheyOk: false, atSchool: false })).toEqual([]);
  });
  it('is vegetarian (eggs and dairy OK)', () => {
    const meat = /chicken|beef|lamb|pork|ham\b|bacon|steak|mince|salmon|tuna|fish|prawn|meat pie|sausage roll'|bolognese|pepperoni|kebab/i;
    expect(FOODS.filter((f) => meat.test(f.name) && !/veg|vegetarian|lentil/i.test(f.name)).map((f) => f.name)).toEqual([]);
  });
  it('close the gap: refresh shows different ideas, wraps around, and never repeats within a round', () => {
    const opts = { wheyOk: false, atSchool: false };
    const round = (n: number) => gapSuggestions(NEED, TARGETS, FOODS, opts, 3, n).map((f) => f.name);
    const r0 = round(0);
    expect(round(0)).toEqual(r0); // same round, same answer
    expect(r0).toEqual(gapSuggestions(NEED, TARGETS, FOODS, opts).map((f) => f.name)); // default = round 0
    const seen = new Set<string>();
    for (let n = 0; n < 4; n++) {
      const r = round(n);
      expect(new Set(r).size).toBe(3);
      expect(r.some((x) => seen.has(x)), `round ${n}`).toBe(false);
      r.forEach((x) => seen.add(x));
    }
    expect(seen.size).toBe(12); // 4 rounds cover the top 12 before it cycles
    expect(round(4)).toEqual(r0);
  });
  it('close the gap: follows whichever nutrient is lowest', () => {
    const opts = { wheyOk: false, atSchool: false };
    const lowProtein = { kcal: 500, protein: 80, carbs: 40, fat: 10 }; // 70% of protein target missing
    const lowFat = { kcal: 500, protein: 5, carbs: 40, fat: 70 }; // 80% of fat target missing
    expect(gapFocus(lowProtein, TARGETS)).toBe('protein');
    expect(gapFocus(lowFat, TARGETS)).toBe('fat');
    expect(gapFocus({ kcal: 0, protein: 0, carbs: 0, fat: 0 }, TARGETS)).toBeNull();
    const ratio = (n: typeof lowProtein, key: 'protein' | 'fat') => {
      const picks = gapSuggestions(n, TARGETS, FOODS, opts);
      return picks.reduce((t, f) => t + f[key] / f.kcal, 0) / picks.length;
    };
    expect(ratio(lowProtein, 'protein')).toBeGreaterThan(ratio(lowFat, 'protein')); // low protein -> protein-dense picks
    expect(ratio(lowFat, 'fat')).toBeGreaterThan(ratio(lowProtein, 'fat')); // low fat -> fat-dense picks
  });
  it('close the gap: follows the time of day', () => {
    expect([3, 7, 11, 13, 16, 19, 22].map(momentOf)).toEqual(['late', 'breakfast', 'morning', 'lunch', 'afternoon', 'dinner', 'late']);
    expect(mealsLeft(7)).toBe(5);
    expect(mealsLeft(22)).toBe(1);
    const byName = (n: string) => FOODS.find((f) => f.name === n)!;
    expect(timeFit(byName('Poha'), 'breakfast')).toBeGreaterThan(timeFit(byName('Poha'), 'dinner'));
    expect(timeFit({ ...byName('Poha'), tags: undefined }, 'dinner')).toBe(0.8); // your own foods stay neutral
    const opts = { wheyOk: false, atSchool: false };
    const pool = FOODS.filter((f) => f.tags);
    const pick = (hour: number, need = NEED) => [0, 1].flatMap((r) => gapSuggestions(need, TARGETS, pool, { ...opts, hour }, 3, r));
    const share = (fs: typeof pool, t: string) => fs.filter((f) => f.tags?.includes(t)).length / fs.length;
    // Breakfast foods in the morning, mains at dinner, drinks late at night.
    expect(share(pick(7.5, TARGETS), 'b')).toBeGreaterThanOrEqual(0.5);
    expect(share(pick(19), 'm')).toBeGreaterThanOrEqual(0.5);
    expect(share(pick(22, { kcal: 500, protein: 25, carbs: 60, fat: 15 }), 'd')).toBeGreaterThanOrEqual(0.5);
    // Early in the day nothing is sized to eat the whole day's gap in one go.
    expect(Math.max(...pick(7.5, TARGETS).map((f) => f.kcal))).toBeLessThan(1000);
  });
  it('close the gap: at school prefers packable food', () => {
    const picks = gapSuggestions({ kcal: 600, protein: 30, carbs: 80, fat: 20 }, TARGETS, FOODS, { wheyOk: false, atSchool: true });
    expect(picks.every((f) => f.tags?.includes('p'))).toBe(true);
  });
});

describe('recipes', () => {
  it('every recipe is a food, with real quantities and steps', () => {
    for (const r of RECIPES) {
      const food = FOODS.find((f) => f.name === r.name);
      expect(food, r.name).toBeDefined();
      expect(food).toMatchObject(recipeMacros(r)); // the logged numbers ARE the recipe's numbers
      expect(r.lines.length, r.name).toBeGreaterThanOrEqual(2);
      expect(r.lines.filter(([k]) => k).length, r.name).toBeGreaterThanOrEqual(1);
      for (const [k, g, amount, item] of r.lines) {
        expect(amount.length && item.length, r.name).toBeTruthy();
        if (k) expect(g, `${r.name}: ${item}`).toBeGreaterThan(0);
      }
      expect(r.steps.length, r.name).toBeGreaterThanOrEqual(1);
      expect(r.time, r.name).toBeTruthy();
    }
  });
  it('energy matches macros and the serving is sensible', () => {
    for (const r of RECIPES) {
      const m = recipeMacros(r);
      expect(Math.abs(m.protein * 4 + m.carbs * 4 + m.fat * 9 - m.kcal) / m.kcal, r.name).toBeLessThan(0.1);
      expect(m.kcal, r.name).toBeGreaterThan(100);
      expect(m.kcal, r.name).toBeLessThan(900);
    }
  });
  it('is vegetarian: no meat or fish in any ingredient or step', () => {
    const meat = /chicken|beef|lamb|pork|bacon|\bham\b|steak|mince|salmon|tuna|fish|prawn|sausage|gelatin/i;
    for (const r of RECIPES) expect(meat.test(JSON.stringify([r.lines, r.steps])), r.name).toBe(false);
  });
  it('finds a recipe by name, including a favourite saved under another id', () => {
    expect(recipeFor({ name: 'cheese omelette' })?.lines[0][2]).toBe('3');
    expect(recipeFor({ name: 'Banana' })).toBeUndefined();
  });
});

describe('log time', () => {
  it('turns a picked clock time into a timestamp on that day', () => {
    const at = atOn('2026-10-07', '07:45');
    expect(new Date(at).getDate()).toBe(7);
    expect(hhmmOf(at)).toBe('07:45');
    expect(hhmmOf(atOn('2026-10-07', '23:59'))).toBe('23:59');
    const now = Date.now();
    expect(atOn('2026-10-07', '')).toBeGreaterThanOrEqual(now); // a cleared field means now
    expect(atOn('2026-10-07', '25:00')).toBeGreaterThanOrEqual(now);
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
  it('scores past days against the calorie target they had, not today’s', () => {
    const today = '2026-10-10';
    const d = data({ days: { '2026-10-08': day([entry(2900, 120)]) } });
    d.settings.targets = { ...d.settings.targets, kcal: 3000, protein: 115 };
    const before = computeGame(d, today).byDate.get('2026-10-08')!.xp;
    const raised = { ...d, settings: { ...d.settings, targets: { ...d.settings.targets, kcal: 3250 } }, targetChanges: [{ date: '2026-10-09', from: 3000, to: 3250 }] };
    expect(computeGame(raised, today).byDate.get('2026-10-08')!.xp).toBe(before);
  });
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

describe('ai', () => {
  it('parses and clamps the reply', () => {
    const r = parseReply('```json\n{"items":[{"name":"Rotli","portion":"3","kcal":99999,"protein":"10","carbs":50,"fat":-3}],"confidence":"high","notes":"ok"}\n```', 'm');
    expect(r.items[0]).toEqual({ name: 'Rotli', portion: '3', kcal: 3000, protein: 10, carbs: 50, fat: 0 });
    expect(r.confidence).toBe('high');
  });
  it('finds the JSON even with words around it', () => {
    expect(parseReply('Here you go:\n{"items":[],"confidence":"medium","notes":"n"} Hope that helps', 'm').notes).toBe('n');
    expect(() => parseReply('no json here', 'm')).toThrow();
  });
  it('reads the answer, not the thinking', () => {
    expect(extractText({ choices: [{ message: { reasoning_content: 'hmm', content: ' {} ' } }] })).toBe('{}');
    expect(extractText({})).toBe('');
  });
  it('maps errors', () => {
    expect(errorFromResponse(429, {}).kind).toBe('rate-limit');
    expect(errorFromResponse(400, { error: { message: 'API key not valid' } }).kind).toBe('bad-key');
    expect(errorFromResponse(401, { error: { message: 'Invalid or revoked API key.' } }).kind).toBe('bad-key');
    expect(errorFromResponse(503, {}).kind).toBe('busy');
  });
});

describe('passcode', () => {
  // The real code is deliberately not written here (public repo).
  it('hashes with the salt and rejects wrong codes', async () => {
    expect(await hashCode('1234')).toBe('07b299323add332a50a3e99105ac849ad118666ebf4f30b037185375ddaef0a6'); // matches `shasum -a 256`
    expect(await hashCode('1234')).not.toBe(await hashCode('1235'));
    for (const c of ['0000', '1234', '9999', '']) expect(await checkPasscode(c)).toBe(false);
  });
});

describe('reminders', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 9, h, m).getTime();
  it('water: due 2 h after the last drink, not before, not asleep, not once the goal is hit', () => {
    expect(waterDue(at(12), at(10, 5), 0, 3, 8)).toBe(false); // 1 h 55 m
    expect(waterDue(at(12, 5), at(10, 5), 0, 3, 8)).toBe(true);
    expect(waterDue(at(12, 5), at(10, 5), at(12), 3, 8)).toBe(false); // just reminded: wait another 2 h
    expect(waterDue(at(9), 0, 0, 0, 8)).toBe(false); // nothing yet, but only 1 h since 8 am
    expect(waterDue(at(10), 0, 0, 0, 8)).toBe(true); // nothing all morning
    expect(waterDue(at(7, 30), 0, 0, 0, 8)).toBe(false);
    expect(waterDue(at(22), 0, 0, 0, 8)).toBe(false);
    expect(waterDue(at(14), 0, 0, 8, 8)).toBe(false);
  });
  it('food: once a day from 5 PM to 8 PM', () => {
    expect(foodDue(at(16, 59), '')).toBe(false);
    expect(foodDue(at(17), '')).toBe(true);
    expect(foodDue(at(17), '2026-10-09')).toBe(false);
    expect(foodDue(at(17), '2026-10-08')).toBe(true);
    expect(foodDue(at(20), '')).toBe(false);
  });
});

describe('prefs', () => {
  it('keeps only known Today cards, once each', () => {
    expect(cleanHidden(['water', 'nope', 'water', 3, 'tips'])).toEqual(['water', 'tips']);
    expect(cleanHidden('water')).toEqual([]);
    expect(cleanHidden(undefined)).toEqual([]);
  });
  it('toggles a card in and out', () => {
    expect(toggleIn([], 'gap')).toEqual(['gap']);
    expect(toggleIn(['gap', 'water'], 'gap')).toEqual(['water']);
  });
});

describe('since last meal', () => {
  const at = (ms: number) => ({ at: ms }) as Entry;
  const now = 10 * 3_600_000;
  it('counts from the latest entry before now', () => {
    expect(sinceLast([at(now - 200 * 60_000), at(now - 80 * 60_000)], now)).toBe('1 h 20 min');
    expect(sinceLast([at(now - 120 * 60_000)], now)).toBe('2 h');
    expect(sinceLast([at(now - 25 * 60_000)], now)).toBe('25 min');
    expect(sinceLast([at(now - 10_000)], now)).toBe('just now');
  });
  it('ignores entries timed later than now, and an empty log', () => {
    expect(sinceLast([at(now - 60 * 60_000), at(now + 60 * 60_000)], now)).toBe('1 h');
    expect(sinceLast([at(now + 60_000)], now)).toBeNull();
    expect(sinceLast([], now)).toBeNull();
  });
});

describe('usual meals', () => {
  const t = '2026-10-29';
  const e = (name: string, at: number, qty = 1): Entry => ({ id: name + at, name, serving: '', base: { kcal: 100, protein: 5, carbs: 0, fat: 0 }, qty, source: 'db', at });
  const day = (entries: Entry[]): DayLog => ({ entries, water: 0, checks: {} });
  const h = (k: string, hh: number, mm = 0) => atOn(k, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  const y = addDays(t, -1);
  const days = {
    [t]: day([e('Toast', h(t, 7)), e('Milk', h(t, 7, 5)), e('Apple', h(t, 13))]),
    [y]: day([e('milk', h(y, 7, 30)), e('Toast', h(y, 7, 40)), e('Dal', h(y, 19)), e('Rice', h(y, 19, 2), 2)]),
  };
  it('groups foods logged close together and counts repeats regardless of order or case', () => {
    const g = mealGroups(days, t);
    expect(g.map((x) => x.count)).toEqual([2, 1]);
    expect(g[0].items.map((x) => x.name)).toEqual(['Toast', 'Milk']); // the latest time it was eaten
    expect(g[1].kcal).toBe(300);
  });
  it('skips single foods and days outside the lookback', () => {
    expect(mealGroups({ [t]: day([e('Apple', h(t, 13))]) }, t)).toEqual([]);
    expect(mealGroups(days, addDays(t, 20))).toEqual([]);
  });
});

describe('log sections', () => {
  const k = '2026-10-29';
  const e = (name: string, hhmm: string): Entry => ({ id: name, name, serving: '', base: { kcal: 200, protein: 10, carbs: 0, fat: 0 }, qty: 1, source: 'db', at: atOn(k, hhmm) });
  it('splits the day by part of day with subtotals, in time order', () => {
    const s = logSections([e('Dal', '19:30'), e('Toast', '07:10'), e('Milk', '07:15'), e('Roti', '13:00')]);
    expect(s.map((x) => x.moment)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(s[0].entries.map((x) => x.name)).toEqual(['Toast', 'Milk']);
    expect([s[0].kcal, s[0].protein]).toEqual([400, 20]);
  });
});

describe('accent', () => {
  it('falls back to ember for anything unknown', () => {
    expect(cleanAccent('grape')).toBe('grape');
    expect(cleanAccent('neon')).toBe('ember');
    expect(cleanAccent(undefined)).toBe('ember');
  });
});

describe('pace', () => {
  it('compares what you ate with an even spread from 7 am to 9 pm', () => {
    expect(paceGap(1400, 2800, 14)).toBe(0); // halfway through the window
    expect(paceGap(1000, 2800, 14)).toBe(-400);
    expect(paceGap(2000, 2800, 14)).toBe(600);
  });
  it('says nothing early in the morning or late at night', () => {
    expect(paceGap(0, 2800, 8)).toBeNull();
    expect(paceGap(0, 2800, 21.5)).toBeNull();
  });
});

describe('day summary', () => {
  it('lists totals then each part of the day', () => {
    const k = '2026-10-29';
    const e = (name: string, hhmm: string, qty = 1): Entry => ({ id: name, name, serving: '', base: { kcal: 300, protein: 10, carbs: 0, fat: 0 }, qty, source: 'db', at: atOn(k, hhmm) });
    const text = daySummary('Thursday', [e('Toast', '07:00', 2), e('Dal', '19:00')], { kcal: 3000, protein: 115 }, 'kcal', hhmmOf);
    expect(text).toBe(['Thursday: 900 kcal of 3,000 kcal, 30 g of 115 g protein', '', 'Breakfast (600 kcal, 20 g)', '• 07:00 2× Toast', '', 'Dinner (300 kcal, 10 g)', '• 19:00 Dal'].join('\n'));
  });
});

describe('text size', () => {
  it('falls back to normal for anything unknown', () => {
    expect(cleanSize('xl')).toBe('xl');
    expect(cleanSize('huge')).toBe('normal');
  });
});

describe('browse foods', () => {
  it('finds high-protein foods, most protein first', () => {
    const list = browseFoods(FOODS, 'protein');
    expect(list.length).toBeGreaterThan(5);
    expect(list.every((f) => f.protein >= 15 || (f.protein * 4) / f.kcal >= 0.25)).toBe(true);
    expect(list[0].protein).toBeGreaterThanOrEqual(list[list.length - 1].protein);
  });
  it('lists foods by tag and big-calorie foods, without duplicates', () => {
    expect(browseFoods(FOODS, 'b').every((f) => f.tags?.includes('b'))).toBe(true);
    expect(browseFoods(FOODS, 'dense').every((f) => f.kcal >= 400)).toBe(true);
    const twice = browseFoods([...FOODS, ...FOODS], 'd');
    expect(new Set(twice.map((f) => f.name)).size).toBe(twice.length);
  });
});

describe('reminder times', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m).getTime();
  it('uses a chosen water gap', () => {
    expect(waterDue(at(11), at(10), 0, 2, 8, 3_600_000)).toBe(true);
    expect(waterDue(at(11), at(10), 0, 2, 8)).toBe(false); // default 2 h
  });
  it('uses a chosen food time, for 3 hours', () => {
    expect(foodDue(at(15, 30), '', 15)).toBe(true);
    expect(foodDue(at(18, 10), '', 15)).toBe(false);
    expect(foodDue(at(15, 30), '')).toBe(false); // default 5 PM
  });
  it('labels hours', () => {
    expect(hourLabel(17)).toBe('5 PM');
    expect(hourLabel(12)).toBe('12 PM');
  });
});

describe('search aliases', () => {
  const names = (q: string) => searchFoods(FOODS, q).map((f) => f.name);
  it('finds foods by other names and plurals', () => {
    expect(names('roti')).toContain('Rotli, plain');
    expect(names('chapati')).toContain('Rotli with ghee');
    expect(names('dahi')).toContain('Yoghurt, natural');
    expect(names('chana')).toContain('Chole (chana masala)');
    expect(names('aloo')).toContain('Bateta nu shaak (potato)');
    expect(names('eggs')).toContain('Egg, boiled');
    expect(names('sabzi')).toContain('Mixed veg shaak');
  });
  it('keeps plain searches as they were', () => {
    expect(names('paneer')[0]).toMatch(/^Paneer/);
    expect(names('glass')).not.toHaveLength(0); // 'ss' isn't treated as a plural
    expect(wordForms('dal')).toEqual(['dal']);
  });
});

describe('energy split', () => {
  it('gives whole percents of energy that add up to 100', () => {
    expect(energySplit({ kcal: 0, protein: 25, carbs: 50, fat: 11.1 })).toEqual({ protein: 25, carbs: 50, fat: 25 });
    const s = energySplit({ kcal: 0, protein: 33, carbs: 33, fat: 33 })!;
    expect(s.protein + s.carbs + s.fat).toBe(100);
    expect(energySplit({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toBeNull();
  });
});

describe('card order', () => {
  it('keeps a saved order and slots in cards it does not know yet', () => {
    expect(cleanOrder(['log', 'water', 'quick'])).toEqual(['log', 'note', 'water', 'quality', 'tips', 'quick', 'week', 'quests', 'gap']);
    expect(cleanOrder(undefined)).toEqual([...ORDER]);
    expect(cleanOrder(['nope', 'log', 'log'])).toHaveLength(ORDER.length);
  });
  it('moves a card one place and stops at the ends', () => {
    const o = [...ORDER];
    expect(moveIn(o, 'log', -1).indexOf('log')).toBe(o.indexOf('log') - 1);
    expect(moveIn(o, 'quick', -1)).toEqual(o);
    expect(moveIn(o, 'tips', 1)).toEqual(o);
  });
});

describe('csv export', () => {
  it('writes a row per food and a day row with totals, water and note', () => {
    const k = '2026-10-29';
    const e = (name: string, hhmm: string, qty = 1): Entry => ({ id: name, name, serving: '1 cup', base: { kcal: 200, protein: 10, carbs: 30, fat: 5 }, qty, source: 'db', at: atOn(k, hhmm) });
    const data = { ...structuredClone(DEFAULT_DATA), days: { [k]: { entries: [e('Dal, "home"', '19:00'), e('=Toast', '07:30', 2)], water: 6, checks: {}, note: 'gym, legs' } } };
    const lines = exportCsv(data).trim().split('\r\n');
    expect(lines[0]).toBe('type,date,time,food,serving,servings,kcal,protein_g,carbs_g,fat_g,water_l,note');
    expect(lines[1]).toBe("food,2026-10-29,07:30,'=Toast,1 cup,2,400,20,60,10,,");
    expect(lines[2]).toBe('food,2026-10-29,19:00,"Dal, ""home""",1 cup,1,200,10,30,5,,');
    expect(lines[3]).toBe('day,2026-10-29,,,,,600,30,90,15,1.5,"gym, legs"');
  });
});
