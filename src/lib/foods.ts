// Built-in food list: vegetarian (eggs and dairy, no meat or fish).
// Australian staples plus Gujarati/Indian home cooking.
// Values are typical estimates per serving; labels and recipes vary.
// Tags: p = easy to pack for school, g = good for closing a gap, w = whey.
// When it suits: b = breakfast, m = a main meal (lunch or dinner), s = snack, d = a drink (any time, also late).
// Only tagged foods are suggested by Close the gap.

import type { Food, Macros } from './types';
import { scale } from './nutrition';
import { RECIPES, recipeMacros } from './recipes';

type Row = [name: string, serving: string, kcal: number, protein: number, carbs: number, fat: number, tags?: string];

const ROWS: Row[] = [
  // Dairy and drinks
  ['Milk, full cream', '300 ml glass', 195, 10, 14, 11, 'gd'],
  ['Milk, skim', '250 ml', 90, 9, 12.5, 0.3],
  ['Greek yoghurt, plain', '170 g tub', 165, 15, 7, 8, 'pgbs'],
  ['Yoghurt, natural', '200 g', 150, 9, 11, 8, 'bs'],
  ['Cheese slice', '1 slice (21 g)', 80, 5, 0.3, 6.5, 'ps'],
  ['Cheddar cheese', '30 g', 120, 7.5, 0, 10, 'ps'],
  ['Paneer, plain', '100 g', 290, 19, 3.6, 22],
  ['Liquid breakfast drink', '250 ml carton', 195, 8.5, 28, 4.5, 'pbd'],
  ['High-protein milk', '500 ml', 300, 30, 30, 6, 'pgd'],
  ['Flavoured milk', '600 ml', 470, 20, 62, 16, 'pd'],
  ['Hot chocolate with milk', '300 ml', 260, 10, 32, 10, 'd'],
  ['Sweet lassi', '300 ml', 260, 9, 40, 7, 'd'],
  ['Mango lassi', '300 ml', 300, 8, 50, 7, 'd'],
  ['Chaas (buttermilk)', '300 ml', 60, 3.5, 5, 2.5],
  ['Ice cream', '2 scoops (100 g)', 200, 3.5, 24, 10, 's'],
  ['Orange juice', '250 ml', 110, 1.7, 26, 0.5, 'b'],
  ['Whey protein', '1 scoop (30 g)', 120, 24, 3, 1.5, 'wd'],
  ['Soft drink', '375 ml can', 160, 0, 40, 0],
  ['Sports drink', '600 ml', 150, 0, 36, 0],

  // Eggs, legumes, soy
  ['Egg, boiled', '1 large', 75, 6.3, 0.5, 5, 'pbs'],
  ['Scrambled eggs with butter', '2 eggs', 200, 13, 1.5, 15.5, 'b'],
  ['Masala omelette', '2 eggs', 210, 13, 3, 16, 'b'],
  ['Egg bhurji', '2 eggs', 220, 13, 4, 17, 'bm'],
  ['Cottage cheese', '100 g', 100, 11, 3.5, 4.5, 's'],
  ['Soy milk', '250 ml', 100, 8, 7, 4.5, 'd'],
  ['Soya chunks, dry', '50 g', 175, 26, 16, 0.3],
  ['Tempeh', '100 g', 195, 20, 8, 11, 'm'],
  ['Veggie sausages', '2 sausages', 220, 16, 8, 14, 'bm'],
  ['Hummus', '50 g', 120, 4, 7, 9, 'ps'],
  ['Lentils or beans, cooked', '1 cup', 230, 16, 40, 0.8, 'm'],
  ['Chickpeas, cooked', '1 cup', 270, 14.5, 45, 4, 'm'],
  ['Baked beans', '210 g (half can)', 165, 9.5, 27, 0.6, 'bm'],
  ['Tofu, firm', '100 g', 145, 15.5, 2.5, 8.5, 'm'],

  // Bread, cereal, grains
  ['Rolled oats, dry', '80 g', 300, 10, 51, 6, 'b'],
  ['Wheat biscuits', '2 biscuits (30 g)', 110, 3.7, 20, 0.5, 'b'],
  ['Muesli', '60 g', 240, 6, 36, 7, 'b'],
  ['Granola', '60 g', 270, 6, 36, 11, 'b'],
  ['Wholegrain bread', '2 slices', 190, 8, 32, 2.5, 'b'],
  ['White bread', '2 slices', 180, 6, 34, 2],
  ['Toast with butter', '2 slices', 260, 6.2, 32, 11, 'b'],
  ['Peanut butter', '1 tbsp (20 g)', 120, 5, 3, 10, 'ps'],
  ['Tortilla wrap', '1 wrap', 180, 5, 30, 4.5],
  ['Bagel, plain', '1 bagel', 250, 10, 49, 1.5, 'b'],
  ['Croissant', '1 croissant', 230, 4.7, 26, 12, 'b'],
  ['Rice, cooked', '1 cup', 205, 4.3, 45, 0.4, 'm'],
  ['Pasta, cooked', '1 cup (140 g)', 220, 8, 43, 1.3, 'm'],
  ['Mac and cheese', '1 bowl (250 g)', 450, 17, 50, 20, 'm'],
  ['Instant noodles', '1 pack', 345, 7.5, 47, 14],
  ['Potato, baked', '1 medium (200 g)', 190, 5, 42, 0.3, 'm'],
  ['Sweet potato, baked', '150 g', 130, 2.4, 30, 0.2],
  ['Hot chips', '150 g', 470, 5.7, 62, 22],

  // Gujarati and Indian
  ['Rotli with ghee', '1 rotli (~40 g)', 130, 3.3, 18, 5, 'm'],
  ['Rotli, plain', '1 rotli (~35 g)', 100, 3, 18, 1.5, 'm'],
  ['Paratha, plain', '1 paratha', 230, 5, 30, 10, 'bm'],
  ['Aloo paratha', '1 paratha', 290, 6, 40, 12, 'bm'],
  ['Bhakri', '1 bhakri', 150, 3.5, 22, 5.5, 'bm'],
  ['Puri', '1 puri', 100, 1.5, 10, 6],
  ['Toor dal', '1 bowl (~250 g)', 230, 13, 32, 5, 'm'],
  ['Moong dal', '1 bowl (~250 g)', 210, 13, 30, 4, 'm'],
  ['Dal makhani', '1 bowl (~250 g)', 340, 14, 35, 16, 'm'],
  ['Kadhi', '1 bowl (250 ml)', 160, 6, 14, 9, 'm'],
  ['Rajma', '1 bowl (~250 g)', 280, 14, 40, 7, 'm'],
  ['Chole (chana masala)', '1 bowl (~250 g)', 330, 14, 42, 12, 'm'],
  ['Paneer shaak', '1 bowl (~150 g)', 340, 17, 12, 25, 'm'],
  ['Palak paneer', '1 bowl (~200 g)', 310, 15, 12, 23, 'm'],
  ['Bateta nu shaak (potato)', '1 bowl', 200, 3.5, 28, 9, 'm'],
  ['Mixed veg shaak', '1 bowl', 150, 4, 16, 8, 'm'],
  ['Khichdi', '1 bowl (~300 g)', 360, 13, 58, 9, 'm'],
  ['Dhokla', '4 pieces (100 g)', 160, 7, 23, 5, 'pbs'],
  ['Khandvi', '6 pieces', 180, 7, 18, 9, 's'],
  ['Handvo', '1 slice (150 g)', 280, 10, 35, 11, 'pbs'],
  ['Poha', '1 plate (200 g)', 320, 6, 50, 11, 'b'],
  ['Upma', '1 plate', 300, 7, 45, 10, 'b'],
  ['Idli', '2 idli', 120, 4, 25, 0.5, 'b'],
  ['Dosa, plain', '1 dosa', 170, 4, 28, 4.5, 'bm'],
  ['Masala dosa', '1 dosa', 380, 8, 55, 14, 'bm'],
  ['Sambar', '1 bowl (250 ml)', 150, 7, 22, 4, 'm'],
  ['Veg biryani', '1 plate (300 g)', 480, 11, 70, 17, 'm'],
  ['Pav bhaji', '2 pav + bhaji', 600, 14, 80, 25, 'm'],
  ['Samosa', '1 samosa', 260, 4.5, 28, 15, 's'],
  ['Vada pav', '1 vada pav', 300, 7, 42, 12, 's'],
  ['Raita', '1 bowl (150 g)', 110, 5, 9, 6],
  ['Shrikhand', '100 g', 250, 7, 40, 7, 's'],
  ['Gulab jamun', '2 pieces', 300, 4, 45, 12],
  ['Sev or ganthiya', '30 g', 170, 4, 14, 11, 'ps'],
  ['Peanut chikki', '30 g', 150, 4.5, 15, 8, 'ps'],

  // Fruit and veg
  ['Banana', '1 medium', 105, 1.3, 27, 0.4, 'pbs'],
  ['Apple', '1 medium', 95, 0.5, 25, 0.3, 'ps'],
  ['Mango', '1 cup', 100, 1.4, 25, 0.6, 's'],
  ['Orange', '1 medium', 62, 1.2, 15, 0.2, 'ps'],
  ['Grapes', '1 cup', 105, 1.1, 27, 0.2, 'ps'],
  ['Dates', '4 dates', 270, 2, 72, 0.2, 'ps'],
  ['Avocado', '1/2 avocado', 160, 2, 8.5, 15, 'b'],
  ['Garden salad, no dressing', '1 bowl', 35, 2, 6, 0.3],

  // Snacks
  ['Almonds', '30 g handful', 175, 6.4, 6, 15, 'pgs'],
  ['Mixed nuts', '30 g handful', 185, 6, 6, 16, 'pgs'],
  ['Cashews', '30 g', 165, 5.4, 9, 13, 'ps'],
  ['Muesli bar', '1 bar', 150, 2.5, 22, 5.5, 'ps'],
  ['Protein bar', '1 bar (60 g)', 220, 20, 22, 7, 'pgs'],
  ['Chocolate bar', '50 g', 265, 3.5, 29, 15, 'ps'],
  ['Crackers and cheese', '1 pack', 200, 8, 15, 12, 'ps'],
  ['Popcorn', '30 g', 140, 3, 18, 6, 'ps'],
  ['Potato chips', '45 g packet', 240, 3, 23, 15, 'ps'],
  ['Cookies', '2 cookies', 160, 2, 22, 7.5, 'ps'],
  ['Banana bread', '1 slice', 330, 5, 50, 12, 'pbs'],

  // Takeaway
  ['Veggie burger', '1 burger', 480, 18, 52, 22, 'm'],
  ['Falafel wrap', '1 wrap', 520, 17, 62, 22, 'pm'],
  ['Bean and cheese burrito bowl', '1 bowl', 620, 24, 85, 20, 'm'],
  ['Egg fried rice', '1 plate', 520, 14, 75, 18, 'm'],
  ['Vegetable pie', '1 pie', 400, 9, 38, 23, 'm'],
  ['Vegetarian sausage roll', '1 roll', 330, 10, 28, 19, 's'],
  ['Vegetarian sushi hand roll', '1 roll', 190, 4, 36, 3.5, 'pm'],
  ['Pizza', '1 large slice', 280, 12, 33, 11, 'm'],
  ['Veggie sub with cheese', '6-inch sub', 330, 15, 50, 9, 'm'],
  ['Paneer kathi roll', '1 roll', 520, 20, 55, 24, 'm'],
  ['Vegetable fried rice', '1 takeaway box (~400 g)', 650, 14, 100, 20, 'm'],
  ['Veg thali (restaurant)', '1 thali', 950, 28, 120, 38, 'm'],
  ['Vegetarian pad thai with egg', '1 plate', 700, 22, 90, 26, 'm'],
  ['Nachos with beans and cheese', '1 plate', 850, 28, 80, 45, 'm'],
  ['Vegetable spring rolls', '2 rolls', 260, 5, 30, 13, 's'],
  ['Vegetable dumplings, steamed', '6 dumplings', 300, 9, 45, 8, 's'],
  ['Mango kulfi', '1 stick', 180, 4, 20, 9, 's'],
  ['Masala chai with milk', '250 ml cup', 120, 4, 16, 4.5, 'd'],
  ['Iced coffee (café)', 'large (~450 ml)', 380, 12, 45, 17, 'd'],
  ['Chocolate milkshake', 'large (~500 ml)', 600, 16, 85, 22, 'd'],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ROW_FOODS: Food[] = ROWS.map(([name, serving, kcal, protein, carbs, fat, tags]) => ({
  id: `db-${slug(name)}`,
  name,
  serving,
  kcal,
  protein,
  carbs,
  fat,
  tags,
}));

// Dishes with a recipe get their numbers from the recipe (see recipes.ts).
const RECIPE_FOODS: Food[] = RECIPES.map((r) => ({ id: `db-${slug(r.name)}`, name: r.name, serving: r.serving, tags: r.tags, ...recipeMacros(r) }));

export const FOODS: Food[] = [...ROW_FOODS, ...RECIPE_FOODS];

export const foodMacros = (f: Food): Macros => ({ kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat });

/** Search by every word in the query, best match (name starts with query) first. */
/** Other names people type for the same food (Gujarati, Hindi, Australian spellings). Each maps to words in our names. */
const ALIASES: Record<string, string[]> = {
  roti: ['rotli'],
  chapati: ['rotli'],
  chapatti: ['rotli'],
  rotli: ['roti'],
  yogurt: ['yoghurt'],
  dahi: ['yoghurt', 'raita'],
  curd: ['yoghurt'],
  chana: ['chickpea', 'chole'],
  chickpea: ['chole'],
  daal: ['dal'],
  dhal: ['dal'],
  lentil: ['dal'],
  sabzi: ['shaak'],
  sabji: ['shaak'],
  curry: ['shaak', 'masala'],
  aloo: ['potato', 'bateta'],
  potato: ['bateta', 'aloo'],
  bateta: ['potato'],
  pb: ['peanut butter'],
  shake: ['smoothie'],
  smoothie: ['shake'],
  milkshake: ['shake', 'flavoured milk'],
  soy: ['soya'],
  soya: ['soy'],
  omelet: ['omelette'],
  chaas: ['buttermilk'],
  buttermilk: ['chaas'],
  chai: ['tea'],
  chips: ['chips', 'crisps'],
  crisps: ['chips'],
};

/** A query word and what else it may match: its aliases, and the singular of a plural ("eggs" → "egg"). */
export function wordForms(w: string): string[] {
  const one = w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
  return [...new Set([w, one, ...(ALIASES[w] ?? []), ...(ALIASES[one] ?? [])])];
}

/** `mine`: lower-case names of your favourites and recent foods, ranked first after exact-start matches. */
export function searchFoods(list: Food[], query: string, limit = 30, mine: Set<string> = new Set()): Food[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const q = words.join(' ');
  // What you typed matches anywhere; other names only at the start of a word ("tea" shouldn't hit "steamed").
  const atWord = (hay: string, a: string) => new RegExp(`(^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay);
  const forms = words.map((w) => ({ w, alts: wordForms(w) }));
  return list
    .filter((f) => {
      const hay = `${f.name} ${f.serving}`.toLowerCase();
      return forms.every(({ w, alts }) => hay.includes(w) || alts.some((a) => a !== w && atWord(hay, a)));
    })
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) ||
        Number(mine.has(b.name.toLowerCase())) - Number(mine.has(a.name.toLowerCase())),
    )
    .slice(0, limit);
}

export const BROWSE = [
  ['protein', 'High protein'],
  ['dense', 'Big calories'],
  ['b', 'Breakfast'],
  ['m', 'Mains'],
  ['s', 'Snacks'],
  ['d', 'Drinks'],
  ['p', 'For school'],
] as const;
export type Browse = (typeof BROWSE)[number][0];

/**
 * Foods of one kind for browsing without a search: high protein (at least 15 g, or a quarter of the
 * energy from protein), big calories (400+ kcal), or a time/packable tag. Sorted by what the kind is about.
 */
export function browseFoods(list: Food[], kind: Browse, limit = 40): Food[] {
  const seen = new Set<string>();
  const unique = list.filter((f) => f.kcal > 0 && !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase()));
  const picked =
    kind === 'protein'
      ? unique.filter((f) => f.protein >= 15 || (f.protein * 4) / f.kcal >= 0.25).sort((a, b) => b.protein - a.protein)
      : kind === 'dense'
        ? unique.filter((f) => f.kcal >= 400).sort((a, b) => b.kcal - a.kcal)
        : unique.filter((f) => f.tags?.includes(kind)).sort((a, b) => b.kcal - a.kcal);
  return picked.slice(0, limit);
}

export type FoodSort = 'match' | 'protein' | 'lean' | 'kcal';
export const FOOD_SORTS: [FoodSort, string][] = [['match', 'Best match'], ['protein', 'Most protein'], ['lean', 'Protein per kcal'], ['kcal', 'Most energy']];

/** Grams of protein per 100 kcal: how protein-dense a food is. */
export const proteinPer100kcal = (f: Macros): number => (f.kcal > 0 ? (f.protein / f.kcal) * 100 : 0);

/** Re-orders a result list; 'match' keeps the order it came in. Stable, so ties keep their order. */
export function sortFoods<F extends Food>(list: F[], by: FoodSort): F[] {
  if (by === 'match') return list;
  const key = (f: F) => (by === 'protein' ? f.protein : by === 'kcal' ? f.kcal : proteinPer100kcal(f));
  return [...list].sort((a, b) => key(b) - key(a));
}

/** What is still to eat today (negative once a target is passed). */
export const remaining = (targets: Macros, eaten: Macros): Macros => ({
  kcal: targets.kcal - eaten.kcal,
  protein: targets.protein - eaten.protein,
  carbs: targets.carbs - eaten.carbs,
  fat: targets.fat - eaten.fat,
});

export type Focus = 'protein' | 'kcal' | 'carbs' | 'fat';
const FOCUS_KEYS: Focus[] = ['protein', 'kcal', 'carbs', 'fat'];
export const FOCUS_LABEL: Record<Focus, string> = { protein: 'protein', kcal: 'energy', carbs: 'carbs', fat: 'fat' };

/**
 * How much each nutrient matters right now: the share of its daily target still missing, squared so
 * the lowest one dominates. Protein gets a small boost because it is the priority on a bulk.
 */
function gapWeights(need: Macros, targets: Macros): Record<Focus, number> {
  const w = {} as Record<Focus, number>;
  for (const k of FOCUS_KEYS) {
    const left = targets[k] > 0 ? Math.min(1, Math.max(0, need[k]) / targets[k]) : 0;
    w[k] = (left * (k === 'protein' ? 1.3 : 1)) ** 2;
  }
  return w;
}

/** The nutrient furthest behind today, or null if everything is (nearly) covered. */
export function gapFocus(need: Macros, targets: Macros): Focus | null {
  const w = gapWeights(need, targets);
  const best = FOCUS_KEYS.reduce((a, k) => (w[k] > w[a] ? k : a));
  return w[best] > 0 ? best : null;
}

/** The part of the day, from the clock (hours, e.g. 15.5 = 3:30 pm). */
export type Moment = 'breakfast' | 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'late';
export const MOMENT_LABEL: Record<Moment, string> = {
  breakfast: 'breakfast',
  morning: 'a morning snack',
  lunch: 'lunch',
  afternoon: 'an afternoon snack',
  dinner: 'dinner',
  late: 'a late snack',
};

export function momentOf(hour: number): Moment {
  if (hour < 4) return 'late';
  if (hour < 10.5) return 'breakfast';
  if (hour < 11.5) return 'morning';
  if (hour < 14.5) return 'lunch';
  if (hour < 17.5) return 'afternoon';
  if (hour < 21) return 'dinner';
  return 'late';
}

type When = 'b' | 'm' | 's' | 'd';
const WHEN: When[] = ['b', 'm', 's', 'd'];
// ponytail: a fixed table for one person's day (school, dinner around 7); tune here if the routine changes.
const FIT: Record<Moment, Record<When, number>> = {
  breakfast: { b: 1, d: 0.9, s: 0.6, m: 0.35 },
  morning: { s: 1, d: 1, b: 0.7, m: 0.4 },
  lunch: { m: 1, d: 0.7, s: 0.6, b: 0.5 },
  afternoon: { s: 1, d: 1, b: 0.6, m: 0.5 },
  dinner: { m: 1, d: 0.6, s: 0.45, b: 0.35 },
  late: { d: 1, s: 0.75, b: 0.4, m: 0.4 },
};

/** How well a food suits this part of the day (0–1): its best-fitting tag, 0.8 when it has none (e.g. your own foods). */
export function timeFit(f: Food, m: Moment): number {
  const ws = WHEN.filter((w) => f.tags?.includes(w));
  return ws.length ? Math.max(...ws.map((w) => FIT[m][w])) : 0.8;
}

/** Roughly how many more times you'll eat today, one every 3 hours until about 9:30 pm (at least 1). */
export const mealsLeft = (hour: number) => Math.max(1, Math.ceil((21.5 - (hour < 4 ? 24 : hour)) / 3));

/**
 * "Close the gap": foods that best cover what is still missing today. Each nutrient counts in
 * proportion to how far behind it is (see gapWeights), so low protein gives protein-heavy foods,
 * and big overshoots on energy are penalised. During school hours only foods you can pack are suggested.
 * With `hour`, the time of day counts too: foods that suit it (breakfast in the morning, a main at dinner,
 * a drink late) rank higher, and the size aims at one sitting's share of what's left rather than all of it.
 * `round` is the refresh count: each round shows the next `limit` of the best dozen or so, wrapping around.
 */
export function gapSuggestions(
  need: Macros,
  targets: Macros,
  candidates: Food[],
  opts: { wheyOk: boolean; atSchool: boolean; hour?: number },
  limit = 3,
  round = 0,
): Food[] {
  const K = Math.max(0, need.kcal);
  if (K < 100 && need.protein < 5) return [];
  const w = gapWeights(need, targets);
  const wSum = FOCUS_KEYS.reduce((t, k) => t + w[k], 0);
  if (!wSum) return [];
  const moment = opts.hour == null ? null : momentOf(opts.hour);
  // How much energy one sitting should cover: all of it with no time given, else a share (but not tiny).
  const limit1 = opts.hour == null ? K : Math.min(K, Math.max((K / mealsLeft(opts.hour)) * 1.5, 350));
  const seen = new Set<string>();
  const ranked = candidates
    .filter((f) => (opts.wheyOk || !f.tags?.includes('w')) && f.kcal > 0 && (!opts.atSchool || !!f.tags?.includes('p')))
    .filter((f) => {
      const key = f.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((f) => {
      const covered = FOCUS_KEYS.reduce((t, k) => t + (need[k] > 0 ? (w[k] * Math.min(f[k], need[k])) / need[k] : 0), 0) / wSum;
      const over = Math.max(0, f.kcal - limit1 - 150) / 500;
      return { f, score: covered * (moment ? timeFit(f, moment) : 1) - over };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 4)
    .map((x) => x.f);
  if (ranked.length <= limit) return ranked;
  const start = (round * limit) % ranked.length;
  return Array.from({ length: limit }, (_, i) => ranked[(start + i) % ranked.length]);
}

/** Portion of a food as macros (qty = number of servings). */
export const portion = (f: Food, qty: number): Macros => scale(foodMacros(f), qty);
