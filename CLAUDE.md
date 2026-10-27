# Overload Tracker — notes for Claude

Personal workout + food tracker for one user (UK, iPhone, metric). Read this
before changing anything.

## Hard constraints (from the owner)

- **No extra cost, ever.** No paid APIs, API keys, servers, databases or
  subscriptions. Free tiers only (GitHub Pages, GitHub Actions on this repo,
  Open Food Facts, gov.uk open data, public CDNs).
- Keep it a **static site on GitHub Pages**: `index.html` (all app code: HTML,
  Tailwind via the Play CDN, vanilla JS), `sw.js`, `manifest.webmanifest`,
  `icons/`, `food-data/`. No build step.
- Data lives in the browser (`localStorage` key `pot.v1`). Any new field must be
  added to `seedState()`/`emptyFood()` **and** `migrate()` so old saved data and
  backups keep loading.
- Explain things in plain English; the owner isn't a developer.

## Workflow

- Work on branch `claude/workout-tracker-progressive-overload-dteybv`, then
  push the same commit to `main` (the owner approved pushing straight to
  `main`; Pages deploys from `main`). Fetch/merge `origin/main` first: the
  weekly food-data Action commits there.
- The site is https://tobybrown02-stack.github.io/Gym-tracker/ (repo was
  renamed from gym-tracker to Gym-tracker).
- After a push the app shows an "update available" banner (it compares its own
  script text with a fresh copy), so phones pick up changes with one tap.
- Never put a literal closing script tag inside the main script (it ends the
  script block); the update check builds it from split strings.

## Testing

No test suite is committed. Test with Playwright (preinstalled; `require('playwright')`):
- Tailwind's CDN is blocked in the sandbox: route `https://cdn.tailwindcss.com/**`
  to a stub (`window.tailwind={}`), or compile the `<style type="text/tailwindcss">`
  block with `npx tailwindcss@3.4.16` and inject it to check visuals.
- `file://` works for most things; serve over `http://localhost` to test the
  service worker, offline mode and `food-data/` loading.
- Mock Open Food Facts (`search.openfoodfacts.org`, `world.openfoodfacts.org`)
  with `page.route`; the sandbox can't reach them.
- Check at 390px wide (iPhone) in dark mode; screenshot and look.

## How the app works

Tabs: Workout, Food, Plan, Stats, Exercises, History.

**Progressive overload (double progression)** — `predict(ex)`:
- Working sets = sets at the hardest load (heaviest; least assistance for
  assisted machines); lighter sets are warm-ups and ignored.
- Every planned working set at the top of the rep range → next session goes up
  one equipment step and reps reset to the bottom of the range.
- Otherwise same load, beat last total reps by ≥1 (extra rep on weakest set).
- Steps: dumbbell 2 kg, machine 3 or 4 kg (per exercise), barbell 2.5 kg,
  bodyweight "add weight" 2.5 kg, "reps only" no step, "assisted" machine 3/4 kg
  with assistance going *down*. Use `harder(ex,a,b)` / `loadLabel(ex,w)` for
  anything load-related.
- Plateau: 3 sessions in a row without progress → offer ~10% deload (more
  assistance for assisted). Logged deloads reset the count.

**12-week programme** (`state.programme`, old ones in `state.pastProgrammes`;
the owner's own design): three 4-week blocks, weeks 1–3 build and week 4
deloads. Block 1 Base 10–15 reps; Block 2 Build 8–12 reps, +1 set on main
lifts; Block 3 Strength 5–8 reps on main lifts (rest ≥150 s), others 8–12.
Main lifts = `programme.main` (default: exercises hitting 2+ muscles), editable.
`progEx(ex, date)` returns the exercise with the block's range/sets/rest; it
never changes the saved exercise or routines. Use `targetFor(ex)` /
`entryTarget(entry)` instead of `predict()` in the workout UI. First session
in a new rep range → `rebase()` picks the weight from est. 1RM (bottom of range
at ~2 RIR). Deload weeks 4/8/12: ~10% lighter (more assistance), half sets,
saved as `h.pdl`. Week 12 optional rep-max test on main lifts (`entry.test` →
`h.test`, one all-out set). `predict()` skips pdl/test sessions and
`plateau()` resets on them. Draft `pdl` toggle: "Train normally today".
Check-ins: week 0 at setup, then end of weeks 4/8/12 (weight, waist, feel,
note; also written to weight log/measurements); review compares trend
weight, waist and e1RM vs the last session before the start. Owner (Oct 2026):
~103.9 kg, goal 95 kg, slow cut, 5 days/week up to an hour, no squats or
deadlifts.

**Other workout features:** routines (max 5) + weekly schedule with one-off day
overrides, rest timer, warm-ups and plate calculator, RPE/notes, PRs, swap
exercise, supersets (`entry.ss`, remembered in `routine.links`), workout clock
and summary, exercise library (`LIBRARY`), stats (sets per muscle, volume,
e1RM/best-reps chart, nutrition summary, body measurements).

**Food:** targets from Mifflin-St Jeor × activity ± goal, protein ~2 g/kg when
cutting (1.8 otherwise), fat ≥25%, carbs the rest. Optional training-day
calories: the setting is the *gap* between training and rest days, split
around the target so the weekly total is unchanged (owner explicitly wanted
e.g. 2,400 → ~2,450/2,250, not a big rest-day cut). Weekly check-in estimates
maintenance from 3 weeks of intake + weight trend (EMA), max ±200 kcal/week.
Recipes, saved meals, water, weight trend.

**Food data:** `food-data/uk-products.json` (~30k most-scanned UK products from
the Open Food Facts export) and `food-data/uk-cofid.json` (gov.uk CoFID 2021)
are rebuilt every Monday by `.github/workflows/food-data.yml` running
`scripts/build_food_data.py` (manual run supports `cofid_only`). The app
searches them offline first, then falls back to live Open Food Facts search
(rate-limited ~10/min; results cached a day). `UK_FOODS` in `index.html` is a
small hand-made list of common basics with portions (approximate values).

**Data safety:** backups via the iPhone share sheet (History → Back up),
weekly reminder, restore prompt in a fresh Home Screen app (Home Screen apps
on iOS have separate storage from Safari), storage meter (~5 MB Safari limit).

## Ideas not done yet

- Wearable (Garmin/Fitbit) dashboard — needs a server; parked by the owner.
- Push notifications — need a server; not possible for free here.
