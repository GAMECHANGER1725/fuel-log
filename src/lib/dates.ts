// Local-date helpers. Keys are "yyyy-MM-dd" in the phone's time zone; noon avoids DST edges.

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
export const todayKey = () => keyOf(new Date());
export const isKey = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);

export function addDays(k: string, n: number): string {
  const d = dateOf(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

export const daysBetween = (a: string, b: string) => Math.round((dateOf(b).getTime() - dateOf(a).getTime()) / DAY);

/** Monday of the week containing k. */
export function weekStart(k: string): string {
  const wd = (dateOf(k).getDay() + 6) % 7;
  return addDays(k, -wd);
}

export function fmtDate(k: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return dateOf(k).toLocaleDateString('en-AU', opts);
}

/** Simple string hash, used to seed daily quests. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
