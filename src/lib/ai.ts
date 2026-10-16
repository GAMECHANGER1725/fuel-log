// AI food logging with DeepSeek V4.1 Flash through TokenHarbor (OpenAI-style chat API, free model).
// Three modes share one reply format:
//   photo: estimate a meal from one or more photos
//   label: read a nutrition information panel (one or more photos of the pack)
//   text:  "2 rotli, dal and a glass of milk"
// The request goes straight from the phone to TokenHarbor with the user's own key.
// DeepSeek thinks step by step before answering (its default mode), which is what makes the estimates add up.
// Results are estimates and always go through a review sheet before logging.

export const AI_MODELS = [{ id: 'deepseek-v4.1-flash:free', label: 'DeepSeek V4.1 Flash', hint: 'Free on TokenHarbor, reads photos' }];
export const DEFAULT_MODEL = AI_MODELS[0].id;
const API = 'https://tokenharbor.ai/v1/chat/completions';

export type AiMode = 'photo' | 'label' | 'text';

export interface AiItem {
  name: string;
  portion: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface AiResult {
  items: AiItem[];
  confidence: 'low' | 'medium' | 'high';
  notes: string;
  model: string;
}

export type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export interface Msg {
  role: 'system' | 'user' | 'assistant';
  content: string | Part[];
}
/** A chat request without the model, which `complete` adds. */
export interface Body {
  messages: Msg[];
}

export const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          portion: { type: 'string', description: 'Amount with grams, e.g. "3 rotli (~120 g)" or "8 slices (large, ~560 g)".' },
          kcal: { type: 'number', description: 'kilocalories (not kJ) for the whole portion' },
          protein: { type: 'number', description: 'grams' },
          carbs: { type: 'number', description: 'grams' },
          fat: { type: 'number', description: 'grams' },
        },
        required: ['name', 'portion', 'kcal', 'protein', 'carbs', 'fat'],
      },
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    notes: { type: 'string', description: 'One or two short sentences: the main assumption, e.g. the per-slice figure used.' },
  },
  required: ['items', 'confidence', 'notes'],
} as const;

/** The model has no schema mode here, so the schema goes in the prompt and the reply is parsed leniently. */
export const jsonRule = (schema: object) => `Reply with ONLY one JSON object, no other text and no code fences, matching this JSON Schema:\n${JSON.stringify(schema)}`;

const BASE = [
  'You estimate nutrition for a teenager in Australia who is trying to gain weight healthily.',
  'They are vegetarian but eat eggs and dairy: no meat, fish or seafood. If a dish could contain meat, assume the vegetarian version (e.g. veggie burger, paneer instead of chicken).',
  'They often eat Gujarati/Indian home cooking (rotli, dal, shaak, thepla, rice, kadhi) as well as Australian food.',
  'Always give energy in kcal, never kJ (kJ / 4.184 = kcal).',
  'Be ACCURATE, not cautious: never pad numbers up or down "to be safe".',
  'Home cooking: include the typical oil or ghee. Restaurant, takeaway and packaged food (Domino\'s, Pizza Hut, McDonald\'s, Hungry Jack\'s, Subway, Guzman y Gomez, supermarket products): use the brand\'s published Australian nutrition figures when you know them. Those already include the oil, cheese and sauce, so add nothing on top.',
  'Method, before you answer: (1) name each food and its size or variant; (2) for food eaten in pieces (pizza slices, rotli, dumplings, biscuits, nuggets) work out ONE piece in grams and kcal, then multiply by the count; (3) otherwise estimate grams and use per-100 g values; (4) sanity-check every total against reference points.',
  'Reference points: a Domino\'s Australia pizza slice is about 70-75 g and 150-170 kcal for most vegetarian pizzas on classic crust, so a whole 8-slice large is about 1,200-1,400 kcal (thin crust less, deep pan or extra cheese more). A medium plain rotli is about 80 kcal (+35 with a tsp of ghee). A cup of cooked rice is about 200 kcal. 250 ml of full cream milk is about 165 kcal.',
  'confidence: high only when you are using a brand\'s published figures or a printed label; medium for a clear, standard food and portion; low when the portion or recipe is a guess.',
];

export const PROMPTS: Record<AiMode, string> = {
  photo: [
    ...BASE,
    'You may get several photos of ONE meal. They can be different angles of the same plate, close-ups, or separate dishes and drinks eaten together.',
    'First work out which foods appear in more than one photo and count each real food ONCE. Use the other angles to judge portion size better (depth of the bowl, how many rotli are stacked, glass size); never add the same dish twice because it shows up twice.',
    'List each distinct food as its own item with an estimated portion (with grams or ml) and its macros for that portion.',
    'If a photo clearly shows leftovers after eating (a half-empty plate or glass), count only what was eaten.',
    'Never invent foods you cannot see. If no photo shows food, return no items and say so in notes. If you counted something only once on purpose because it appeared in several photos, say so briefly in notes.',
  ].join(' '),
  label: [
    ...BASE,
    'The photos show a nutrition information panel or packaging. There may be several photos, e.g. the front of the pack and the panel on the back. Read the panel exactly.',
    'Return ONE item per distinct product, for ONE serving as printed (use the serving size as the portion, e.g. "1 bar (40 g)"). Photos of the same product are one item.',
    'If only per-100 g values are visible, use 100 g as the portion. Convert kJ to kcal by dividing by 4.184.',
    'Use the product name from the pack if visible. Put the per-100 g values in notes. If you cannot read a panel, return no items.',
  ].join(' '),
  text: [
    ...BASE,
    'The user describes what they ate. Split it into separate foods with sensible portions (with grams) and macros. A whole named dish (e.g. "a large Domino\'s peppy paneer pizza") is ONE item with the count in the portion.',
    'If an amount is missing, assume a typical teenage portion and say so in notes.',
  ].join(' '),
};

export interface AiImage {
  base64: string;
  mimeType: string;
}

/** Most photos sent in one request. */
export const MAX_PHOTOS = 6;

export function buildBody(mode: AiMode, input: { text?: string; images?: AiImage[] }): Body {
  const parts: Part[] = [];
  if (mode === 'text') parts.push({ type: 'text', text: `What I ate: ${input.text ?? ''}` });
  else {
    const images = (input.images ?? []).slice(0, MAX_PHOTOS);
    const n = images.length;
    // Photos first, then the question: the model reads all of them before it starts answering.
    images.forEach((img, i) => {
      if (n > 1) parts.push({ type: 'text', text: `Photo ${i + 1}:` });
      parts.push({ type: 'image_url', image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` } });
    });
    if (input.text?.trim()) parts.push({ type: 'text', text: `Extra details from me (these override what the photos suggest): ${input.text.trim()}` });
    parts.push({
      type: 'text',
      text:
        mode === 'label'
          ? n > 1 ? `Read this nutrition label from the ${n} photos above.` : 'Read this nutrition label.'
          : n > 1 ? `Estimate the nutrition of this meal from the ${n} photos above. Don't count a food twice.` : 'Estimate the nutrition of this meal.',
    });
  }
  return {
    messages: [
      { role: 'system', content: `${PROMPTS[mode]}\n\n${jsonRule(SCHEMA)}` },
      { role: 'user', content: parts },
    ],
  };
}

/** The answer text from a chat completion (the model's thinking comes separately and is ignored). */
export function extractText(json: unknown): string {
  const c = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c.trim();
  return Array.isArray(c) ? c.map((p: { text?: unknown }) => (typeof p?.text === 'string' ? p.text : '')).join('').trim() : '';
}

/** The JSON object in a reply, even with code fences or a sentence around it. Throws if there is none. */
export function parseJson(text: string): unknown {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No JSON');
  return JSON.parse(text.slice(a, b + 1));
}

const clamp = (v: unknown, max: number) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Parse and sanity-check the model's JSON. Throws if unusable. */
export function parseReply(text: string, model: string): AiResult {
  const raw = parseJson(text) as Record<string, unknown>;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({
      name: String(i.name ?? '').trim().slice(0, 60) || 'Food',
      portion: String(i.portion ?? '').trim().slice(0, 60),
      kcal: Math.round(clamp(i.kcal, 3000)),
      protein: r1(clamp(i.protein, 300)),
      carbs: r1(clamp(i.carbs, 500)),
      fat: r1(clamp(i.fat, 300)),
    }))
    .slice(0, 12);
  const c = raw.confidence;
  return {
    items,
    confidence: c === 'high' || c === 'medium' ? c : 'low',
    notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 400) : '',
    model,
  };
}

export type AiErrorKind = 'no-key' | 'bad-key' | 'rate-limit' | 'busy' | 'offline' | 'blocked' | 'bad-reply' | 'error';

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export function errorFromResponse(status: number, body: unknown): AiError {
  const err = (Array.isArray(body) ? body[0] : body) as { error?: { message?: string; code?: string } } | null;
  const message = err?.error?.message ?? `HTTP ${status}`;
  if (status === 429) return new AiError('rate-limit', message);
  if (status >= 500) return new AiError('busy', message);
  if (status === 401 || status === 403 || /api key/i.test(message)) return new AiError('bad-key', message);
  return new AiError('error', message);
}

export function friendlyError(e: unknown): string {
  const kind = e instanceof AiError ? e.kind : 'error';
  switch (kind) {
    case 'no-key': return 'Add your TokenHarbor API key in Profile → AI first.';
    case 'bad-key': return 'TokenHarbor didn’t accept your API key. Check it in Profile.';
    case 'rate-limit': return 'Too many requests for now. Try again in a minute.';
    case 'busy': return 'The AI is busy right now. Try again in a moment.';
    case 'offline': return 'You’re offline. AI features need the internet.';
    case 'blocked': return 'The AI couldn’t read that. Try a clearer photo.';
    case 'bad-reply': return 'The AI’s answer didn’t make sense. Try again.';
    default: return `Something went wrong${e instanceof Error && e.message ? `: ${e.message}` : ''}.`;
  }
}

/** One chat request. Returns [answer text, model used]. */
export async function complete(key: string, model: string, body: Body, signal?: AbortSignal): Promise<[string, string]> {
  if (!key.trim()) throw new AiError('no-key', 'No key');
  const m = model || DEFAULT_MODEL;
  let res: Response;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.trim()}` },
      body: JSON.stringify({ model: m, ...body }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError(navigator.onLine === false ? 'offline' : 'error', 'Network error');
  }
  if (!res.ok) {
    let b: unknown = null;
    try {
      b = await res.json();
    } catch {
      /* not JSON */
    }
    throw errorFromResponse(res.status, b);
  }
  const text = extractText(await res.json());
  if (!text) throw new AiError('blocked', 'Empty reply');
  return [text, m];
}

export async function analyse(opts: {
  key: string;
  model: string;
  mode: AiMode;
  text?: string;
  images?: AiImage[];
  signal?: AbortSignal;
}): Promise<AiResult> {
  const [text, model] = await complete(opts.key, opts.model, buildBody(opts.mode, opts), opts.signal);
  try {
    return parseReply(text, model);
  } catch {
    throw new AiError('bad-reply', 'Unreadable reply');
  }
}

export async function testKey(key: string, model: string): Promise<void> {
  try {
    await complete(key, model, { messages: [{ role: 'user', content: 'Reply with OK.' }] });
  } catch (e) {
    // An accepted request with an empty reply still proves the key works.
    if (!(e instanceof AiError && e.kind === 'blocked')) throw e;
  }
}

/** Shrink a photo to max 1024 px JPEG before sending (faster, fewer tokens). */
export async function fileToJpeg(file: File, max = 1024): Promise<{ base64: string; mimeType: string; url: string }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.82);
  return { base64: url.split(',')[1], mimeType: 'image/jpeg', url };
}
