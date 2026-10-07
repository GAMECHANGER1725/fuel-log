// Open Food Facts: free, open product database. No key needed.
// Barcode lookups use the world database; text search uses the Australian one.

import type { Food, Macros } from './types';
import { forGrams, r1 } from './nutrition';

const FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments';

export const isValidBarcode = (code: string) => /^\d{8,14}$/.test(code.trim());

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};

function readMacros(n: Record<string, unknown>, suffix: '_100g' | '_serving'): Macros | null {
  let kcal = num(n[`energy-kcal${suffix}`]);
  if (kcal === null) {
    const kj = num(n[`energy-kj${suffix}`]) ?? num(n[`energy${suffix}`]); // plain "energy" is kJ
    if (kj !== null) kcal = kj / 4.184;
  }
  const protein = num(n[`proteins${suffix}`]);
  const carbs = num(n[`carbohydrates${suffix}`]);
  const fat = num(n[`fat${suffix}`]);
  if (kcal === null || protein === null) return null;
  return { kcal: Math.round(kcal), protein: r1(protein), carbs: r1(carbs ?? 0), fat: r1(fat ?? 0) };
}

/** Turn one OFF product object into a Food, or null if it has no usable nutrition. */
export function productToFood(p: Record<string, unknown>, barcode?: string): Food | null {
  const n = (typeof p.nutriments === 'object' && p.nutriments ? p.nutriments : {}) as Record<string, unknown>;
  const name = String(p.product_name_en || p.product_name || '').trim();
  if (!name) return null;
  const brand = String(p.brands || '').split(',')[0].trim();
  const fullName = brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name;
  const per100 = readMacros(n, '_100g');
  const servingGrams = num(p.serving_quantity) || undefined;
  let perServing = readMacros(n, '_serving');
  if (!perServing && per100 && servingGrams) perServing = forGrams(per100, servingGrams);
  const base = perServing ?? per100;
  if (!base) return null;
  const code = barcode ?? String(p.code ?? '');
  return {
    id: `off-${code || fullName}`,
    name: fullName,
    serving: perServing ? String(p.serving_size || `${servingGrams} g`).trim() : '100 g',
    ...base,
    per100: per100 ?? undefined,
    servingGrams: perServing ? servingGrams : 100,
    barcode: code || undefined,
  };
}

export function parseProduct(json: unknown, barcode: string): Food | null {
  const body = json as { status?: number; product?: Record<string, unknown> } | null;
  if (!body || body.status !== 1 || !body.product) return null;
  return productToFood(body.product, barcode);
}

export type LookupResult = { ok: true; food: Food } | { ok: false; reason: 'not-found' | 'offline' | 'error' };

export async function lookupBarcode(barcode: string, signal?: AbortSignal): Promise<LookupResult> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
      { signal },
    );
    if (res.status === 404) return { ok: false, reason: 'not-found' };
    if (!res.ok) return { ok: false, reason: 'error' };
    const food = parseProduct(await res.json(), barcode);
    return food ? { ok: true, food } : { ok: false, reason: 'not-found' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { ok: false, reason: navigator.onLine === false ? 'offline' : 'error' };
  }
}

/** Text search of Australian products. OFF rate-limits search, so one failure gets one retry. */
export async function searchProducts(query: string, signal?: AbortSignal): Promise<Food[]> {
  const url =
    `https://au.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&page_size=15` +
    `&search_terms=${encodeURIComponent(query)}&fields=${FIELDS}`;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(url, { signal });
  }
  if (!res.ok) throw new Error(`OFF ${res.status}`);
  const body = (await res.json()) as { products?: Record<string, unknown>[] };
  return (body.products ?? []).map((p) => productToFood(p)).filter((f): f is Food => !!f);
}
