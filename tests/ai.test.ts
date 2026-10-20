import { afterEach, describe, expect, it, vi } from 'vitest';
import { attempts, complete, friendlyError, toGemini, type AiConfig, type Body } from '../src/lib/ai';

const cfg = (patch: Partial<AiConfig> = {}): AiConfig => ({ aiKey: 'ds', aiModel: 'deepseek-v4.1-flash:free', geminiKey: 'gm', geminiModel: 'gemini-flash-latest', aiFirst: 'deepseek', ...patch });
const body: Body = { messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }], json: true };

const ok = (url: string) =>
  url.includes('googleapis')
    ? { candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: 'from gemini' }] } }] }
    : { choices: [{ message: { content: 'from deepseek' } }] };

/** fetch that answers each URL with the next status in its list (200 = a normal reply). */
function fakeFetch(statuses: { ds?: number[]; gm?: number[] }) {
  const calls: string[] = [];
  const f = vi.fn(async (url: string, init: { body: string }) => {
    const who = url.includes('googleapis') ? 'gm' : 'ds';
    calls.push(`${who}:${who === 'gm' ? url.split('/models/')[1].split(':')[0] : JSON.parse(init.body).model}`);
    const status = statuses[who]?.shift() ?? 200;
    return { ok: status === 200, status, json: async () => (status === 200 ? ok(url) : { error: { message: status === 429 ? 'Rate limit reached' : 'nope' } }) };
  });
  vi.stubGlobal('fetch', f);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('ai providers', () => {
  it('orders the attempts by the first choice, with Gemini Flash-Lite as an extra try', () => {
    expect(attempts(cfg()).map((a) => `${a.provider}:${a.model}`)).toEqual(['deepseek:deepseek-v4.1-flash:free', 'gemini:gemini-flash-latest', 'gemini:gemini-flash-lite-latest']);
    expect(attempts(cfg({ aiFirst: 'gemini' }))[0].provider).toBe('gemini');
    expect(attempts(cfg({ aiKey: '' })).every((a) => a.provider === 'gemini')).toBe(true);
    expect(attempts(cfg({ aiKey: ' ', geminiKey: '' }))).toEqual([]);
  });

  it('uses DeepSeek while it works', async () => {
    const calls = fakeFetch({});
    expect(await complete(cfg(), body)).toEqual(['from deepseek', 'deepseek-v4.1-flash:free']);
    expect(calls).toEqual(['ds:deepseek-v4.1-flash:free']);
  });

  it('switches to Gemini when DeepSeek hits its limit, skipping Gemini’s thinking', async () => {
    const calls = fakeFetch({ ds: [429] });
    expect(await complete(cfg(), body)).toEqual(['from gemini', 'gemini-flash-latest']);
    expect(calls).toEqual(['ds:deepseek-v4.1-flash:free', 'gm:gemini-flash-latest']);
  });

  it('a rejected Gemini key goes straight to DeepSeek, not to Flash-Lite', async () => {
    const calls = fakeFetch({ gm: [401] });
    expect((await complete(cfg({ aiFirst: 'gemini' }), body))[0]).toBe('from deepseek');
    expect(calls).toEqual(['gm:gemini-flash-latest', 'ds:deepseek-v4.1-flash:free']);
  });

  it('when everything is used up, says so and names both', async () => {
    fakeFetch({ ds: [429], gm: [429, 429] });
    const e = await complete(cfg(), body).catch((x) => x);
    expect(friendlyError(e)).toMatch(/Both DeepSeek and Gemini/);
  });

  it('with only one key, the limit message points to the other as a backup', async () => {
    fakeFetch({ ds: [429] });
    const e = await complete(cfg({ geminiKey: '' }), body).catch((x) => x);
    expect(friendlyError(e)).toMatch(/DeepSeek has hit the limit.*Gemini key/);
  });

  it('turns a chat request into Gemini’s format', () => {
    const g = toGemini({
      messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }, { type: 'text', text: 'what is this' }] },
        { role: 'assistant', content: 'a dal' },
      ],
      json: true,
    });
    expect(g.system_instruction).toEqual({ parts: [{ text: 'rules' }] });
    expect(g.contents[0]).toEqual({ role: 'user', parts: [{ inline_data: { mime_type: 'image/png', data: 'AAAA' } }, { text: 'what is this' }] });
    expect(g.contents[1].role).toBe('model');
    expect(g.generationConfig?.responseMimeType).toBe('application/json');
  });
});
