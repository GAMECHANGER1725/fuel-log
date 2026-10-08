// Vegetarian recipes (eggs and dairy OK). Each dish's calories and macros are WORKED OUT from its
// ingredient amounts using the table below, so the recipe and the numbers you log can't disagree.
// Typical values per 100 g (per 100 ml for liquids): [kcal, protein, carbs, fat].

import type { Macros } from './types';
import { ZERO, add, roundMacros, scale } from './nutrition';

const ING = {
  milk: [65, 3.4, 4.8, 3.7], // full cream
  banana: [89, 1.1, 22.8, 0.3], // peeled
  oats: [375, 12.5, 62, 7.5], // rolled, dry
  pb: [600, 25, 15, 50],
  greekYoghurt: [97, 8.8, 4.1, 5],
  yoghurt: [75, 4.5, 6, 4],
  egg: [143, 12.6, 0.7, 9.5],
  butter: [717, 0.9, 0.1, 81],
  cheddar: [400, 25, 1.3, 33],
  cheeseSlice: [381, 24, 2, 29],
  bread: [250, 10, 42, 3.5], // wholegrain
  honey: [304, 0.3, 82, 0],
  paneer: [290, 19, 3.6, 22],
  oil: [884, 0, 0, 100],
  onion: [40, 1.1, 9.3, 0.1],
  tomato: [18, 0.9, 3.9, 0.2],
  passata: [28, 1.4, 5, 0.2],
  soya: [345, 52, 33, 0.5], // soya chunks, dry
  tortilla: [300, 8.3, 50, 7.5],
  whey: [400, 80, 10, 5],
  nuts: [617, 20, 20, 53], // mixed nuts
  raisins: [299, 3.1, 79, 0.5],
  pasta: [350, 12.5, 71, 1.5], // dry
  lentils: [116, 9, 20, 0.4], // cooked
  atta: [340, 12, 72, 1.7], // whole wheat flour
  besan: [387, 22, 58, 6.7], // chickpea flour
  greens: [25, 2.5, 3.5, 0.4], // methi / leafy greens
  edamame: [121, 11.9, 8.9, 5.2], // shelled
} as const;

type Ing = keyof typeof ING;

/** [ingredient (null = spices, nothing counted), grams or ml, amount shown, what it is] */
type Line = [Ing | null, number, string, string];

export interface Recipe {
  /** Same as the food's name in the food list, so the two are linked. */
  name: string;
  serving: string;
  /** p = packs for school, g = good gap-closer, w = whey. */
  tags: string;
  time: string;
  lines: Line[];
  steps: string[];
}

export const RECIPES: Recipe[] = [
  {
    name: 'Smoothie: milk, banana, oats, PB',
    serving: '1 large glass (~450 ml)',
    tags: 'g',
    time: '5 min',
    lines: [
      ['milk', 250, '250 ml', 'full cream milk'],
      ['banana', 118, '1', 'banana (about 120 g)'],
      ['oats', 40, '40 g', 'rolled oats (½ cup)'],
      ['pb', 20, '1 tbsp', 'peanut butter'],
    ],
    steps: ['Add everything to a blender. A few ice cubes make it cold.', 'Blend for 30–40 seconds until smooth.', 'Drink straight away, or pour into a bottle for your bag.'],
  },
  {
    name: 'Bulk shake: milk, banana, oats, 2 tbsp PB',
    serving: '1 shaker (~600 ml)',
    tags: 'g',
    time: '5 min',
    lines: [
      ['milk', 350, '350 ml', 'full cream milk'],
      ['banana', 118, '1', 'banana (about 120 g)'],
      ['oats', 50, '50 g', 'rolled oats (⅔ cup)'],
      ['pb', 40, '2 tbsp', 'peanut butter'],
    ],
    steps: ['Blend everything for 40–60 seconds so the oats break down fully.', 'Thin with a splash more milk if it’s too thick.', 'Pour into a shaker bottle. Drink within a couple of hours.'],
  },
  {
    name: 'Whey shake with milk',
    serving: '1 scoop + 300 ml milk',
    tags: 'wg',
    time: '2 min',
    lines: [
      ['whey', 30, '1 scoop', 'whey protein (30 g)'],
      ['milk', 300, '300 ml', 'cold full cream milk'],
    ],
    steps: ['Pour the milk into a shaker, then add the scoop on top.', 'Shake hard for 20 seconds.'],
  },
  {
    name: 'Oats with milk',
    serving: '80 g oats + 300 ml milk',
    tags: 'g',
    time: '4 min',
    lines: [
      ['oats', 80, '80 g', 'rolled oats (1 cup)'],
      ['milk', 300, '300 ml', 'full cream milk'],
    ],
    steps: ['Put oats and milk in a big microwave-safe bowl (it bubbles up).', 'Microwave 2½–3 minutes, stirring once halfway.', 'Rest 1 minute. Top with sliced banana or a drizzle of honey if you like (not counted).'],
  },
  {
    name: 'Cheese omelette',
    serving: '3 eggs',
    tags: 'g',
    time: '8 min',
    lines: [
      ['egg', 150, '3', 'eggs'],
      ['cheddar', 25, '25 g', 'grated cheddar'],
      ['butter', 5, '1 tsp', 'butter'],
      [null, 0, 'pinch', 'salt and pepper'],
    ],
    steps: ['Whisk the eggs with salt and pepper.', 'Melt the butter in a non-stick pan on medium heat, pour in the eggs and tilt to spread.', 'When the edges set (about 2 min), sprinkle the cheese over half and fold.', 'Cook 1 more minute until the cheese melts.'],
  },
  {
    name: 'Boiled eggs',
    serving: '2 eggs',
    tags: 'pg',
    time: '12 min',
    lines: [
      ['egg', 100, '2', 'large eggs'],
      [null, 0, 'to taste', 'salt, pepper or chaat masala'],
    ],
    steps: ['Lower the eggs into simmering water and cook 8–9 minutes for firm yolks.', 'Cool in cold water for 2 minutes, then peel.', 'Season. Keeps in the fridge for 2–3 days (peel at school).'],
  },
  {
    name: 'Egg sandwich',
    serving: '1 sandwich',
    tags: 'pg',
    time: '8 min',
    lines: [
      ['bread', 76, '2 slices', 'wholegrain bread'],
      ['egg', 100, '2', 'eggs'],
      ['butter', 5, '1 tsp', 'butter'],
      [null, 0, 'to taste', 'salt and pepper'],
    ],
    steps: ['Scramble or fry the eggs in a little of the butter, seasoning as they cook.', 'Toast the bread and spread with the rest of the butter.', 'Fill, cut in half and wrap for your bag.'],
  },
  {
    name: 'Egg and cheese wrap',
    serving: '1 wrap',
    tags: 'pg',
    time: '8 min',
    lines: [
      ['tortilla', 60, '1', 'large tortilla wrap'],
      ['egg', 100, '2', 'eggs'],
      ['cheeseSlice', 21, '1 slice', 'cheese'],
      ['oil', 5, '1 tsp', 'oil'],
    ],
    steps: ['Scramble the eggs in the oil with a pinch of salt.', 'Lay the cheese slice on the warm wrap and spoon the eggs on top.', 'Roll up tightly and wrap in foil or baking paper.'],
  },
  {
    name: 'Soya chunk curry',
    serving: '1 bowl (~250 g)',
    tags: 'g',
    time: '25 min',
    lines: [
      ['soya', 50, '50 g', 'dry soya chunks'],
      ['onion', 60, '1 small', 'onion, chopped'],
      ['tomato', 80, '1 medium', 'tomato, chopped'],
      ['oil', 5, '1 tsp', 'oil'],
      [null, 0, '½ tsp each', 'turmeric, chilli, coriander powder; salt; ginger-garlic paste'],
    ],
    steps: ['Soak the soya chunks in hot water for 10 minutes, then squeeze out the water.', 'Fry the onion in the oil until golden. Add ginger-garlic paste and the spices for 30 seconds.', 'Add the tomato and cook until soft and pulpy.', 'Add the chunks and 150 ml water. Simmer 8–10 minutes. Serve with rotli or rice (not counted).'],
  },
  {
    name: 'Paneer tikka',
    serving: '100 g paneer',
    tags: 'g',
    time: '30 min (includes marinating)',
    lines: [
      ['paneer', 100, '100 g', 'paneer, cut in cubes'],
      ['greekYoghurt', 50, '50 g', 'thick yoghurt'],
      ['oil', 5, '1 tsp', 'oil'],
      [null, 0, '1 tsp', 'tikka masala (or garam masala + chilli powder), ½ tsp ginger-garlic paste, salt, squeeze of lemon'],
    ],
    steps: ['Mix the yoghurt, spices and lemon. Coat the paneer and leave 20 minutes (or overnight in the fridge).', 'Heat the oil in a pan on medium-high, or use a grill or air fryer.', 'Cook 8–10 minutes, turning, until charred at the edges.'],
  },
  {
    name: 'Peanut butter toast',
    serving: '2 slices + 2 tbsp PB',
    tags: 'g',
    time: '3 min',
    lines: [
      ['bread', 76, '2 slices', 'wholegrain bread'],
      ['pb', 40, '2 tbsp', 'peanut butter'],
    ],
    steps: ['Toast the bread.', 'Spread the peanut butter on while it’s warm so it melts in.'],
  },
  {
    name: 'Glass of milk + PB toast',
    serving: '300 ml + 1 slice',
    tags: 'g',
    time: '3 min',
    lines: [
      ['milk', 300, '300 ml', 'full cream milk'],
      ['bread', 38, '1 slice', 'wholegrain bread'],
      ['pb', 20, '1 tbsp', 'peanut butter'],
    ],
    steps: ['Toast the bread and spread the peanut butter.', 'Pour the milk and have them together.'],
  },
  {
    name: 'Peanut butter sandwich',
    serving: '2 slices + 1 tbsp',
    tags: 'pg',
    time: '2 min',
    lines: [
      ['bread', 76, '2 slices', 'wholegrain bread'],
      ['pb', 20, '1 tbsp', 'peanut butter'],
    ],
    steps: ['Spread the peanut butter on one slice, top with the other and cut in half.', 'Add banana slices for about 50 more kcal (not counted).'],
  },
  {
    name: 'Cheese sandwich',
    serving: '1 sandwich',
    tags: 'p',
    time: '2 min',
    lines: [
      ['bread', 76, '2 slices', 'wholegrain bread'],
      ['cheeseSlice', 42, '2 slices', 'cheese'],
    ],
    steps: ['Layer the cheese between the bread. Add tomato or cucumber if you like.', 'Cut in half and wrap for your bag.'],
  },
  {
    name: 'Lentil bolognese',
    serving: '1 bowl',
    tags: 'g',
    time: '20 min',
    lines: [
      ['pasta', 75, '75 g', 'dry spaghetti'],
      ['lentils', 120, '120 g', 'cooked brown or green lentils (½ cup, tinned is fine)'],
      ['passata', 100, '100 g', 'tomato passata'],
      ['onion', 50, '½ small', 'onion, diced'],
      ['oil', 5, '1 tsp', 'oil'],
      ['cheddar', 10, '10 g', 'grated cheddar or parmesan'],
      [null, 0, 'to taste', '1 clove garlic, dried oregano, salt, pepper'],
    ],
    steps: ['Boil the spaghetti in salted water for 10 minutes.', 'Meanwhile fry the onion and garlic in the oil for 3 minutes.', 'Add the passata, lentils and oregano. Simmer 8 minutes.', 'Drain the pasta, toss through the sauce and top with the cheese.'],
  },
  {
    name: 'Thepla',
    serving: '1 thepla',
    tags: 'p',
    time: '15 min',
    lines: [
      ['atta', 25, '25 g', 'whole wheat flour (atta)'],
      ['besan', 5, '1 tsp', 'besan'],
      ['greens', 10, '10 g', 'chopped fresh methi (fenugreek) leaves'],
      ['yoghurt', 10, '2 tsp', 'yoghurt'],
      ['oil', 3, '½ tsp', 'oil (plus a few drops to cook)'],
      [null, 0, 'pinch', 'turmeric, chilli powder, ajwain, salt'],
    ],
    steps: ['Mix everything and add water bit by bit into a soft dough. Rest 10 minutes.', 'Roll out thin and cook on a hot tawa, 1–2 minutes each side, with a few drops of oil.', 'For a batch multiply by 6–8. They keep 2–3 days and pack well.'],
  },
  {
    name: 'Paneer bhurji',
    serving: '1 bowl (~150 g)',
    tags: 'g',
    time: '12 min',
    lines: [
      ['paneer', 100, '100 g', 'paneer, crumbled'],
      ['onion', 50, '½ small', 'onion, chopped'],
      ['tomato', 50, '1 small', 'tomato, chopped'],
      ['oil', 5, '1 tsp', 'oil'],
      [null, 0, '½ tsp each', 'turmeric, chilli, garam masala; salt; green chilli; coriander'],
    ],
    steps: ['Fry the onion in the oil until soft, then add the tomato and spices and cook 3 minutes.', 'Stir in the crumbled paneer and cook 3–4 minutes.', 'Finish with coriander. Eat with rotli, in a wrap or on toast (not counted).'],
  },
  {
    name: 'Paneer tikka wrap',
    serving: '1 wrap',
    tags: 'pg',
    time: '30 min (includes marinating)',
    lines: [
      ['tortilla', 60, '1', 'large tortilla wrap'],
      ['paneer', 80, '80 g', 'paneer, cut in strips'],
      ['greekYoghurt', 40, '40 g', 'thick yoghurt'],
      ['oil', 5, '1 tsp', 'oil'],
      ['onion', 30, '30 g', 'sliced onion'],
      [null, 0, '1 tsp', 'tikka masala, salt, lemon juice (mint chutney if you have it)'],
    ],
    steps: ['Mix the yoghurt and spices, coat the paneer and leave 20 minutes.', 'Fry in the oil for 6–8 minutes, turning, until charred.', 'Warm the wrap, add the paneer and onion, roll tightly and wrap in foil.'],
  },
  {
    name: 'Trail mix',
    serving: '50 g',
    tags: 'pg',
    time: '2 min',
    lines: [
      ['nuts', 30, '30 g', 'mixed nuts (almonds, cashews, peanuts)'],
      ['raisins', 20, '20 g', 'raisins'],
    ],
    steps: ['Mix in a small container. For a week’s worth, multiply by 7 and keep in a jar.'],
  },
  {
    name: 'Edamame',
    serving: '1 cup',
    tags: 'pg',
    time: '5 min',
    lines: [
      ['edamame', 150, '150 g', 'shelled edamame (frozen is fine)'],
      [null, 0, 'pinch', 'salt'],
    ],
    steps: ['Boil from frozen for 3–4 minutes, drain.', 'Season with salt. Good warm or cold from a container.'],
  },
  {
    name: 'Greek yoghurt, honey and nuts',
    serving: '1 bowl',
    tags: 'pg',
    time: '2 min',
    lines: [
      ['greekYoghurt', 170, '170 g', 'Greek yoghurt (1 tub)'],
      ['honey', 20, '1 tbsp', 'honey'],
      ['nuts', 30, '30 g', 'mixed nuts, roughly chopped'],
    ],
    steps: ['Spoon the yoghurt into a bowl or container.', 'Drizzle with the honey and sprinkle the nuts on top.'],
  },
  {
    name: 'Overnight oats',
    serving: '1 jar',
    tags: 'g',
    time: '5 min + overnight',
    lines: [
      ['oats', 50, '50 g', 'rolled oats (⅔ cup)'],
      ['milk', 150, '150 ml', 'full cream milk'],
      ['greekYoghurt', 100, '100 g', 'Greek yoghurt'],
      ['honey', 10, '2 tsp', 'honey'],
      ['banana', 118, '1', 'banana, sliced'],
    ],
    steps: ['The night before: stir the oats, milk, yoghurt and honey together in a jar.', 'Cover and leave in the fridge at least 4 hours.', 'Top with the sliced banana and eat cold.'],
  },
  {
    name: 'Peanut butter banana wrap',
    serving: '1 wrap',
    tags: 'pg',
    time: '3 min',
    lines: [
      ['tortilla', 60, '1', 'large tortilla wrap'],
      ['pb', 40, '2 tbsp', 'peanut butter'],
      ['banana', 118, '1', 'banana'],
    ],
    steps: ['Spread the peanut butter over the wrap, leaving a 2 cm border.', 'Place the banana along one edge and roll up tightly.', 'Cut in half. Wrap in baking paper for your bag.'],
  },
  {
    name: 'Cheese toastie',
    serving: '1 toastie',
    tags: 'pg',
    time: '8 min',
    lines: [
      ['bread', 76, '2 slices', 'wholegrain bread'],
      ['cheddar', 40, '40 g', 'grated cheddar'],
      ['butter', 5, '1 tsp', 'butter'],
    ],
    steps: ['Butter the outside of both slices and put the cheese between them.', 'Toast in a pan on medium heat or a sandwich press, 3–4 minutes each side, until golden.'],
  },
  {
    name: 'Masala egg toast',
    serving: '3 eggs + 2 slices',
    tags: 'g',
    time: '10 min',
    lines: [
      ['egg', 150, '3', 'eggs'],
      ['bread', 76, '2 slices', 'wholegrain bread'],
      ['butter', 5, '1 tsp', 'butter'],
      ['onion', 30, '30 g', 'finely chopped onion'],
      ['tomato', 30, '30 g', 'chopped tomato'],
      [null, 0, 'to taste', 'green chilli, turmeric, chilli powder, salt, coriander'],
    ],
    steps: ['Fry the onion in half the butter for 2 minutes, then add the tomato and spices.', 'Pour in the whisked eggs and stir gently 2 minutes for a soft scramble.', 'Butter the toast and pile the eggs on top.'],
  },
  {
    name: 'Besan pudla with paneer',
    serving: '2 pudla',
    tags: 'pg',
    time: '15 min',
    lines: [
      ['besan', 60, '60 g', 'besan (chickpea flour, ½ cup)'],
      ['onion', 30, '30 g', 'finely chopped onion'],
      ['paneer', 30, '30 g', 'crumbled paneer'],
      ['oil', 5, '1 tsp', 'oil'],
      [null, 0, 'pinch', 'ajwain, turmeric, chilli powder, salt, coriander; about 100 ml water'],
    ],
    steps: ['Whisk the besan, onion, spices and water into a pourable batter. Rest 5 minutes.', 'Pour half onto a hot oiled pan and spread thin. Cook 2 minutes each side. Repeat.', 'Sprinkle the paneer inside, fold and eat hot (or cold from a lunchbox).'],
  },
];

/** Macros for one serving, worked out from the ingredient amounts. */
export function recipeMacros(r: Recipe): Macros {
  const total = r.lines.reduce((sum, [k, g]) => {
    if (!k) return sum;
    const [kcal, protein, carbs, fat] = ING[k];
    return add(sum, scale({ kcal, protein, carbs, fat }, g / 100));
  }, ZERO);
  return roundMacros(total);
}

const BY_NAME = new Map(RECIPES.map((r) => [r.name.toLowerCase(), r]));

/** The recipe for a food (matched by name, so favourites and logged copies find it too). */
export const recipeFor = (f: { name: string }): Recipe | undefined => BY_NAME.get(f.name.toLowerCase());
