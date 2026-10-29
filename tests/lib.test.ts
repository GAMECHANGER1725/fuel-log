import { describe, expect, it } from 'vitest';
import { badgeCount, coverage, dayTargets, dayTotals, energy, energySplit, forGrams, paceGap, sinceLast, targetsCrossed } from '../src/lib/nutrition';
import { foodDue, hourLabel, waterDue, wrapDue, wrapText } from '../src/lib/reminders';
import { FOODS, browseFoods, planRest, proteinPer100kcal, sortFoods, wordForms, gapFocus, gapSuggestions, mealsLeft, momentOf, searchFoods, timeFit } from '../src/lib/foods';
import { RECIPES, recipeFor, recipeMacros } from '../src/lib/recipes';
import { addDays, atOn, daysSinceWeighIn, hhmmOf, weekStart } from '../src/lib/dates';
import { chartWindow, goalProgress, suggestTargets, trendLine, weeklyNudge, weeklyRate, projectedDate } from '../src/lib/targets';
import { computeGame, levelFromXp, nextBadge, questsFor, rankFor, streaks, type DayStats } from '../src/lib/game';
import { DEFAULT_CHECKS, DEFAULT_DATA, cleanChecks, exportCsv, exportText, normalize, parseBackup } from '../src/lib/backup';
import { findByBarcode, parseProduct } from '../src/lib/off';
import { errorFromResponse, extractText, parseReply } from '../src/lib/ai';
import type { AppData, DayLog, Entry } from '../src/lib/types';
import { checkPasscode, hashCode } from '../src/lib/auth';
import { ORDER, cleanTags, pushSearch, cleanAccent, cleanHidden, cleanOrder, cleanSize, cleanSort, moveIn, toggleIn } from '../src/lib/prefs';
import { daySummary, foodHistory, hasTag, searchLog, weekBalance, tagStats, toggleTag, weekdayAverages, insights, lastQty, logSections, mealGroups, records, weekStats, weekSummary, combineAsFood, drinkMl, eatenByTime, lastSection, mealProteinGoal, proteinMeals, topFoods } from '../src/lib/meals';

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
    expect(cleanHidden(['qscan', 'qagain', 'qnope'])).toEqual(['qscan', 'qagain']);
    expect(cleanSort('lean')).toBe('lean');
    expect(cleanSort('bogus')).toBe('match');
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
    expect(names('chai')).not.toContain('Vegetable dumplings, steamed'); // alias 'tea' only at a word start
    expect(names('chai')).toContain('Masala chai with milk');
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
    expect(cleanOrder(['log', 'water', 'quick'])).toEqual(['weigh', 'log', 'note', 'water', 'quality', 'tips', 'quick', 'week', 'quests', 'gap']);
    expect(cleanOrder(undefined)).toEqual([...ORDER]);
    expect(cleanOrder(['nope', 'log', 'log'])).toHaveLength(ORDER.length);
  });
  it('moves a card one place and stops at the ends', () => {
    const o = [...ORDER];
    expect(moveIn(o, 'log', -1).indexOf('log')).toBe(o.indexOf('log') - 1);
    expect(moveIn(o, o[0], -1)).toEqual(o);
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

describe('usual amount and targets crossed', () => {
  const k = '2026-10-29';
  const e = (name: string, serving: string, qty: number, at: number): Entry => ({ id: name + at, name, serving, base: { kcal: 100, protein: 3, carbs: 0, fat: 0 }, qty, source: 'db', at });
  it('remembers the last amount for the same food and serving', () => {
    const days = {
      [addDays(k, -3)]: { entries: [e('Rotli, plain', '1 rotli', 3, atOn(addDays(k, -3), '19:00'))], water: 0, checks: {} },
      [addDays(k, -1)]: { entries: [e('rotli, plain', '1 rotli', 2, atOn(addDays(k, -1), '19:00')), e('Rotli, plain', '120 g', 1, atOn(addDays(k, -1), '20:00'))], water: 0, checks: {} },
    };
    expect(lastQty(days, k, 'Rotli, plain', '1 rotli')).toBe(2);
    expect(lastQty(days, k, 'Dal', '1 bowl')).toBe(1);
    expect(lastQty(days, addDays(k, 40), 'Rotli, plain', '1 rotli')).toBe(1);
  });
  it('averages energy and protein by weekday, Monday first', () => {
    const today = '2026-10-29'; // a Thursday
    const days: Record<string, DayLog> = {
      '2026-10-26': day([entry(2000, 100)]), // Monday
      '2026-10-19': day([entry(3000, 120)]), // Monday
      '2026-10-25': day([entry(2500, 90)]), // Sunday
      [today]: day([entry(9000, 900)]), // today doesn't count
      '2026-08-01': day([entry(9000, 900)]), // too old
    };
    const w = weekdayAverages(days, today);
    expect(w[0]).toEqual({ wd: 0, kcal: 2500, protein: 110, n: 2 });
    expect(w[6]).toEqual({ wd: 6, kcal: 2500, protein: 90, n: 1 });
    expect(w[3]).toEqual({ wd: 3, kcal: 0, protein: 0, n: 0 });
  });
  it('counts the days you had a food, and the last one', () => {
    const k = '2026-10-20';
    const e = (name: string) => entry(100, 5, { name });
    const days: Record<string, DayLog> = {
      [k]: day([e('Dal'), e('dal ')]),
      [addDays(k, -3)]: day([e('Dal')]),
      [addDays(k, -40)]: day([e('Dal')]),
    };
    expect(foodHistory(days, k, 'DAL')).toEqual({ days: 2, last: k });
    expect(foodHistory(days, addDays(k, 2), 'Dal')).toEqual({ days: 2, last: k });
    expect(foodHistory(days, k, 'Paneer')).toEqual({ days: 0, last: null });
  });
  it('spots a target just passed', () => {
    const T = { kcal: 3000, protein: 115, carbs: 0, fat: 0 };
    expect(targetsCrossed({ kcal: 2900, protein: 100, carbs: 0, fat: 0 }, { kcal: 3100, protein: 110, carbs: 0, fat: 0 }, T)).toEqual({ kcal: true, protein: false });
    expect(targetsCrossed({ kcal: 3100, protein: 120, carbs: 0, fat: 0 }, { kcal: 3300, protein: 130, carbs: 0, fat: 0 }, T)).toEqual({ kcal: false, protein: false });
  });
});

describe('note tags', () => {
  it('adds and removes a tag, keeping the rest of the note', () => {
    expect(toggleTag('', 'Gym')).toBe('Gym');
    expect(toggleTag('felt great', 'Gym')).toBe('felt great, Gym');
    expect(toggleTag('felt great, gym ', 'Gym')).toBe('felt great');
    expect(hasTag('Rest day, tired', 'rest day')).toBe(true);
    expect(hasTag('Gymnastics', 'Gym')).toBe(false);
  });
});

describe('recent searches', () => {
  it('keeps the newest few, once each', () => {
    let l: string[] = [];
    for (const q of ['paneer', 'milk', ' Paneer  ', 'a', 'dal', 'roti', 'oats', 'eggs', 'tofu']) l = pushSearch(l, q);
    expect(l).toEqual(['tofu', 'eggs', 'oats', 'roti', 'dal', 'Paneer']);
  });
});

describe('custom tags', () => {
  it('cleans saved tags', () => {
    expect(cleanTags(undefined)).toContain('Gym');
    expect(cleanTags([' Gym ', 'gym', 'a,b', '', 3, 'x'.repeat(40)])).toEqual(['Gym', 'a b', 'x'.repeat(24)]);
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12);
    expect(cleanTags([])).toEqual([]);
  });
});

describe('week balance', () => {
  it('sums the gap on past logged days and spreads a shortfall over the days left', () => {
    const start = '2026-10-26'; // Monday
    const today = '2026-10-29'; // Thursday: 4 days left
    const days: Record<string, DayLog> = {
      '2026-10-26': day([entry(2500, 100)]),
      '2026-10-27': { ...day([entry(2900, 100)]), boost: 300 },
      // Wednesday not logged: left out rather than counted as zero.
      [today]: day([entry(5000, 100)]),
    };
    expect(weekBalance(days, start, today, 3000)).toEqual({ kcal: -900, days: 2, left: 4, perDay: 230 });
    expect(weekBalance({ '2026-10-26': day([entry(3500, 1)]) }, start, today, 3000)).toEqual({ kcal: 500, days: 1, left: 4, perDay: 0 });
    expect(weekBalance({ '2026-10-26': day([entry(0.1, 1)]) }, start, '2026-11-01', 3000)?.perDay).toBe(500);
    expect(weekBalance({}, start, today, 3000)).toBeNull();
    expect(weekBalance(days, start, start, 3000)).toBeNull();
  });
});

describe('search the log', () => {
  it('finds entries by every word, newest first', () => {
    const e = (name: string, at: number) => entry(100, 5, { name, at });
    const days: Record<string, DayLog> = {
      '2026-10-01': day([e('Paneer bhurji', 1), e('Milk', 2)]),
      '2026-10-03': day([e('paneer tikka wrap', 5), e('Bhurji, paneer', 9)]),
    };
    const r = searchLog(days, 'PANEER');
    expect(r.total).toBe(3);
    expect(r.hits.map((h) => h.entry.name)).toEqual(['Bhurji, paneer', 'paneer tikka wrap', 'Paneer bhurji']);
    expect(searchLog(days, 'bhurji paneer').total).toBe(2);
    expect(searchLog(days, 'paneer', 1).hits).toHaveLength(1);
    expect(searchLog(days, ' p ').total).toBe(0);
  });
});

describe('tag stats', () => {
  it('compares tagged days with the rest', () => {
    const today = '2026-10-29';
    const d = (kcal: number, protein: number, note?: string): DayLog => ({ ...day([entry(kcal, protein)]), note });
    const days: Record<string, DayLog> = {
      '2026-10-28': d(3200, 140, 'Gym'),
      '2026-10-27': d(3000, 120, 'felt ok, gym'),
      '2026-10-26': d(2400, 90),
      '2026-10-25': d(2600, 100, 'Eating out'),
      [today]: d(9000, 900, 'Gym'),
    };
    expect(tagStats(days, today, ['Gym', 'Eating out', 'Sick'])).toEqual([{ tag: 'Gym', n: 2, kcal: 3100, protein: 130, otherKcal: 2500, otherProtein: 95 }]);
    expect(tagStats(days, today, ['Eating out'], 56, 1)[0].n).toBe(1);
  });
});

describe('app badge', () => {
  it('counts what is left today, never below zero', () => {
    const T = { kcal: 3000, protein: 115, carbs: 0, fat: 0 };
    const eaten = { kcal: 2000, protein: 80.4, carbs: 0, fat: 0 };
    expect(badgeCount('protein', T, eaten, 'kcal')).toBe(35);
    expect(badgeCount('kcal', T, eaten, 'kcal')).toBe(1000);
    expect(badgeCount('kcal', T, eaten, 'kJ')).toBe(4184);
    expect(badgeCount('protein', T, { ...eaten, protein: 130 }, 'kcal')).toBe(0);
    expect(badgeCount('off', T, eaten, 'kcal')).toBe(0);
  });
});

describe('your foods first and week stats', () => {
  it('ranks your foods first among equal matches', () => {
    const plain = searchFoods(FOODS, 'milk').map((f) => f.name);
    const mine = searchFoods(FOODS, 'milk', 30, new Set(['soy milk'])).map((f) => f.name);
    expect(plain[0]).not.toBe('Soy milk');
    expect(mine.indexOf('Soy milk')).toBeLessThan(plain.indexOf('Soy milk'));
    expect(mine[0]).toMatch(/^Milk/); // names that start with the query still come first
  });
  it('averages logged days and counts days on target', () => {
    const start = '2026-10-26';
    const e = (k: string, kcal: number, protein: number): Entry => ({ id: k, name: 'x', serving: '', base: { kcal, protein, carbs: 0, fat: 0 }, qty: 1, source: 'db', at: atOn(k, '12:00') });
    const days = {
      '2026-10-26': { entries: [e('2026-10-26', 3000, 120)], water: 0, checks: {} },
      '2026-10-27': { entries: [e('2026-10-27', 2000, 80)], water: 0, checks: {} },
      '2026-10-30': { entries: [e('2026-10-30', 3000, 120)], water: 0, checks: {} },
    };
    expect(weekStats(days, start, '2026-10-29', { kcal: 3000, protein: 115 })).toEqual({ logged: 2, hit: 1, kcal: 2500, protein: 100 });
    expect(weekStats({}, start, '2026-10-29', { kcal: 3000, protein: 115 }).kcal).toBeNull();
  });
});

describe('weigh-in reminder', () => {
  it('counts days since the last weigh-in', () => {
    expect(daysSinceWeighIn([], '2026-10-29')).toBeNull();
    expect(daysSinceWeighIn([{ date: '2026-10-15' }, { date: '2026-10-22' }], '2026-10-29')).toBe(7);
  });
});

describe('records', () => {
  it('finds the best day for energy, protein and water', () => {
    const e = (k: string, kcal: number, protein: number): Entry => ({ id: k, name: 'x', serving: '', base: { kcal, protein, carbs: 0, fat: 0 }, qty: 1, source: 'db', at: atOn(k, '12:00') });
    const days = {
      '2026-10-20': { entries: [e('2026-10-20', 3400, 100)], water: 6, checks: {} },
      '2026-10-21': { entries: [e('2026-10-21', 3000, 140)], water: 9, checks: {} },
      '2026-10-22': { entries: [e('2026-10-22', 3400, 90)], water: 2, checks: {} },
    };
    expect(records(days)).toEqual({ kcal: { date: '2026-10-20', value: 3400 }, protein: { date: '2026-10-21', value: 140 }, water: { date: '2026-10-21', value: 9 } });
    expect(records({})).toEqual({ kcal: null, protein: null, water: null });
  });
});

describe('topFoods', () => {
  it('ranks foods by what they gave over the window, grouped by name', () => {
    const e = (k: string, name: string, kcal: number, protein: number, qty = 1): Entry => ({ id: k + name + qty, name, serving: '', base: { kcal, protein, carbs: 0, fat: 0 }, qty, source: 'db', at: atOn(k, '12:00') });
    const days = {
      '2026-10-29': { entries: [e('2026-10-29', 'Milk', 150, 8), e('2026-10-29', 'Paneer', 300, 20)], water: 0, checks: {} },
      '2026-10-28': { entries: [e('2026-10-28', 'milk ', 150, 8, 2), e('2026-10-28', 'Water', 0, 0)], water: 0, checks: {} },
      '2026-10-01': { entries: [e('2026-10-01', 'Whey', 120, 24)], water: 0, checks: {} }, // outside 14 days
    };
    const p = topFoods(days, '2026-10-29', 'protein');
    expect(p.map((f) => [f.name, f.times, f.value])).toEqual([['Milk', 2, 24], ['Paneer', 1, 20]]);
    expect(p[0].share).toBeCloseTo(24 / 44);
    expect(topFoods(days, '2026-10-29', 'kcal')[0]).toMatchObject({ name: 'Milk', value: 450 });
    expect(topFoods({}, '2026-10-29', 'kcal')).toEqual([]);
  });
});

describe('lastSection', () => {
  it('finds the latest earlier day with food at that part of the day', () => {
    const e = (k: string, hhmm: string, kcal: number): Entry => ({ id: k + hhmm, name: 'x', serving: '', base: { kcal, protein: 10, carbs: 0, fat: 0 }, qty: 1, source: 'db', at: atOn(k, hhmm) });
    const days = {
      '2026-10-29': { entries: [e('2026-10-29', '13:00', 500)], water: 0, checks: {} },
      '2026-10-28': { entries: [e('2026-10-28', '19:00', 700)], water: 0, checks: {} },
      '2026-10-27': { entries: [e('2026-10-27', '07:30', 400), e('2026-10-27', '08:00', 200), e('2026-10-27', '19:00', 900)], water: 0, checks: {} },
    };
    expect(lastSection(days, '2026-10-29', 'breakfast')).toMatchObject({ date: '2026-10-27', kcal: 600, protein: 20 });
    expect(lastSection(days, '2026-10-29', 'dinner')).toMatchObject({ date: '2026-10-28', kcal: 700 });
    expect(lastSection(days, '2026-10-29', 'lunch')).toBeNull(); // already had lunch today
    expect(lastSection(days, '2026-10-29', 'late')).toBeNull();
  });
});

describe('protein per meal', () => {
  it('aims for about 0.4 g/kg a sitting, 20 to 40 g', () => {
    expect(mealProteinGoal(62)).toBe(25);
    expect(mealProteinGoal(40)).toBe(20);
    expect(mealProteinGoal(120)).toBe(40);
  });
  it('counts the parts of the day that reached it', () => {
    const e = (hhmm: string, protein: number): Entry => ({ id: hhmm, name: 'x', serving: '', base: { kcal: 100, protein, carbs: 0, fat: 0 }, qty: 1, source: 'db', at: atOn('2026-10-29', hhmm) });
    const secs = logSections([e('07:00', 15), e('07:10', 12), e('13:00', 20), e('19:00', 30)]);
    expect(proteinMeals(secs, 25)).toBe(2);
  });
});

describe('combineAsFood', () => {
  it('sums the foods into one serving and lists them', () => {
    const e = (name: string, kcal: number, protein: number, qty = 1): Entry => ({ id: name, name, serving: '', base: { kcal, protein, carbs: 10, fat: 2.25 }, qty, source: 'db', at: 0 });
    const f = combineAsFood([e('Oats', 300, 10), e('Banana ', 105, 1.3, 2)], ' My breakfast ');
    expect(f).toMatchObject({ name: 'My breakfast', serving: '1 meal: Oats, 2× Banana', kcal: 510, protein: 12.6, carbs: 30, fat: 6.8 });
  });
});

describe('chartWindow', () => {
  const line = ['2026-01-01', '2026-06-01', '2026-10-01', '2026-10-20'].map((date) => ({ date }));
  it('keeps the chosen span, or everything', () => {
    expect(chartWindow(line, '2026-10-29', 56).map((p) => p.date)).toEqual(['2026-10-01', '2026-10-20']);
    expect(chartWindow(line, '2026-10-29', 182)).toHaveLength(3);
    expect(chartWindow(line, '2026-10-29', null)).toHaveLength(4);
  });
  it('falls back to the last two when the span has fewer', () => {
    expect(chartWindow(line.slice(0, 2), '2026-10-29', 56).map((p) => p.date)).toEqual(['2026-01-01', '2026-06-01']);
  });
});

describe('sortFoods', () => {
  const f = (name: string, kcal: number, protein: number) => ({ id: name, name, serving: '', kcal, protein, carbs: 0, fat: 0 });
  const list = [f('Rice', 400, 8), f('Whey', 120, 24), f('Paneer', 300, 20)];
  it('orders by protein, density or energy, and leaves best match alone', () => {
    expect(sortFoods(list, 'match')).toBe(list);
    expect(sortFoods(list, 'protein').map((x) => x.name)).toEqual(['Whey', 'Paneer', 'Rice']);
    expect(sortFoods(list, 'lean').map((x) => x.name)).toEqual(['Whey', 'Paneer', 'Rice']);
    expect(sortFoods(list, 'kcal').map((x) => x.name)).toEqual(['Rice', 'Paneer', 'Whey']);
    expect(list.map((x) => x.name)).toEqual(['Rice', 'Whey', 'Paneer']); // not mutated
  });
  it('measures protein per 100 kcal', () => {
    expect(proteinPer100kcal(f('Whey', 120, 24))).toBe(20);
    expect(proteinPer100kcal(f('Water', 0, 0))).toBe(0);
  });
});

describe('nextBadge', () => {
  const b = (id: string, have: number, need: number) => ({ id, name: id, desc: '', glyph: '', tone: 'ink' as const, have, need, earned: have >= need });
  it('picks the started badge furthest along', () => {
    expect(nextBadge([b('a', 1, 1), b('b', 3, 7), b('c', 40, 50), b('d', 0, 1)])?.id).toBe('c');
    expect(nextBadge([b('x', 5, 10), b('y', 1, 2)])?.id).toBe('y'); // same share, smaller goal
    expect(nextBadge([b('a', 1, 1), b('d', 0, 5)])).toBeNull();
  });
});

describe('planRest', () => {
  const f = (name: string, kcal: number, protein: number, tags?: string) => ({ id: name, name, serving: '', kcal, protein, carbs: 0, fat: 0, tags });
  const pool = [f('Whey', 120, 24, 'w'), f('Paneer bhurji', 450, 25), f('Milk', 170, 9), f('Pizza', 1800, 60), f('Roti', 120, 4)];
  const need = { kcal: 800, protein: 50, carbs: 0, fat: 0 };
  it('picks a few foods that close both gaps without a big overshoot', () => {
    const plan = planRest(need, pool, { wheyOk: true })!;
    expect(plan.foods.map((x) => x.name)).not.toContain('Pizza');
    expect(plan.foods.length).toBeLessThanOrEqual(3);
    expect(plan.kcal).toBeLessThanOrEqual(800 + 150);
    expect(plan.protein).toBeGreaterThanOrEqual(40);
  });
  it('respects no-whey and stops when little is left', () => {
    expect(planRest(need, pool, { wheyOk: false })!.foods.map((x) => x.name)).not.toContain('Whey');
    expect(planRest({ kcal: 200, protein: 10, carbs: 0, fat: 0 }, pool, { wheyOk: true })).toBeNull();
  });
});

describe('drinkMl', () => {
  it('adds up drinks served in ml or L, not bowls or grams', () => {
    const e = (serving: string, qty = 1): Entry => ({ id: serving, name: 'x', serving, base: { kcal: 100, protein: 1, carbs: 0, fat: 0 }, qty, source: 'db', at: 0 });
    expect(drinkMl([e('300 ml glass'), e('large (~450 ml)', 2), e('1 bowl (250 ml)'), e('100 g'), e('1.5 L bottle'), e('1 glass')])).toBe(300 + 900 + 1500);
  });
});

describe('eatenByTime', () => {
  it('sums a day up to the same clock time', () => {
    const e = (hhmm: string, kcal: number): Entry => ({ id: hhmm, name: 'x', serving: '', base: { kcal, protein: 0, carbs: 0, fat: 0 }, qty: 1, source: 'db', at: atOn('2026-10-28', hhmm) });
    const days = { '2026-10-28': { entries: [e('08:00', 500), e('13:00', 700), e('19:00', 900)], water: 0, checks: {} } };
    expect(eatenByTime(days, '2026-10-28', atOn('2026-10-29', '15:30'))).toBe(1200);
    expect(eatenByTime(days, '2026-10-28', atOn('2026-10-29', '07:00'))).toBe(0);
    expect(eatenByTime(days, '2026-10-27', atOn('2026-10-29', '15:30'))).toBeNull();
  });
});

describe('coverage', () => {
  const T = { kcal: 3000, protein: 120, carbs: 0, fat: 0 };
  const m = (kcal: number, protein: number) => ({ kcal, protein, carbs: 0, fat: 0 });
  it('gives the share of what is left', () => {
    expect(coverage(m(500, 20), m(2000, 80), T)).toEqual({ kcal: 50, protein: 50, overKcal: false });
  });
  it('caps at 100, skips a target already hit, and flags a big overshoot', () => {
    expect(coverage(m(1500, 10), m(2000, 130), T)).toEqual({ kcal: 100, protein: null, overKcal: true });
  });
});

describe('known barcodes', () => {
  it('finds a product scanned before by its barcode', () => {
    const foods = [{ id: 'a', name: 'Yoghurt', serving: '170 g', kcal: 150, protein: 15, carbs: 6, fat: 7, barcode: '9300601000000' }, { id: 'b', name: 'Toast', serving: '2', kcal: 190, protein: 8, carbs: 32, fat: 2 }];
    expect(findByBarcode(foods, ' 9300601000000 ')?.name).toBe('Yoghurt');
    expect(findByBarcode(foods, '123')).toBeUndefined();
  });
});

describe('training day targets', () => {
  it('adds the boost to the day energy target and to game hits', () => {
    const T = DEFAULT_DATA.settings.targets;
    expect(dayTargets(T, { entries: [], water: 0, checks: {}, boost: 300 }).kcal).toBe(T.kcal + 300);
    expect(dayTargets(T, undefined)).toBe(T);
    const k = '2026-10-29';
    const e: Entry = { id: 'a', name: 'x', serving: '', base: { kcal: T.kcal, protein: T.protein, carbs: 0, fat: 0 }, qty: 1, source: 'db', at: atOn(k, '12:00') };
    const data = (boost?: number) => ({ ...structuredClone(DEFAULT_DATA), days: { [k]: { entries: [e], water: 0, checks: {}, ...(boost ? { boost } : {}) } } });
    expect(computeGame(data(), k).byDate.get(k)?.hitKcal).toBe(true);
    expect(computeGame(data(500), k).byDate.get(k)?.hitKcal).toBe(false);
  });
});

describe('week stats with training days', () => {
  it('judges a training day against its higher target', () => {
    const k = '2026-10-27';
    const e: Entry = { id: 'a', name: 'x', serving: '', base: { kcal: 3100, protein: 120, carbs: 0, fat: 0 }, qty: 1, source: 'db', at: atOn(k, '12:00') };
    const T = { kcal: 3000, protein: 115 };
    expect(weekStats({ [k]: { entries: [e], water: 0, checks: {} } }, '2026-10-26', '2026-10-29', T).hit).toBe(1);
    expect(weekStats({ [k]: { entries: [e], water: 0, checks: {}, boost: 300 } }, '2026-10-26', '2026-10-29', T).hit).toBe(0);
  });
});

describe('custom checks', () => {
  it('keeps valid checks, drops bad keys and duplicates, caps at 6, falls back to defaults', () => {
    expect(cleanChecks([['veg', 'Fruit'], ['bad key', 'x'], ['veg', 'dup'], ['xab', 'Breakfast']])).toEqual([['veg', 'Fruit'], ['xab', 'Breakfast']]);
    expect(cleanChecks(Array.from({ length: 9 }, (_, i) => ['k' + 'abcdefghi'[i], 'L' + i]))).toHaveLength(6);
    expect(cleanChecks(undefined)).toEqual(DEFAULT_CHECKS);
    expect(normalize({}).settings.checks).toEqual(DEFAULT_CHECKS);
  });
  it('asks the quality quest for all of your checks', () => {
    const k = '2026-10-29';
    const data = { ...structuredClone(DEFAULT_DATA), settings: { ...DEFAULT_DATA.settings, checks: [['veg', 'Veg'], ['xab', 'Breakfast']] as [string, string][] }, days: { [k]: { entries: [], water: 0, checks: { veg: true, xab: true } } } };
    const g = computeGame(data, k);
    const q = g.quests.find((x) => x.id === 'quality');
    if (q) expect(q.isDone).toBe(true);
  });
});

describe('insights', () => {
  const today = '2026-10-29';
  const e = (k: string, hh: string, kcal: number, protein: number): Entry => ({ id: k + hh, name: 'x', serving: '', base: { kcal, protein, carbs: 0, fat: 0 }, qty: 1, source: 'db', at: atOn(k, hh) });
  const day = (items: Entry[]): DayLog => ({ entries: items, water: 0, checks: {} });
  const T = { kcal: 3000, protein: 115 };
  const f = (k: number) => `${Math.round(k)} kcal`;
  it('needs at least two logged days', () => {
    expect(insights({}, today, T, f)).toEqual([]);
  });
  it('spots low protein, an energy shortfall, a light breakfast and missed days', () => {
    const days: Record<string, DayLog> = {};
    for (const i of [1, 2, 3]) {
      const k = addDays(today, -i);
      days[k] = day([e(k, '08:00', 200, 10), e(k, '13:00', 1200, 30), e(k, '19:00', 1200, 30)]);
    }
    const text = insights(days, today, T, f).map((x) => x.text).join(' | ');
    expect(text).toMatch(/Protein was hit on 0 of 3/);
    expect(text).toMatch(/averaging 400 kcal under/);
    expect(text).toMatch(/Breakfast averages 200 kcal/);
    expect(text).toMatch(/4 of the last 7 days have nothing logged/);
  });
});

describe('evening wrap-up', () => {
  it('is due once a day after 9 pm', () => {
    const at = (h: number) => new Date(2026, 9, 29, h, 5).getTime();
    expect(wrapDue(at(20), '')).toBe(false);
    expect(wrapDue(at(21), '')).toBe(true);
    expect(wrapDue(at(22), '2026-10-29')).toBe(false);
  });
  it('says what is left, or well done', () => {
    const T = { kcal: 3000, protein: 115 };
    expect(wrapText({ kcal: 2600, protein: 100 }, T).title).toBe('400 kcal and 15 g protein to go today');
    expect(wrapText({ kcal: 2600, protein: 100 }, T).body).toMatch(/milk and a banana/);
    expect(wrapText({ kcal: 3100, protein: 120 }, T).title).toBe('Both targets hit today');
  });
});

describe('goal progress', () => {
  it('measures start to goal, clamped', () => {
    expect(goalProgress(58, 60, 66)).toBe(0.25);
    expect(goalProgress(58, 57, 66)).toBe(0);
    expect(goalProgress(58, 70, 66)).toBe(1);
    expect(goalProgress(58, 60, null)).toBeNull();
    expect(goalProgress(58, 60, 55)).toBeNull();
  });
});

describe('week summary', () => {
  it('lists this week, last week and the weight trend', () => {
    const w = { logged: 4, hit: 2, kcal: 2950, protein: 112 };
    const last = { logged: 6, hit: 3, kcal: 2800, protein: 100 };
    const text = weekSummary('Week of 26 October', w, last, 0.31, (k) => `${Math.round(k)} kcal`);
    expect(text.split('\n')).toEqual([
      'Week of 26 October',
      'Average 2950 kcal and 112 g protein a day',
      '4 days logged, 2 on both targets',
      'Last week: 2800 kcal, 100 g protein, 3 of 6 days on target',
      'Weight trend: +0.31 kg a week',
    ]);
  });
});
