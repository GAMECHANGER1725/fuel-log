# Fuel Log

A personal, gamified calorie and protein tracker for a vegetarian (eggs and dairy OK) bulk. Mobile-first, installs to your home screen, works offline. There's no account, no setup and no server: it opens straight onto Today with my stats built in (`src/lib/backup.ts` → `DEFAULT_DATA`), and the log stays on the phone.

**Live app:** https://gamechanger1725.github.io/fuel-log/

## What it does

- **Today:** energy and protein rings, carb and fat bars, one running food log with the time each item was logged (every entry stores its exact timestamp for later insights), water, food-quality checks, copy yesterday, and past days.
- **Close the gap:** suggests foods that cover the kcal and protein you still need. During school hours it only suggests food you can pack.
- **Five ways to log food:**
  - search a built-in vegetarian list (about 150 Australian and Gujarati/Indian foods, eggs and dairy included) plus Australian products from [Open Food Facts](https://world.openfoodfacts.org)
  - **barcode scanner** (camera or typed, free, no key needed)
  - **AI meal photo:** Gemini estimates each food on the plate
  - **AI label reader:** for packets that aren't in Open Food Facts
  - **AI "describe it":** e.g. "3 rotli, dal and a glass of milk"

  Every AI result opens in a review sheet where you can fix it before logging.
- **Progress:** weigh-ins with a 7-day trend line, a target band and a projected goal date. A weekly check-in suggests ±150–200 kcal when gain is too slow or too fast (and tells you to eat your current target first if you haven't been). Also a days-hit heatmap and weekly averages.
- **Game:**
  - XP for logging, hitting targets, water, scans and weigh-ins, with levels and 10 ranks
  - streaks with freeze tokens
  - 3 daily quests and a weekly boss challenge
  - 20 badges and a full-screen level-up moment

  XP is worked out from your log, so deleting food takes its XP back.
- **Profile:** targets (with "suggest from my stats"), Gemini key and model, kcal or kJ, dark, light or auto theme, a whey toggle, backup export and import (including backups from the original Fuel Log artifact), and reset.

## AI setup (optional)

1. A parent creates a free key at https://aistudio.google.com/apikey (Google requires an adult to make it).
2. In the app go to **Profile → AI food scanner**, paste the key, then tap **Test** and **Save key**.

The key is stored only in your phone's browser and sent only to Google. The default model is `gemini-flash-latest`, which always points at Google's current Flash model. If Google is busy or you hit the free limit, the app retries once with Flash-Lite.

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
