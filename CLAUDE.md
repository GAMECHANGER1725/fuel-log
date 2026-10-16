# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Fuel Log: a personal, mobile-first PWA (React 19 + Vite + zustand, TypeScript) for tracking calories and protein on a vegetarian bulk. No backend. Data lives in the browser's localStorage; optional sync goes through a private GitHub Gist. Deployed to GitHub Pages at `/fuel-log/`.

## Commands

```bash
npm run dev          # http://localhost:5173 (dev:phone adds --host for testing on a phone)
npm test             # vitest run (tests/**/*.test.ts, pure logic only, no DOM)
npx vitest run tests/lib.test.ts -t "gap"   # one file / one test by name
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + vite build
npm run preview      # production build at http://localhost:4173/fuel-log/
```

There is no linter. CI (`.github/workflows/deploy.yml`) runs `npm test` then `npm run build` on every push to `main` and publishes to Pages, so a push to `main` is a deploy. The base path comes from `BASE_PATH` (default `/fuel-log/`); in dev it is `/`.

## Architecture

**Single store, local-first.** `src/lib/store.ts` is one zustand store persisted to localStorage (`fuel-log-v3`) holding all `AppData` (see `types.ts`). `dataOf()` strips actions to get a plain snapshot, used for export, sync and the game engine. Anything loaded from storage, backups or the gist must go through `normalize()` in `backup.ts`, which validates and fills defaults from `DEFAULT_DATA` (the owner's stats are built in, there is no onboarding).

**Derived, not stored.** `src/lib/game.ts` computes XP, levels, streaks, quests, boss challenge and badges purely from the log on every change. Deleting a meal takes its XP back automatically. Don't add stored counters for game state; the only persisted game state is `seen` (celebrations already shown).

**Entries.** Every `Entry` stores `base` (one serving) and `qty`; totals are `base × qty` (`nutrition.ts`). Each has an exact `at` timestamp (epoch ms), and there are no meal slots, just one timestamped log per day. Energy is always stored in kcal; kJ is display-only.

**Food data.** `foods.ts` holds the built-in list (`ROWS`) plus foods derived from `recipes.ts`. Recipe dishes get their kcal/macros computed from ingredient grams in the `ING` table, and share a name/id slug with the food entry so the two link (`recipeFor`). Food tags: `p` = packable for school, `g` = good gap-closer, `w` = whey. "Close the gap" on the Today page uses `gapSuggestions()` in `foods.ts` (scoring, school-hours filter, refresh rounds). The scoring is dynamic: each nutrient is weighted by the share of its daily target still missing (`gapWeights`), so whatever is lowest drives the picks.

**Reminders.** `reminders.ts` shows water (2 h without a drink, 8 am to 9 pm) and 5 PM food notifications via the service worker (`public/sw-extra.js` is pulled into the generated SW by `workbox.importScripts`). It runs only while the app is alive, since there is no server; its on/off flag and timestamps are per device in localStorage, not in the store or the gist.

**Sync (the part that needs several files to understand).** `sync.ts` talks to the GitHub Gist API and schedules syncs; `syncdoc.ts` defines the synced document and the merge rules (union of entries by id, tombstones in `tomb` for deletions, newer `m` wins for water/checks, newest `mod` wins for the whole profile/targets/weigh-ins/favourites block). Consequences when changing the store:
- Mutations that should sync must bump the right timestamp (`Entry.upd`, `DayLog.m`, or `mod`) and deletions must write to `tomb`.
- Per-device fields (AI key/model, theme, recents, GitHub token) must stay out of the gist; `LOCAL_ONLY` in `store.ts` and `SmallData` in `syncdoc.ts` both encode this.
- The document is canonicalised (sorted keys) so equal docs compare equal; keep it that way or sync will write on every tick.

**AI features.** `ai.ts` calls DeepSeek V4.1 Flash through TokenHarbor's OpenAI-style chat API (`tokenharbor.ai/v1`, CORS-open) directly from the browser with the user's own key (photo, label, free-text estimates). There is no schema mode, so each prompt carries its JSON schema (`jsonRule`) and replies are parsed leniently (`parseJson`). Results always go through a review sheet (`AiSheet.tsx`) before logging. `coach.ts` holds the coach prompts (weekly check-in incl. water, meal ideas, chat) and AI recipe edits, which are saved in `AppData.recipeEdits` (synced with favourites) and applied via `withEdit`/`recipeFor` in `recipes.ts`. `off.ts` queries Open Food Facts; `Scanner.tsx` uses `barcode-detector`.

**Routing and UI.** Hash router (`useRoute` in `components/ui.tsx`) over four pages in `src/pages/` (Today, Food, Progress, Profile) plus `Lock`. `App.tsx` gates everything behind the passcode in `auth.ts` (client-side lock screen only, by design), mounts background sync once unlocked, and renders level-up celebrations.

**PWA.** `vite-plugin-pwa` with `registerType: 'autoUpdate'`; the manifest is in `vite.config.ts`.

## Conventions

- Dates are local `yyyy-MM-dd` strings (`dates.ts`), parsed at noon to avoid DST edges. Use those helpers rather than `toISOString()`.
- Display locale is `en-AU`; foods are Australian and Gujarati/Indian vegetarian (eggs and dairy OK, no meat or fish).
- Code carries `ponytail:` comments marking deliberate simplifications with their known ceiling; keep that style when cutting a corner on purpose.
- Tests are logic-only (`tests/lib.test.ts`, `tests/sync.test.ts`). Keep new logic in `src/lib/` as pure functions so it stays testable; the passcode test must not contain the plaintext code.
