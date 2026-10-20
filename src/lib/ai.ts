// AI food logging with two providers, each with the user's own key:
//   DeepSeek V4.1 Flash through TokenHarbor (OpenAI-style chat API, free model)
//   Google Gemini (its own generateContent API)
// Whichever is first in Profile is tried first; when it hits its limit, is busy or rejects the key,
// the same request goes to the other one, so one running out doesn't stop logging.
// Three modes share one reply format:
//   photo: estimate a meal from one or more photos
//   label: read a nutrition information panel (one or more photos of the pack)
//   text:  "2 rotli, dal and a glass of milk"
// Requests go straight from the phone to the provider.
// DeepSeek thinks step by step before answering (its default mode), which is what makes the estimates add up.
// Results are estimates and always go through a review sheet before logging.

export type Provider = 'deepseek' | 'gemini';
export const PROVIDER_NAME: Record<Provider, string> = { deepseek: 'DeepSeek', gemini: 'Gemini' };

export const AI_MODELS = [{ id: 'deepseek-v4.1-flash:free', label: 'DeepSeek V4.1 Flash', hint: 'Free on TokenHarbor, reads photos' }];
export const DEFAULT_MODEL = AI_MODELS[0].id;
export const GEMINI_MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)', hint: 'Best balance, always up to date' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite', hint: 'Faster, more free uses' },
];
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0].id;
const GEMINI_LITE = 'gemini-flash-lite-latest';
const API = 'https://tokenharbor.ai/v1/chat/completions';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** The AI settings every call needs (Settings has all of these). */
export interface AiConfig {
  aiKey: string;
  aiModel: string;
  geminiKey: string;
  geminiModel: string;
  aiFirst: Provider;
}

/** Just the AI fields, e.g. to keep them through a reset. */
export const aiOf = ({ aiKey, aiModel, geminiKey, geminiModel, aiFirst }: AiConfig): AiConfig => ({ aiKey, aiModel, geminiKey, geminiModel, aiFirst });

export const hasAi = (c: Pick<AiConfig, 'aiKey' | 'geminiKey'>) => !!(c.aiKey.trim() || c.geminiKey.trim());

export interface Attempt {
  provider: Provider;
  key: string;
  model: string;
}

/** The order to try: the first provider, then the other; Gemini also gets one go on Flash-Lite, which has more free uses. */
export function attempts(c: AiConfig): Attempt[] {
  const ds: Attempt[] = c.aiKey.trim() ? [{ provider: 'deepseek', key: c.aiKey.trim(), model: c.aiModel || DEFAULT_MODEL }] : [];
  const gm = c.geminiModel || DEFAULT_GEMINI_MODEL;
  const ge: Attempt[] = c.geminiKey.trim()
    ? [{ provider: 'gemini', key: c.geminiKey.trim(), model: gm }, ...(gm === GEMINI_LITE ? [] : [{ provider: 'gemini' as const, key: c.geminiKey.trim(), model: GEMINI_LITE }])]
    : [];
  return c.aiFirst === 'gemini' ? [...ge, ...ds] : [...ds, ...ge];
}

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
/** A chat request without the model, which `complete` adds. `json` asks for a JSON-only reply where the provider supports it. */
export interface Body {
  messages: Msg[];
  json?: boolean;
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
    json: true,
  };
}

/** The same request in Gemini's generateContent format: system text becomes the system instruction, images inline data. */
export function toGemini(body: Body) {
  const parts = (content: string | Part[]) =>
    typeof content === 'string'
      ? [{ text: content }]
      : content.map((p) => {
          if (p.type === 'text') return { text: p.text };
          const m = /^data:([^;]+);base64,(.*)$/.exec(p.image_url.url);
          return { inline_data: { mime_type: m?.[1] ?? 'image/jpeg', data: m?.[2] ?? '' } };
        });
  const system = body.messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n');
  return {
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
    contents: body.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: parts(m.content) })),
    ...(body.json ? { generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } } : {}),
  };
}

/** The answer text from a Gemini reply, without its thinking parts. */
export function extractGeminiText(json: unknown): string {
  const ps = (json as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })?.candidates?.[0]?.content?.parts;
  return Array.isArray(ps) ? ps.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('').trim() : '';
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
    /** Every provider that was tried, in order (set by `complete`). */
    public tried: Provider[] = [],
  ) {
    super(message);
  }
}

export function errorFromResponse(status: number, body: unknown): AiError {
  const err = (Array.isArray(body) ? body[0] : body) as { error?: { message?: string; code?: string; status?: string } } | null;
  const message = err?.error?.message ?? `HTTP ${status}`;
  // 402 / "insufficient balance" is how a used-up free allowance can come back.
  if (status === 429 || status === 402 || err?.error?.status === 'RESOURCE_EXHAUSTED' || /quota|rate.?limit|insufficient (balance|credit)/i.test(message))
    return new AiError('rate-limit', message);
  if (status >= 500) return new AiError('busy', message);
  if (status === 401 || status === 403 || /api key/i.test(message)) return new AiError('bad-key', message);
  return new AiError('error', message);
}

/** Errors worth trying the other provider for: the next one may well work. */
const switchable = (e: unknown) => e instanceof AiError && (e.kind === 'rate-limit' || e.kind === 'busy' || e.kind === 'bad-key' || e.kind === 'error');

const names = (ps: Provider[]) => [...new Set(ps)].map((p) => PROVIDER_NAME[p]).join(' and ');

/** A message for the user. `backup` adds where to put the other key when only one provider was tried. */
export function friendlyError(e: unknown, backup = true): string {
  const kind = e instanceof AiError ? e.kind : 'error';
  const tried = e instanceof AiError ? [...new Set(e.tried)] : [];
  const who = tried.length ? names(tried) : 'The AI';
  // With only one key, say where the backup goes.
  const tip = backup && tried.length === 1 ? ` Add a ${tried[0] === 'deepseek' ? 'Gemini' : 'TokenHarbor'} key in Profile → AI as a backup.` : '';
  switch (kind) {
    case 'no-key': return 'Add a TokenHarbor (DeepSeek) or Gemini API key in Profile → AI first.';
    case 'bad-key': return `${tried.length ? PROVIDER_NAME[tried[tried.length - 1]] : 'The AI'} didn’t accept your API key. Check it in Profile → AI.${tip}`;
    case 'rate-limit': return `${tried.length > 1 ? `Both ${who} have` : `${who} has`} hit the limit for now. Try again later.${tip}`;
    case 'busy': return `${who} ${tried.length > 1 ? 'are' : 'is'} busy right now. Try again in a moment.${tip}`;
    case 'offline': return 'You’re offline. AI features need the internet.';
    case 'blocked': return 'The AI couldn’t read that. Try a clearer photo.';
    case 'bad-reply': return 'The AI’s answer didn’t make sense. Try again.';
    default: return `Something went wrong${e instanceof Error && e.message ? `: ${e.message}` : ''}.`;
  }
}

async function post(url: string, headers: Record<string, string>, payload: unknown, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload), signal });
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
  return res.json();
}

/** One request to one provider. Returns the answer text. */
export async function call(a: Attempt, body: Body, signal?: AbortSignal): Promise<string> {
  const text =
    a.provider === 'gemini'
      ? extractGeminiText(await post(`${GEMINI_API}/${encodeURIComponent(a.model)}:generateContent`, { 'x-goog-api-key': a.key }, toGemini(body), signal))
      : extractText(await post(API, { Authorization: `Bearer ${a.key}` }, { model: a.model, messages: body.messages }, signal));
  if (!text) throw new AiError('blocked', 'Empty reply');
  return text;
}

/** One chat request, moving on to the next provider when one is out of uses. Returns [answer text, model used]. */
export async function complete(cfg: AiConfig, body: Body, signal?: AbortSignal): Promise<[string, string]> {
  const list = attempts(cfg);
  if (!list.length) throw new AiError('no-key', 'No key');
  const tried: Provider[] = [];
  const badKey = new Set<Provider>();
  let last: unknown;
  for (const a of list) {
    // A rejected Gemini key won't work on Flash-Lite either.
    if (badKey.has(a.provider)) continue;
    tried.push(a.provider);
    try {
      return [await call(a, body, signal), a.model];
    } catch (e) {
      last = e;
      if (!switchable(e)) break;
      if ((e as AiError).kind === 'bad-key') badKey.add(a.provider);
    }
  }
  if (last instanceof AiError) last.tried = tried;
  throw last;
}

export async function analyse(opts: {
  cfg: AiConfig;
  mode: AiMode;
  text?: string;
  images?: AiImage[];
  signal?: AbortSignal;
}): Promise<AiResult> {
  const [text, model] = await complete(opts.cfg, buildBody(opts.mode, opts), opts.signal);
  try {
    return parseReply(text, model);
  } catch {
    throw new AiError('bad-reply', 'Unreadable reply');
  }
}

/** Check one provider's key on its own, without falling back to the other. */
export async function testKey(provider: Provider, key: string, model: string): Promise<void> {
  if (!key.trim()) throw new AiError('no-key', 'No key', [provider]);
  try {
    await call({ provider, key: key.trim(), model }, { messages: [{ role: 'user', content: 'Reply with OK.' }] });
  } catch (e) {
    // An accepted request with an empty reply still proves the key works.
    if (e instanceof AiError && e.kind === 'blocked') return;
    if (e instanceof AiError) e.tried = [provider];
    throw e;
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
