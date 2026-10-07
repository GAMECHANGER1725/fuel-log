// Built-in food list: vegetarian (eggs and dairy, no meat or fish).
// Australian staples plus Gujarati/Indian home cooking.
// Values are typical estimates per serving; labels and recipes vary.
// Tags: p = easy to pack for school, g = good for closing a gap, w = whey.

import type { Food, Macros } from './types';
import { scale } from './nutrition';

type Row = [name: string, serving: string, kcal: number, protein: number, carbs: number, fat: number, tags?: string];

const ROWS: Row[] = [
  // Dairy and drinks
  ['Milk, full cream', '300 ml glass', 195, 10, 14, 11, 'g'],
  ['Milk, skim', '250 ml', 90, 9, 12.5, 0.3],
  ['Greek yoghurt, plain', '170 g tub', 165, 15, 7, 8, 'pg'],
  ['Yoghurt, natural', '200 g', 150, 9, 11, 8],
  ['Cheese slice', '1 slice (21 g)', 80, 5, 0.3, 6.5, 'p'],
  ['Cheddar cheese', '30 g', 120, 7.5, 0, 10, 'p'],
  ['Paneer, plain', '100 g', 290, 19, 3.6, 22],
  ['Liquid breakfast drink', '250 ml carton', 195, 8.5, 28, 4.5, 'p'],
  ['High-protein milk', '500 ml', 300, 30, 30, 6, 'pg'],
  ['Flavoured milk', '600 ml', 470, 20, 62, 16, 'p'],
  ['Hot chocolate with milk', '300 ml', 260, 10, 32, 10],
  ['Sweet lassi', '300 ml', 260, 9, 40, 7],
  ['Mango lassi', '300 ml', 300, 8, 50, 7],
  ['Chaas (buttermilk)', '300 ml', 60, 3.5, 5, 2.5],
  ['Ice cream', '2 scoops (100 g)', 200, 3.5, 24, 10],
  ['Orange juice', '250 ml', 110, 1.7, 26, 0.5],
  ['Smoothie: milk, banana, oats, PB', '1 large glass', 540, 20, 70, 20, 'g'],
  ['Bulk shake: milk, banana, oats, 2 tbsp PB', '1 shaker (~600 ml)', 755, 30, 78, 38, 'g'],
  ['Whey protein', '1 scoop (30 g)', 120, 24, 3, 1.5, 'w'],
  ['Whey shake with milk', '1 scoop + 300 ml milk', 315, 34, 17, 12.5, 'wg'],
  ['Soft drink', '375 ml can', 160, 0, 40, 0],
  ['Sports drink', '600 ml', 150, 0, 36, 0],

  // Eggs, legumes, soy
  ['Egg, boiled', '1 large', 75, 6.3, 0.5, 5, 'p'],
  ['Scrambled eggs with butter', '2 eggs', 200, 13, 1.5, 15.5],
  ['Cheese omelette', '3 eggs', 340, 23, 2, 26, 'g'],
  ['Boiled eggs', '2 eggs', 150, 12.6, 1, 10, 'pg'],
  ['Masala omelette', '2 eggs', 210, 13, 3, 16],
  ['Egg bhurji', '2 eggs', 220, 13, 4, 17],
  ['Egg sandwich', '1 sandwich', 370, 18, 32, 18, 'pg'],
  ['Egg and cheese wrap', '1 wrap', 440, 22, 33, 24, 'pg'],
  ['Cottage cheese', '100 g', 100, 11, 3.5, 4.5],
  ['Soy milk', '250 ml', 100, 8, 7, 4.5],
  ['Soya chunks, dry', '50 g', 175, 26, 16, 0.3],
  ['Soya chunk curry', '1 bowl (~250 g)', 260, 22, 20, 10, 'g'],
  ['Edamame', '1 cup', 190, 17, 14, 8, 'pg'],
  ['Tempeh', '100 g', 195, 20, 8, 11],
  ['Veggie sausages', '2 sausages', 220, 16, 8, 14],
  ['Hummus', '50 g', 120, 4, 7, 9, 'p'],
  ['Paneer tikka', '150 g paneer', 380, 24, 8, 28, 'g'],
  ['Lentils or beans, cooked', '1 cup', 230, 16, 40, 0.8],
  ['Chickpeas, cooked', '1 cup', 270, 14.5, 45, 4],
  ['Baked beans', '210 g (half can)', 165, 9.5, 27, 0.6],
  ['Tofu, firm', '100 g', 145, 15.5, 2.5, 8.5],

  // Bread, cereal, grains
  ['Rolled oats, dry', '80 g', 300, 10, 51, 6],
  ['Oats with milk', '80 g oats + 300 ml milk', 495, 20, 65, 17, 'g'],
  ['Wheat biscuits', '2 biscuits (30 g)', 110, 3.7, 20, 0.5],
  ['Muesli', '60 g', 240, 6, 36, 7],
  ['Granola', '60 g', 270, 6, 36, 11],
  ['Wholegrain bread', '2 slices', 190, 8, 32, 2.5],
  ['White bread', '2 slices', 180, 6, 34, 2],
  ['Toast with butter', '2 slices', 260, 6.2, 32, 11],
  ['Peanut butter', '1 tbsp (20 g)', 120, 5, 3, 10, 'p'],
  ['Peanut butter toast', '2 slices + 2 tbsp PB', 430, 18, 38, 22, 'g'],
  ['Glass of milk + PB toast', '300 ml + 1 slice', 410, 18.5, 33, 22, 'g'],
  ['Peanut butter sandwich', '2 slices + 1 tbsp', 310, 13, 35, 12.5, 'pg'],
  ['Cheese sandwich', '1 sandwich', 330, 15, 33, 15, 'p'],
  ['Tortilla wrap', '1 wrap', 180, 5, 30, 4.5],
  ['Bagel, plain', '1 bagel', 250, 10, 49, 1.5],
  ['Croissant', '1 croissant', 230, 4.7, 26, 12],
  ['Rice, cooked', '1 cup', 205, 4.3, 45, 0.4],
  ['Pasta, cooked', '1 cup (140 g)', 220, 8, 43, 1.3],
  ['Lentil bolognese', '1 bowl', 520, 24, 75, 14, 'g'],
  ['Mac and cheese', '1 bowl (250 g)', 450, 17, 50, 20],
  ['Instant noodles', '1 pack', 345, 7.5, 47, 14],
  ['Potato, baked', '1 medium (200 g)', 190, 5, 42, 0.3],
  ['Sweet potato, baked', '150 g', 130, 2.4, 30, 0.2],
  ['Hot chips', '150 g', 470, 5.7, 62, 22],

  // Gujarati and Indian
  ['Rotli with ghee', '1 rotli (~40 g)', 130, 3.3, 18, 5],
  ['Rotli, plain', '1 rotli (~35 g)', 100, 3, 18, 1.5],
  ['Thepla', '1 thepla', 120, 3, 15, 5.5, 'p'],
  ['Paratha, plain', '1 paratha', 230, 5, 30, 10],
  ['Aloo paratha', '1 paratha', 290, 6, 40, 12],
  ['Bhakri', '1 bhakri', 150, 3.5, 22, 5.5],
  ['Puri', '1 puri', 100, 1.5, 10, 6],
  ['Toor dal', '1 bowl (~250 g)', 230, 13, 32, 5],
  ['Moong dal', '1 bowl (~250 g)', 210, 13, 30, 4],
  ['Dal makhani', '1 bowl (~250 g)', 340, 14, 35, 16],
  ['Kadhi', '1 bowl (250 ml)', 160, 6, 14, 9],
  ['Rajma', '1 bowl (~250 g)', 280, 14, 40, 7],
  ['Chole (chana masala)', '1 bowl (~250 g)', 330, 14, 42, 12],
  ['Paneer shaak', '1 bowl (~150 g)', 340, 17, 12, 25],
  ['Palak paneer', '1 bowl (~200 g)', 310, 15, 12, 23],
  ['Paneer bhurji', '1 bowl (~150 g)', 350, 20, 9, 26, 'g'],
  ['Paneer tikka wrap', '1 wrap', 520, 24, 50, 24, 'pg'],
  ['Bateta nu shaak (potato)', '1 bowl', 200, 3.5, 28, 9],
  ['Mixed veg shaak', '1 bowl', 150, 4, 16, 8],
  ['Khichdi', '1 bowl (~300 g)', 360, 13, 58, 9],
  ['Dhokla', '4 pieces (100 g)', 160, 7, 23, 5, 'p'],
  ['Khandvi', '6 pieces', 180, 7, 18, 9],
  ['Handvo', '1 slice (150 g)', 280, 10, 35, 11, 'p'],
  ['Poha', '1 plate (200 g)', 320, 6, 50, 11],
  ['Upma', '1 plate', 300, 7, 45, 10],
  ['Idli', '2 idli', 120, 4, 25, 0.5],
  ['Dosa, plain', '1 dosa', 170, 4, 28, 4.5],
  ['Masala dosa', '1 dosa', 380, 8, 55, 14],
  ['Sambar', '1 bowl (250 ml)', 150, 7, 22, 4],
  ['Veg biryani', '1 plate (300 g)', 480, 11, 70, 17],
  ['Pav bhaji', '2 pav + bhaji', 600, 14, 80, 25],
  ['Samosa', '1 samosa', 260, 4.5, 28, 15],
  ['Vada pav', '1 vada pav', 300, 7, 42, 12],
  ['Raita', '1 bowl (150 g)', 110, 5, 9, 6],
  ['Shrikhand', '100 g', 250, 7, 40, 7],
  ['Gulab jamun', '2 pieces', 300, 4, 45, 12],
  ['Sev or ganthiya', '30 g', 170, 4, 14, 11, 'p'],
  ['Peanut chikki', '30 g', 150, 4.5, 15, 8, 'p'],

  // Fruit and veg
  ['Banana', '1 medium', 105, 1.3, 27, 0.4, 'p'],
  ['Apple', '1 medium', 95, 0.5, 25, 0.3, 'p'],
  ['Mango', '1 cup', 100, 1.4, 25, 0.6],
  ['Orange', '1 medium', 62, 1.2, 15, 0.2, 'p'],
  ['Grapes', '1 cup', 105, 1.1, 27, 0.2, 'p'],
  ['Dates', '4 dates', 270, 2, 72, 0.2, 'p'],
  ['Avocado', '1/2 avocado', 160, 2, 8.5, 15],
  ['Garden salad, no dressing', '1 bowl', 35, 2, 6, 0.3],

  // Snacks
  ['Almonds', '30 g handful', 175, 6.4, 6, 15, 'pg'],
  ['Mixed nuts', '30 g handful', 185, 6, 6, 16, 'pg'],
  ['Cashews', '30 g', 165, 5.4, 9, 13, 'p'],
  ['Trail mix', '50 g', 240, 7, 22, 15, 'pg'],
  ['Muesli bar', '1 bar', 150, 2.5, 22, 5.5, 'p'],
  ['Protein bar', '1 bar (60 g)', 220, 20, 22, 7, 'pg'],
  ['Chocolate bar', '50 g', 265, 3.5, 29, 15, 'p'],
  ['Crackers and cheese', '1 pack', 200, 8, 15, 12, 'p'],
  ['Popcorn', '30 g', 140, 3, 18, 6, 'p'],
  ['Potato chips', '45 g packet', 240, 3, 23, 15, 'p'],
  ['Cookies', '2 cookies', 160, 2, 22, 7.5, 'p'],
  ['Banana bread', '1 slice', 330, 5, 50, 12, 'p'],

  // Takeaway
  ['Veggie burger', '1 burger', 480, 18, 52, 22],
  ['Falafel wrap', '1 wrap', 520, 17, 62, 22, 'p'],
  ['Bean and cheese burrito bowl', '1 bowl', 620, 24, 85, 20],
  ['Egg fried rice', '1 plate', 520, 14, 75, 18],
  ['Vegetable pie', '1 pie', 400, 9, 38, 23],
  ['Vegetarian sausage roll', '1 roll', 330, 10, 28, 19],
  ['Vegetarian sushi hand roll', '1 roll', 190, 4, 36, 3.5, 'p'],  ['Pizza', '1 large slice', 280, 12, 33, 11],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const FOODS: Food[] = ROWS.map(([name, serving, kcal, protein, carbs, fat, tags]) => ({
  id: `db-${slug(name)}`,
  name,
  serving,
  kcal,
  protein,
  carbs,
  fat,
  tags,
}));

export const foodMacros = (f: Food): Macros => ({ kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat });

/** Search by every word in the query, best match (name starts with query) first. */
export function searchFoods(list: Food[], query: string, limit = 30): Food[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const q = words.join(' ');
  return list
    .filter((f) => {
      const hay = `${f.name} ${f.serving}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)))
    .slice(0, limit);
}

/**
 * "Close the gap": foods that best cover what's still needed today.
 * Protein counts a bit more than energy, and big overshoots are penalised.
 * During school hours only foods you can pack are suggested.
 */
export function gapSuggestions(
  need: { kcal: number; protein: number },
  candidates: Food[],
  opts: { wheyOk: boolean; atSchool: boolean },
  limit = 3,
): Food[] {
  const K = Math.max(0, need.kcal);
  const P = Math.max(0, need.protein);
  if (K < 100 && P < 5) return [];
  const seen = new Set<string>();
  return candidates
    .filter((f) => (opts.wheyOk || !f.tags?.includes('w')) && f.kcal > 0 && (!opts.atSchool || !!f.tags?.includes('p')))
    .filter((f) => {
      const key = f.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((f) => {
      const p = P > 0 ? Math.min(f.protein, P) / P : 0;
      const k = K > 0 ? Math.min(f.kcal, K) / K : 0;
      const over = Math.max(0, f.kcal - K - 150) / 500;
      return { f, score: 0.55 * p + 0.45 * k - over };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}

/** Portion of a food as macros (qty = number of servings). */
export const portion = (f: Food, qty: number): Macros => scale(foodMacros(f), qty);
