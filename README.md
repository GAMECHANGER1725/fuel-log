# Fuel Log

A personal, gamified calorie and protein tracker for a vegetarian (eggs and dairy OK) bulk. Mobile-first, installs to your home screen, works offline. There's no account, no setup and no server: it opens straight onto Today with my stats built in (`src/lib/backup.ts` → `DEFAULT_DATA`), and the log stays on the phone.

**Live app:** https://gamechanger1725.github.io/fuel-log/

## What it does

- **Today:** energy and protein rings, carb and fat bars, one running food log with the time each item was logged (every entry stores its exact timestamp for later insights), water, food-quality checks, copy yesterday, and past days.
- **Close the gap:** suggests foods that cover the kcal and protein you still need. During school hours it only suggests food you can pack. Tap an idea to see its recipe (exact ingredient amounts and method), `+` to log it, or **Refresh** for different ideas. There are 26 vegetarian recipes (`src/lib/recipes.ts`); each dish's calories and macros are worked out from its ingredient amounts, and the recipe also shows in the add-food sheet.
- **Coach** (needs an AI key): its own tab.
  - **Weekly check-in:** once a week, by itself, the coach reads the last two weeks of logs, weigh-ins and meal times (how many times a day you eat, how much before 3 pm, weekdays vs weekends) and sets new kcal, protein, carbs and fat targets with a short explanation and 3 things to focus on, plus a note on your water. The AI suggests the numbers, but code sets the limits (`src/lib/coach.ts`): calories only go up when you're gaining too slowly *and* eating at least 90% of your target, only go down when you're gaining too fast, change by at most 250 kcal, and can change at most once every 7 days. Protein stays at 1.6–2.2 g/kg and fat at 20–35% of energy, and carbs make up the rest. You can undo a change, or turn off auto-apply so the coach only suggests.
  - **What to make now:** six ideas for what's left today, two each that take 5, 10 and 20 minutes, with amounts, method and macros, and `+` to log. Liquid food comes first: both 5-minute ideas are shakes or smoothies, and at least 4 of the 6 are drinks, shakes or soups. Respects whey off and school hours.
  - **Morning brief:** the first time you open the app from 5 am, the coach looks at yesterday and gives you 3 things to focus on today (breakfast first, something to pack on school days), next to yesterday's numbers.
  - **Nightly digest (9:30 pm):** today's calories, protein and water against your targets, what went well, what fell short, a small before-bed top-up only if you're well short, and one change for tomorrow. With reminders on, you get a notification when each one is ready. Like the other reminders, this only works while the app is open or alive in the background.
  - **Ask your coach:** short answers to questions like "why am I not gaining?", based on your own log.
- **Five ways to log food:**
  - search a built-in vegetarian list (about 150 Australian and Gujarati/Indian foods, eggs and dairy included) plus Australian products from [Open Food Facts](https://world.openfoodfacts.org)
  - **barcode scanner** (camera or typed, free, no key needed)
  - **AI meal photo:** up to 6 photos of one meal (different angles, close-ups, the drink); the AI estimates each food and counts a food only once even if it's in several photos
  - **AI label reader:** for packets that aren't in Open Food Facts (add the front and the panel as separate photos)
  - **AI "describe it":** e.g. "3 rotli, dal and a glass of milk"

  Every AI result opens in a review sheet where you can fix it before logging.
- **Progress:** weigh-ins with a 7-day trend line, a target band and a projected goal date. Without the coach, a weekly check-in suggests ±150–200 kcal when gain is too slow or too fast (and tells you to eat your current target first if you haven't been); with the coach's auto check-in on, the coach handles this instead. Also a days-hit heatmap and weekly averages.
- **Game:**
  - XP for logging, hitting targets, water, scans and weigh-ins, with levels and 10 ranks
  - streaks with freeze tokens
  - 3 daily quests and a weekly boss challenge
  - 20 badges and a full-screen level-up moment

  XP is worked out from your log, so deleting food takes its XP back.
- **Profile:** targets (with "suggest from my stats"), AI key and model, kcal or kJ, dark, light or auto theme, a whey toggle, backup export and import (including backups from the original Fuel Log artifact), and reset.
- **Fitness Tracker link:** Profile opens [Fitness Tracker](https://gamechanger1725.github.io/Fitness-Tracker/), the sister app for home workouts, wake-ups and sleep. It reads this log (on the same phone, or through the sync gist) for its Fuel tab and uses the same AI key and passcode. Both apps share one design from Claude Design: Fuel Log is the warm one, Fitness Tracker the cool one.

## Sync between devices

Optional. **Profile → Sync between devices** keeps your phone and laptop on the same log using one **secret GitHub Gist** (`fuel-log-sync.json`) in your own GitHub account.

1. Create a token with only the **gist** permission: https://github.com/settings/tokens/new?scopes=gist&description=Fuel%20Log%20sync (set Expiration to *No expiration*).
2. Paste it into the app and tap **Connect**. Repeat on each device with the same token. The second device finds the gist by itself.

It syncs when you open the app, a few seconds after each change, when you switch back to the app, and every minute while it's open. Merging is per item, so food logged on both devices at once is kept, and a deleted item stays deleted. The token, AI keys, theme and recents never go into the gist; they stay on each device. To stop syncing, tap Disconnect (your data stays) and delete the gist on GitHub if you want.

## Passcode

The app opens on a passcode screen. You stay signed in until **Profile → Log out**. Only a salted hash of the code is in the repo (`src/lib/auth.ts`). It's a lock screen against casual snooping, not real security.

## AI setup (optional)

You can use DeepSeek (through TokenHarbor), Google Gemini, or both. With both keys the app tries your first choice (**Try first** in Profile → AI) and moves to the other when it hits its limit, is busy or rejects the key.

1. DeepSeek: sign in at https://tokenharbor.ai and create a key under **API Keys**.
2. Gemini: create a free key at https://aistudio.google.com/apikey.
3. In the app go to **Profile → AI**, paste each key, then tap **Test** and **Save key**.

Keys are stored only in your phone's browser and sent only to their provider. The DeepSeek model is DeepSeek V4.1 Flash (`deepseek-v4.1-flash:free`, free on TokenHarbor), which thinks step by step before it answers. Suggested recipes can be changed with **Edit recipe**; your version is saved, synced, and used from then on (**Reset** brings the original back).

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # logic tests (targets, XP, streaks, imports, parsers)
npm run build && npm run preview   # production build at http://localhost:4173/fuel-log/
```

## Deploy

Every push to `main` runs the tests, builds the app and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). Pages must be set to **Source: GitHub Actions**.

## Install on your phone

Open the live link, then:
- **Android (Chrome):** ⋮ → Add to Home screen.
- **iPhone (Safari):** Share → Add to Home Screen.

Export a backup from Profile now and then. Clearing the browser deletes the log.
