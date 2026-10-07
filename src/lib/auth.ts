// Passcode lock. Keeps casual snoopers out of the app on this phone.
// ponytail: client-side only, so it isn't real security (a 4-digit code in a public repo can be
// brute-forced). Only the salted hash is stored here so the code isn't readable at a glance.

import { create } from 'zustand';

const HASH = '355cc6f9a4c55dac49b483d943adf5baba22beb448deb5b455e5a25308610671'; // sha256("fuel-log:" + code)
const KEY = 'fuel-log-unlocked';
export const CODE_LENGTH = 4;

export async function checkPasscode(code: string): Promise<boolean> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fuel-log:${code}`));
  const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === HASH;
}

const read = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
const write = (on: boolean) => {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: stays signed in for this session only */
  }
};

/** Signed in stays on across restarts until "Log out". */
export const useAuth = create<{ unlocked: boolean; unlock: (code: string) => Promise<boolean>; lock: () => void }>((set) => ({
  unlocked: read(),
  unlock: async (code) => {
    const ok = await checkPasscode(code);
    if (ok) {
      write(true);
      set({ unlocked: true });
    }
    return ok;
  },
  lock: () => {
    write(false);
    set({ unlocked: false });
  },
}));
