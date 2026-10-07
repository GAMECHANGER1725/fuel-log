// AI food logging with Google Gemini. Three modes share one reply format:
//   photo: estimate a plate of food
//   label: read a nutrition information panel
//   text:  "2 rotli, dal and a glass of milk"
// The request goes straight from the phone to Google with the user's own key.
// Results are estimates and always go through a review sheet before logging.

export const GEMINI_MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)', hint: 'Best balance, always up to date' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'Pinned version' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite', hint: 'Faster, more free uses' },
];
export const DEFAULT_MODEL = GEMINI_MODELS[0].id;
const FALLBACK_MODEL = 'gemini-flash-lite-latest';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

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

export const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          portion: { type: 'string', description: 'Amount with grams, e.g. "3 rotli (~120 g)".' },
          kcal: { type: 'number', description: 'kilocalories (not kJ)' },
          protein: { type: 'number', description: 'grams' },
          carbs: { type: 'number', description: 'grams' },
          fat: { type: 'number', description: 'grams' },
        },
        required: ['name', 'portion', 'kcal', 'protein', 'carbs', 'fat'],
      },
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    notes: { type: 'string', description: 'One or two short sentences.' },
  },
  required: ['items', 'confidence', 'notes'],
} as const;

const BASE = [
  'You estimate nutrition for a teenager in Australia who is trying to gain weight healthily.',
  'They eat all kinds of food, often Gujarati/Indian home cooking (rotli, dal, shaak, thepla, rice, kadhi) as well as Australian food.',
  'Always give energy in kcal, never kJ. Be realistic, not optimistic, and include typical cooking oil or ghee.',
];

export const PROMPTS: Record<AiMode, string> = {
  photo: [
    ...BASE,
    'List each distinct food visible in the photo as its own item with an estimated portion (with grams) and its macros for that portion.',
    'Never invent foods you cannot see. If the image is not food, return no items and say so in notes.',
  ].join(' '),
  label: [
    ...BASE,
    'The photo shows a nutrition information panel or packaging. Read it exactly.',
    'Return ONE item for ONE serving as printed (use the serving size as the portion, e.g. "1 bar (40 g)").',
    'If only per-100 g values are visible, use 100 g as the portion. Convert kJ to kcal by dividing by 4.184.',
    'Use the product name from the pack if visible. Put the per-100 g values in notes. If you cannot read a panel, return no items.',
  ].join(' '),
  text: [
    ...BASE,
    'The user describes what they ate. Split it into separate foods with sensible portions (with grams) and macros.',
    'If an amount is missing, assume a typical teenage portion and say so in notes.',
  ].join(' '),
};

export function buildBody(mode: AiMode, input: { text?: string; imageBase64?: string; mimeType?: string }) {
  const parts: unknown[] = [];
  if (mode === 'text') parts.push({ text: `What I ate: ${input.text ?? ''}` });
  else {
    if (input.text?.trim()) parts.push({ text: `Extra details: ${input.text.trim()}` });
    parts.push({ text: mode === 'label' ? 'Read this nutrition label.' : 'Estimate the nutrition of this meal.' });
    parts.push({ inline_data: { mime_type: input.mimeType ?? 'image/jpeg', data: input.imageBase64 ?? '' } });
  }
  return {
    system_instruction: { parts: [{ text: PROMPTS[mode] }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA, temperature: 0.2 },
  };
}

export function extractText(json: unknown): string {
  const parts = (json as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })
    ?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('').trim() : '';
}

const clamp = (v: unknown, max: number) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Parse and sanity-check the model's JSON. Throws if unusable. */
export function parseReply(text: string, model: string): AiResult {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const raw = JSON.parse(cleaned) as Record<string, unknown>;
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
  const err = (Array.isArray(body) ? body[0] : body) as { error?: { message?: string; status?: string } } | null;
  const message = err?.error?.message ?? `HTTP ${status}`;
  if (status === 429 || err?.error?.status === 'RESOURCE_EXHAUSTED') return new AiError('rate-limit', message);
  if (status >= 500) return new AiError('busy', message);
  if (status === 400 && /api key/i.test(message)) return new AiError('bad-key', message);
  if (status === 401 || status === 403) return new AiError('bad-key', message);
  return new AiError('error', message);
}

export function friendlyError(e: unknown): string {
  const kind = e instanceof AiError ? e.kind : 'error';
  switch (kind) {
    case 'no-key': return 'Add your Gemini API key in Profile → AI food scanner first.';
    case 'bad-key': return 'Gemini didn’t accept your API key. Check it in Profile.';
    case 'rate-limit': return 'You’ve hit Gemini’s free limit for now. Try again in a minute.';
    case 'busy': return 'Gemini is busy right now. Try again in a moment.';
    case 'offline': return 'You’re offline. AI logging needs the internet.';
    case 'blocked': return 'Gemini couldn’t read that. Try a clearer photo.';
    case 'bad-reply': return 'Gemini’s answer didn’t make sense. Try again.';
    default: return `Something went wrong${e instanceof Error && e.message ? `: ${e.message}` : ''}.`;
  }
}

async function call(key: string, model: string, body: unknown, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
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
  return text;
}

/** One request, retried once on Flash-Lite if the chosen model is rate-limited or busy. Returns [text, model used]. */
async function callWithFallback(key: string, model: string, body: unknown, signal?: AbortSignal): Promise<[string, string]> {
  try {
    return [await call(key, model, body, signal), model];
  } catch (e) {
    if (!(e instanceof AiError && (e.kind === 'rate-limit' || e.kind === 'busy')) || model === FALLBACK_MODEL) throw e;
    return [await call(key, FALLBACK_MODEL, body, signal), FALLBACK_MODEL];
  }
}

export async function analyse(opts: {
  key: string;
  model: string;
  mode: AiMode;
  text?: string;
  imageBase64?: string;
  mimeType?: string;
  signal?: AbortSignal;
}): Promise<AiResult> {
  if (!opts.key.trim()) throw new AiError('no-key', 'No key');
  const [text, model] = await callWithFallback(opts.key.trim(), opts.model || DEFAULT_MODEL, buildBody(opts.mode, opts), opts.signal);
  try {
    return parseReply(text, model);
  } catch {
    throw new AiError('bad-reply', 'Unreadable reply');
  }
}

export async function testKey(key: string, model: string): Promise<void> {
  if (!key.trim()) throw new AiError('no-key', 'No key');
  try {
    await callWithFallback(key.trim(), model, { contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }] });
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
