// Reminders: a water nudge after 2 hours without a drink, and a "what to eat" nudge at 5 PM.
// Shown as system notifications through the service worker, so they work in the installed app.
// ponytail: no server, so this only runs while the app is open (or alive in the background).
// Reminders when the app is fully closed need Web Push from a server (e.g. a Cloudflare Worker cron).

import { useStore } from './store';
import { keyOf, todayKey } from './dates';
import { dayTotals } from './nutrition';
import { FOCUS_LABEL, FOODS, gapFocus, gapSuggestions, remaining } from './foods';

const LS_KEY = 'fuel-log-reminders';
const HOUR = 3_600_000;
export const WATER_GAP_MS = 2 * HOUR;
const AWAKE = [8, 21]; // water reminders only from 8 am until 9 pm
const FOOD_SPAN = 3; // the food reminder can fire up to 3 h after its time (e.g. 5 to 8 PM), then it is skipped

interface Saved {
  on: boolean;
  lastWaterAt: number;
  lastWaterRemind: number;
  foodDate: string;
  /** Hours without a drink before a water reminder. */
  waterGapH: number;
  /** Hour of the day (24 h) for the food reminder. */
  foodHour: number;
}
const DEFAULTS: Saved = { on: false, lastWaterAt: 0, lastWaterRemind: 0, foodDate: '', waterGapH: 2, foodHour: 17 };
export const WATER_GAPS = [1, 1.5, 2, 3];
export const FOOD_HOURS = [15, 16, 17, 18, 19];
const read = (): Saved => {
  try {
    const r = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } as Saved;
    return { ...r, waterGapH: WATER_GAPS.includes(r.waterGapH) ? r.waterGapH : 2, foodHour: FOOD_HOURS.includes(r.foodHour) ? r.foodHour : 17 };
  } catch {
    return DEFAULTS;
  }
};
const patch = (p: Partial<Saved>) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...read(), ...p }));
  } catch {
    /* storage blocked: reminders just repeat after a restart */
  }
};

export const remindersSupported = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
export const remindersOn = () => remindersSupported() && read().on && Notification.permission === 'granted';

/** The chosen water gap and food time (per device). */
export const reminderTimes = () => {
  const r = read();
  return { waterGapH: r.waterGapH, foodHour: r.foodHour };
};
export const setReminderTimes = (p: Partial<Pick<Saved, 'waterGapH' | 'foodHour'>>) => patch(p);

/** "5 PM" for an hour of the day. */
export const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

/** Asks for permission (call from a tap). Returns whether reminders are now on. */
export async function setReminders(on: boolean): Promise<boolean> {
  if (!on) return patch({ on: false }), false;
  if (!remindersSupported()) return false;
  const ok = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
  patch({ on: ok });
  return ok;
}

// ----- When is a reminder due? (pure, so it can be tested) ---------------------------------

/** Water: awake hours, goal not hit, and `gapMs` (2 h by default) since the last drink, the last reminder, or 8 am. */
export function waterDue(now: number, lastWaterAt: number, lastRemind: number, glasses: number, goal: number, gapMs = WATER_GAP_MS): boolean {
  const d = new Date(now);
  if (d.getHours() < AWAKE[0] || d.getHours() >= AWAKE[1] || glasses >= goal) return false;
  const morning = new Date(d.getFullYear(), d.getMonth(), d.getDate(), AWAKE[0]).getTime();
  return now - Math.max(lastWaterAt, lastRemind, morning) >= gapMs;
}

/** Food: once a day, from `fromHour` (5 PM by default) for 3 hours. */
export const foodDue = (now: number, lastDate: string, fromHour = 17): boolean => {
  const d = new Date(now);
  return d.getHours() >= fromHour && d.getHours() < fromHour + FOOD_SPAN && keyOf(d) !== lastDate;
};

// ----- Showing them -------------------------------------------------------------------------

async function notify(title: string, body: string, tag: string) {
  const opts: NotificationOptions = { body, tag, icon: `${import.meta.env.BASE_URL}pwa-192x192.png`, badge: `${import.meta.env.BASE_URL}pwa-64x64.png` };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts); // dev server: no service worker
  } catch {
    /* blocked or unsupported: nothing to do */
  }
}

/** Text for the evening food nudge, based on what is lowest today. null = nothing left to eat. */
export function foodReminder(): { title: string; body: string } | null {
  const s = useStore.getState();
  const T = s.settings.targets;
  const need = remaining(T, dayTotals(s.days[todayKey()]));
  const focus = gapFocus(need, T);
  const [pick] = gapSuggestions(need, T, [...s.favourites, ...FOODS.filter((f) => f.tags)], { wheyOk: s.settings.wheyOk, atSchool: false, hour: new Date().getHours() }, 1);
  if (!focus || !pick) return null;
  const left = focus === 'kcal' ? `${Math.round(need.kcal)} kcal` : `${Math.round(need[focus])} g ${FOCUS_LABEL[focus]}`;
  return { title: `Time to eat: ${pick.name}`, body: `${pick.serving} · ${pick.kcal} kcal, ${pick.protein} g protein. You still need ${left} today.` };
}

function tick() {
  if (!remindersOn()) return;
  const now = Date.now();
  const r = read();
  const s = useStore.getState();
  const glasses = s.days[todayKey()]?.water ?? 0;
  if (waterDue(now, r.lastWaterAt, r.lastWaterRemind, glasses, Math.round(s.settings.waterL * 4), r.waterGapH * HOUR)) {
    patch({ lastWaterRemind: now });
    notify('Drink some water', glasses ? `You've had ${glasses * 250} ml today. Time for a glass.` : 'No water logged yet today. Time for a glass.', 'water');
  }
  if (foodDue(now, r.foodDate, r.foodHour)) {
    patch({ foodDate: todayKey() });
    const f = foodReminder();
    if (f) notify(f.title, f.body, 'food');
  }
}

/** Starts watching: remembers when water was last logged and checks for due reminders. Returns a stop function. */
export function startReminders(): () => void {
  const waterNow = () => useStore.getState().days[todayKey()]?.water ?? 0;
  let prev = waterNow();
  const unsub = useStore.subscribe(() => {
    const w = waterNow();
    if (w > prev) patch({ lastWaterAt: Date.now() }); // a glass added here, or synced in from another device
    prev = w;
  });
  const onVisible = () => document.visibilityState === 'visible' && tick();
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(tick, 60_000);
  tick();
  return () => {
    unsub();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
