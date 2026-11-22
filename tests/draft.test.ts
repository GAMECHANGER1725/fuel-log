import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

import { cleanDraft, DRAFT_TTL, fitImages, hasSheetDraft, imgUrl, isEmptyAi, isEmptyManual, stripImages, useDraft, type AiDraft } from '../src/lib/draft';

const img = (n: number) => ({ base64: 'A'.repeat(n), mimeType: 'image/jpeg' });
const ai = (patch: Partial<AiDraft> = {}): AiDraft => ({ text: '', imgs: [], result: null, rows: [], ...patch });
const NOW = 1_800_000_000_000;

describe('add-food drafts', () => {
  beforeEach(() => useDraft.getState().clear());

  it('knows what is worth keeping', () => {
    expect(isEmptyAi(ai())).toBe(true);
    expect(isEmptyAi(ai({ text: '  ' }))).toBe(true);
    expect(isEmptyAi(ai({ text: 'dal' }))).toBe(false);
    expect(isEmptyAi(ai({ imgs: [img(5)] }))).toBe(false);
    const blank = { name: '', serving: '', energy: '', protein: '', carbs: '', fat: '', fav: true };
    expect(isEmptyManual(blank)).toBe(true); // the favourite tick alone isn't a draft
    expect(isEmptyManual({ ...blank, energy: '300' })).toBe(false);
  });

  it('keeps as many photos as fit, in order', () => {
    expect(fitImages([img(400), img(400), img(400)], 1000)).toHaveLength(2);
    expect(fitImages([img(2000), img(10)], 1000)).toEqual([]); // later photos never jump the queue
    expect(imgUrl({ base64: 'QQ==', mimeType: 'image/png' })).toBe('data:image/png;base64,QQ==');
  });

  it('saves, lists and clears sheet drafts and the search text', () => {
    const d = useDraft.getState();
    d.setQ('poha');
    d.setAi('photo', ai({ imgs: [img(10)] }));
    d.setAi('text', ai({ text: '3 rotli and dal' }));
    expect(hasSheetDraft(useDraft.getState())).toBe(true);
    d.setAi('photo', null);
    d.setAi('text', ai()); // emptied by hand: the draft goes away
    expect(hasSheetDraft(useDraft.getState())).toBe(false);
    expect(useDraft.getState().q).toBe('poha');
    d.setManual({ name: 'x', serving: '', energy: '', protein: '', carbs: '', fat: '', fav: false });
    expect(hasSheetDraft(useDraft.getState())).toBe(true);
    d.setManual(null);
    expect(hasSheetDraft(useDraft.getState())).toBe(false);
  });

  it('survives a reload, but not a day', () => {
    const saved = { q: 'dal', manual: null, ai: { text: ai({ text: 'a bowl of dal' }) }, at: NOW };
    expect(cleanDraft(saved, NOW + 1000).ai.text?.text).toBe('a bowl of dal');
    expect(cleanDraft(saved, NOW + DRAFT_TTL + 1)).toEqual({ q: '', manual: null, ai: {}, at: 0 });
  });

  it('drops junk from storage instead of crashing', () => {
    expect(cleanDraft('nope', NOW).q).toBe('');
    expect(cleanDraft({ at: NOW, q: 5, manual: 7, ai: { photo: { imgs: [{ base64: 4 }, null], rows: 'x' }, bogus: ai({ text: 'z' }) } }, NOW)).toEqual({ q: '', manual: null, ai: {}, at: NOW });
    const withResult = cleanDraft({ at: NOW, ai: { label: { text: '', imgs: [], result: { confidence: 'high', notes: 'n', model: 'm' }, rows: [{ name: 'Bar', portion: '1 bar', kcal: 200, protein: 10, carbs: 20, fat: 5, qty: 2, removed: true }] } } }, NOW);
    expect(withResult.ai.label?.rows[0]).toMatchObject({ name: 'Bar', qty: 2, removed: true });
    expect(withResult.ai.label?.result?.confidence).toBe('high');
  });

  it('can be saved without photos when storage is short', () => {
    const json = JSON.stringify({ state: { q: '', ai: { photo: { text: 'plate', imgs: [img(50)], result: null, rows: [] } } }, version: 0 });
    const o = JSON.parse(stripImages(json));
    expect(o.state.ai.photo).toMatchObject({ text: 'plate', imgs: [] });
    expect(stripImages('not json')).toBe('not json');
  });
});
