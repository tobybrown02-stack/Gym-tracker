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
- Explain things in plain English; the owner isn't a developer. They like to
  talk ideas through first; for big changes to how targets are worked out,
  propose with a worked example and confirm choices before building.

## The owner

- Male, UK, iPhone (uses the Home Screen app daily), trains at a David Lloyd
  (commercial gym: machines, cables, plate-loaded, Smith, dumbbells).
- Training since Jan 2023, consistently for the last ~12 months. 5 days a
  week, up to an hour a session. **No squats or deadlifts** (never suggest them).
- **Hypermobile**: prefers machines over barbells; **no dumbbell presses**;
  dumbbell curls and lateral raises are fine. Upper body is the priority;
  doesn't love training legs (legs are already their best body part).
- Wearables owned: Garmin Instinct 3 (recommended as the everyday device: free,
  long battery, sleep/HRV/readiness/steps), Apple Watch S10, Fitbit, and a
  Whoop whose subscription ends March 2027 (advised not to renew). Garmin
  syncs into the app via the Personal API (see Garmin section). Advised to ignore wearable calorie-burn
  figures and not eat back exercise calories; the weekly check-in uses the
  real weight trend.
- Lost ~30 kg overall (26 kg in 2026, mostly a big cut). Oct 2026: ~103.9 kg,
  goal 95 kg, now a **slow cut** (aim ~0.25–0.5 kg a week) while building
  strength. Food targets (Oct 2026): 2,400 kcal base, protein 170 g, fat 70 g,
  training-day split on with a 200 kcal gap (5 training days → +57 / −143).
- Gets discouraged by day-to-day water-weight swings (salt, carbs, new
  training). Reassure with the trend, not single weigh-ins; they turned on
  "trend only". Don't suggest cutting calories from a few days of data.

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
- Update this file in the same commit as any feature change.

## Testing

No test suite is committed. Test with Playwright (preinstalled; `require('playwright')`):
- Tailwind's CDN is blocked in the sandbox: route `https://cdn.tailwindcss.com/**`
  to a stub (`window.tailwind={}`), or compile the `<style type="text/tailwindcss">`
  block with `npx tailwindcss@3.4.16` and inject it to check visuals.
  **Recompile after adding new classes**, or screenshots show a broken layout
  from stale CSS.
- `file://` works for most things; serve over `http://localhost` to test the
  service worker, offline mode and `food-data/` loading.
- Mock Open Food Facts (`search.openfoodfacts.org`, `world.openfoodfacts.org`)
  with `page.route`; the sandbox can't reach them.
- Use `page.clock.install({ time })` to test programme weeks, Mon/Tue recaps
  and deload weeks. `page.fill()` doesn't fire `change`; `blur()` the input
  to test the auto rest timer.
- Check at 390px wide (iPhone) in dark mode; screenshot and look.

## Look ("Plate", chosen Oct 2026)

The owner picked "Plate" from four trial looks (inspired by a friend's app,
deliberately not a copy). Warm near-black / cream neutrals, bumper-plate red
accent, **Anton** headings (h1/h2 and `.display`: uppercase, weight 400; never
add `font-bold` to Anton, it fakes bold) over **Archivo** body text, from
Google Fonts (cached by `sw.js`; fallbacks if offline). The palette is done by
remapping Tailwind's `slate` (neutrals), `indigo` (red accent), `violet`
(plate blue), `emerald` (plate green), `amber` (plate yellow) and `white` in
`tailwind.config`, so existing classes pick it up; keep using those class
names. Each routine has a plate colour by position (`PLATE_COLORS`,
`plateColor(r)`, `plateDot(r)`): red, blue, yellow, green, white. The
12-week strip shows round "plates". `.eyebrow` = small red uppercase label.
Home Screen icon (`icons/`, Oct 2026, owner picked option "C" of five): a red
plate disc with a dark rim and a cream dumbbell on warm black, matching the
header badge (made with PIL; maskable version has
more padding). iOS only picks up a new icon when the app is removed and re-added
to the Home Screen, which wipes that app's storage: always back up first and
restore after.
Header subtitle shows the programme week (`#hdr-sub`, set in `render()`).
Friend-style layout pieces: Today hero card with a plate-colour bar, tags and
"Start workout"; `todayTiles()` (weight trend, sessions, calories left, next
check-in); Plan tab week as a table (`planTable()`: day / session / status,
done days named by muscles logged); Stats month calendar (`monthCard()`, top
bar gym, bottom bar food with calories left half and protein right half via
`foodDayRating()`: on target ±10% kcal / ≥95% protein, close, well off;
planned days before the first logged workout aren't "missed").

## How the app works

Tabs: Workout, Food, Plan, Stats, Exercises, History (History also holds
Settings: bar weight, progression mode, storage, erase). Plus the plan builder
screen (no tab).

**Progression engine** — `predict(ex, date)` (call `targetFor()` in the UI):
- Working sets = sets at the hardest load (heaviest; least assistance for
  assisted machines); lighter sets are warm-ups and ignored.
- Sets can be marked warm-up (`s.warm`, tap the set number → "W"); they're
  ignored by `evaluate()`. Use it for "finding my weight" feeler sets.
- Per-set RPE (`s.rpe` select on every set row; replaced the old per-exercise
  `h.rpe`, still read as a fallback). Advice to the owner: rating just the
  last set is enough; rating every set is fine (only the last counts).
- **RPE formula mode** (`settings.progression`, default `'rpe'`; owner chose
  it, with 1%/week, RPE wave and "go heavier"): `rpePredict()` runs first in
  `predict()` for weighted (non-bodyweight) exercises whose last session has a
  rated working set. e1RM = w × (1 + (reps + 10 − RPE)/30) (`ratedE1`, the LAST
  rated working set only: earlier fresher sets would inflate targets;
  `rebase()` uses it too). After ≥2 earlier rated sessions the estimate is
  clamped to −5%/+2.5% of the previous one. Goal = e1RM × 1.01
  (`RPE_GROWTH`). Target RPE for the last set (`targetRpe`): programme weeks
  1/2/3 of each block → 8/8.5/9, else 8. Reps(w) = round(30 × (goal/w − 1) −
  RIR); choose the heaviest load within ±3 steps of last time that still
  reaches the bottom of the rep range; reps clamped to the range; same reps
  every set. Badge "RPE target".
- **Double progression** (fallback: no rated set, bodyweight/assisted/reps-only
  exercises, or the setting switched to `'double'`): every planned working
  set at the top of the rep range → up one equipment step, reps reset to the
  bottom; otherwise same load, beat last total reps by ≥1 (extra rep on the
  weakest set). RPE still nudges it: reps + (10 − RPE) ≥ top + 3 →
  "calibrate" up from est. 1RM (bottom of range at ~2 left) if that's more
  than one step; reps + RIR < bottom → calibrate down; RPE ≤ 7.5 → aim +2
  reps; RPE ≥ 9.5 → note that +1 is plenty.
- Steps: dumbbell 2 kg, machine 3 or 4 kg (per exercise), barbell 2.5 kg,
  bodyweight "add weight" 2.5 kg, "reps only" no step, "assisted" machine 3/4 kg
  with assistance going *down*. Use `harder(ex,a,b)` / `loadLabel(ex,w)` for
  anything load-related. `floorToStep()` for rounding down.
- Plateau: 3 sessions in a row without progress (heavier, more reps at the same
  load, or in RPE mode an RPE-e1RM gain >0.5%) → offer ~10% deload (more
  assistance for assisted). Logged deloads reset the count.
- Rest timer starts automatically on ✓ or when a reps box is committed
  (`change` event); 60 s after a warm-up, none mid-superset (`restAfterSet`);
  doesn't restart for the same set. iOS pauses it while the phone is locked.

**12-week programme** (`state.programme`, old ones in `state.pastProgrammes`;
the owner's own design): three 4-week blocks, weeks 1–3 build and week 4
deloads. Block 1 Base 10–15 reps; Block 2 Build 8–12 reps, +1 set on main
lifts; Block 3 Strength 5–8 reps on main lifts (rest ≥150 s), others 8–12.
Main lifts = `programme.main` (default: exercises hitting 2+ muscles), editable
from the Plan card ("Main lifts · Change"). `progEx(ex, date)` returns the
exercise with the block's range/sets/rest; it never changes the saved exercise
or routines. Use `targetFor(ex)` / `entryTarget(entry)` instead of `predict()`
in the workout UI. First session in a new rep range → `rebase()` picks the
weight from est. 1RM (bottom of range at ~2 RIR). Deload weeks 4/8/12: ~10%
lighter (more assistance), half sets, saved as `h.pdl`. Week 12 optional
rep-max test on main lifts (`entry.test` → `h.test`, one all-out set).
`predict()` skips pdl/test sessions and `plateau()` resets on them. Draft
`pdl` toggle: "Train normally today". Check-ins: week 0 at setup (the setup
form itself), then end of weeks 4/8/12 (weight, waist, feel, note; also written
to weight log/measurements); review compares trend weight, waist and e1RM vs
the last session before the start, with plain-English advice.

Owner's setup: programme week 1 = Mon 26 Oct 2026. Deloads: weeks of
16 Nov, 14 Dec, 11 Jan. Check-ins due Sun 22 Nov, Sun 20 Dec, Sun 17 Jan
(Sunday is a training day: weigh in before training). The owner was briefly
confused that the starting check-in has no separate screen; offered a
"Starting point" summary after setup and declined.

**Current split (from 29 Oct 2026, `NEW_PLAN`, loaded by the "Your new plan
is ready" card → `loadNewPlan()`):** Push / Pull / Legs / Upper / Arms &
top-up, Wed–Sun, Mon/Tue rest (some weeks Mon/Wed rest; same order, use day
overrides). Designed with the owner: upper body is the priority (~2.5× leg
volume), legs one full day + top-up (they don't love legs; legs are their
best body part). **Hypermobility: machines first; no squats, deadlifts or
dumbbell presses** (dumbbell curls and raises are fine). Leg press / hip
thrust at RPE 8–9, never lock the knees; isolation machines can go to 9–10.
1 Push: Chest Press Machine, Pec Deck, Shoulder Press Machine, Dumbbell
Lateral Raise, Tricep Pushdown, Overhead Cable Tricep Extension.
2 Pull: Assisted Pull up, Chest-Supported Row Machine, Lat pulldown, Dumbbell
Rear Delt Fly, Preacher Curl Machine, Hammer Curl.
3 Legs: Leg Press, Hip Thrust Machine, Leg Extension, Seated Leg Curl, Hip
Abduction Machine, Seated Calf Raise.
4 Upper: Chest Press Machine, Chest-Supported Row Machine, Assisted Pull up,
Pec Deck, Shoulder Press Machine.
5 Arms, delts & top-up: Dumbbell Lateral Raise, Dumbbell Rear Delt Fly,
Dumbbell Curl (new), Tricep Pushdown, Leg Extension, Seated Leg Curl, Seated
Calf Raise (2 sets).
Main lifts: Chest Press, Shoulder Press, Chest-Supported Row, Lat Pulldown,
Leg Press, Hip Thrust. First week only: Push on Thu 29 Oct (Back & Biceps
was done Wed 28), then Legs, Upper, Arms. Loading keeps history, reuses old
routine ids (A→Pull, B→Push, C→Legs, D→Upper, E→Arms) and matches exercises
by name ignoring case/spaces/dashes (`normName`). Check at each programme
check-in that leg press / leg extension strength holds; if it drops over two
check-ins, add leg sets.
Routines can set their own set count per exercise (`routine.sets = {exId: n}`,
carried into the draft as `entry.n`; use `entryEx()` / `routineEx()`).

Other people can use the app too (the owner's girlfriend): same URL, own
phone, separate data. The "new plan ready" card only shows for data with
workouts before 29 Oct 2026; new users should use the plan builder.

**Plan builder** (`view = 'builder'`, opened from the Plan tab card or an
empty Workout tab; `state.planner = {answers, plan, step, main, savedAt}`):
an 8-question questionnaire (about you, goal, experience, week/days/session
time, muscle priorities grow/normal/keep + leg days, gym & style, joints and
"never give me" list, recovery/lifestyle), then an **editable preview**
(rename, change weekday, swap exercise per slot, ± sets, remove, add) that
only changes anything on "Save this plan"; "Cancel plan" discards it. The owner
asked for: detailed personal questions, preview first, edit before saving,
able to cancel. Generator (`buildPlan()`): split from days (2–5, the routine
limit) × leg-day choice (`B_SPLITS`, `B_TEMPLATES`); each template is a list
of slots (`B_SLOTS`: chestPress, row, vPull, quad, lateral …) filled with the
best-scoring candidate (`bCandidates()`: own exercises first, recently logged
ones higher, then library; style/joint scores; `B_AVOID` and `B_JOINTS`
filters, gym type); compounds first; added while the session estimate fits
the time limit; then a balance pass moves weekly sets toward 14/10/6 per
muscle (grow/normal/keep) × a recovery factor (`bRecovery`: sleep, stress,
job, steps, cardio, experience, consistency, fat-loss goal; floor 0.7; max 4
sets/exercise only for 2+ years and good recovery). Main lifts = one per big
movement (`bMainLifts`). Saving replaces routines + weekly schedule (reuses
old routine ids by position), clears overrides from today, sets
`programme.main`, optionally copies age/height/weight to the food profile
(targets unchanged), keeps history/programme. With the owner's answers it
reproduces their current Push/Pull/Legs/Upper/Arms plan almost exactly.

**Session length:** `sessionMinutes(routine, date)` ≈ 5 min warm-up + per
exercise 1 min setup + (3 s/rep + 10 s) per set + rest after each set (15 s
inside a superset), using the programme's sets/rest. Shown on today's routine
(amber warning over 60 min, the owner's limit) and on Plan routine cards.

**Weekly recap:** `weekRecap(start)` / `recapHtml()`: sessions vs planned,
working sets and kg vs the week before, weight trend change, avg kcal/protein
vs targets, PRs (one per exercise), muscles under 10 sets. Shown on the Workout
tab on Mon/Tue (owner's rest days; "Hide" snoozes it) and on Stats for the
selected week.

**Muscle balance** (Plan tab, `balanceCard()`): planned working sets per
muscle (`plannedVolume(start, typical)`, programme sets/deloads included).
Defaults to "Your usual week" (weekly schedule, ignoring one-off day changes);
when the Plan week has changes a toggle shows that week too (`balanceMode`).
The owner was confused when it counted a changed week (Push twice, no Pull),
so it lists the sessions counted, counts **direct work only** by default
(primary muscle sets; owner asked for this after biceps showed 24 incl. ½
sets from rows; toggle `balanceDirect` adds helper ½ sets back; in direct mode biceps/triceps
use a 6–14 band since compounds already hit them; direct mode counts each
exercise for ONE muscle, `mainMuscle(ex)`: the library's first main muscle
when the name matches, else the first muscle marked main in `MUSCLES` order,
because the owner's own back exercises have Biceps tagged as main), labels Good/Low/High, and each muscle opens
to show which exercises its sets come from. Every muscle shown so untrained ones stand out; muscles
under 10 sets (not Core) get library suggestions (`fillers`, machines first,
never squats/deadlifts). **Muscle trend** (Stats, `muscleTrendCard`): 12 weeks
of done sets for one muscle (`statsMuscle`), deload weeks amber.
**Journey** (Stats, `state.body.journey = {kg, date, goal}`): all-time start
weight (also written into `food.weights` so charts span it), total lost,
5 kg milestones, goal ETA from the 4-week trend rate (`rate4w`).

**Exercise library** (`LIBRARY`, 161 entries, pipe-separated text: name |
equipment d/m/b/w(bodyweight + weight)/r(reps only)/a(assisted) | rep range |
start kg | primary | secondary | rest s). Includes UK commercial-gym machines,
plate-loaded, Smith and cable variants. Keep names unique and muscles within
`MUSCLES`; don't add more squat/deadlift variants.

**Other workout features:** routines (max 5) + weekly schedule with one-off day
overrides, warm-up ramp and plate calculator, notes, PRs, swap exercise,
supersets (`entry.ss`, remembered in `routine.links`), workout clock and
summary, stats (sets per muscle, volume, e1RM/best-reps chart, nutrition
summary, body measurements).

**Food:** targets from Mifflin-St Jeor × activity ± goal, protein ~2 g/kg when
cutting (1.8 otherwise), fat ≥25%, carbs the rest. Optional training-day
calories: the setting is the *gap* between training and rest days, split
around the target so the weekly total is unchanged (owner explicitly wanted
e.g. 2,400 → ~2,450/2,250, not a big rest-day cut). Recipes, saved meals,
barcode scanning (Oct 2026: own camera loop + `BarcodeDetector`, native if it
supports EAN-13, else the free `barcode-detector` ponyfill = ZXing WebAssembly
from jsDelivr, cached by `sw.js`; EAN check digit + two matching reads before
accepting; html5-qrcode was dropped because it misread/failed on iPhone), water, weight trend (EMA, 10%/day).
**Weekly calorie check-in** estimates maintenance from 3 weeks of intake +
weight trend, max ±200 kcal/week. It needs ≥10 days of ≥800 kcal logged in the
last 21 and ≥4 weigh-ins spanning ≥10 days. It only *suggests*; the owner taps
to accept (fully automatic updates were offered, not chosen).
**Diet break** (`prefs.dietBreak`): in programme deload weeks `baseTargets()`
raises calories to `maintenanceKcal()` (latest check-in TDEE ≤35 days old,
else the formula), as carbs; the training-day split still applies on top.
Weekly check-ins pause during the break week and the week after (water
weight). **Protein ideas** card on the Food tab (today, when ≥15 g protein
and ≥100 kcal left): foods eaten in the last 4 weeks (as usually logged),
favourites and saved meals that fit the calories left, sorted by protein per
kcal; one tap adds them to the meal for the time of day.
**Trend only** (`prefs.trendOnly`, toggle on the Food weight card): after
logging, the day's reading is hidden everywhere (card, history list, chart
dots via `weightChart(pts, hide)`); only the trend is shown.
**Weekly budget** (Food tab, `weekBudget`): Mon–Sun sum of `targetsFor()`
vs eaten; past days under 800 kcal count as on target; shows kcal under/over
so far and the per-day adjustment for the rest of the week. Info only: daily
targets never change.

**Macro calculator** (Food tab button → `macroCalcModal`): general-purpose,
for other people (the owner wanted it for their girlfriend). Mifflin-St Jeor ×
activity, goals −750…+500 kcal, protein 1.6–2.2 g/kg (of goal weight when
that's lower), fat 25/30/35%, floor 1,200/1,500 kcal; cm or ft/in, kg or
st/lb. People can be saved (`state.food.calcPeople`), copied as text, or
applied as your own targets ("Use as my targets", with a confirm). It never
touches your targets otherwise.

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

## Garmin (Personal API, Oct 2026)

Garmin opened a **Personal API key** to individuals (~21 Oct 2026; created at
connect.garmin.com/app/settings/personalApiToken, shown once, user picks the
expiry). Token: `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token`
with `Authorization: ApiKey <key>` → access token valid 24 h. Data calls use
`Authorization: Bearer <token>` on the same host. Paths used (from a public
client library; query names are best guesses, parsers dig for known fields):
`/usersummary-service/usersummary/daily?calendarDate=` (steps, resting HR,
stress, Body Battery), `/sleep-service/sleep/dailySleep?date=`,
`/hrv-service/hrv/daily/{start}/{end}`. Range limits ~28–32 days (HRV 367).
**The key is never in the code, chat or backups**: pasted in History →
Settings → Garmin, stored in `localStorage['pot.garminKey']` (token in
`pot.garminToken`); synced numbers in `state.garmin.days[date] = {sleepH,
sleepScore, hrv, hrvLo, hrvHi, hrvStatus, rhr, bb, stress, steps}` (kept ~1 year).
Sync: on open/visible at most every 3 h (`garminAutoSync`), first sync backfills
14 days, "Sync now"; doesn't re-render while typing. `state.garmin.log` keeps the
last sync's statuses + reply starts for troubleshooting ("Show details",
never the key). **Untested against the real API from the sandbox** (proxy
blocks Garmin): if the phone gets `blocked` (no CORS for web apps), fall back
to a GitHub Actions job with the key as a repo secret that fetches daily and
commits the data **encrypted** with a passphrase (the repo is public).
Owner wears the Instinct 3 to bed; no Garmin scale (weight stays in the app).
Features: Workout-tab readiness card (`readiness()`: flags = sleep < 6 h or
>1.25 h under 7-day avg, HRV under Garmin's baseline or 0.9 × 28-day median,
resting HR ≥ +5 vs 28-day median, Body Battery < 30; 0 → Ready, 1 → Okay,
2+ → Take it easier; advice only, never changes targets); Stats "Garmin
recovery" card (6 tiles + 4-week steps bars with weight-trend line); weekly
recap "Garmin avg" line; programme check-in review shows 4-week averages vs
the block before.

## Ideas not done yet

Offered to the owner and not chosen (yet):
- Keep the screen awake during a workout (Wake Lock API) so the rest timer
  can alert; iOS pauses web timers when locked.
- Pinned per-exercise notes (seat height, machine, cue) shown every session.
- Exercise demo links (free YouTube links).
- Manual steps tracking alongside the weight trend.
- Fully automatic weekly calorie updates (keep the 200 kcal cap).
- "Copy the whole day" for food.
- CSV export of workouts and food.

Not possible or advised against:
- Apple Health sync: needs a native app. (Garmin is done via the Personal API.)
- Push notifications — need a server; not possible for free here.
- Progress photos stored in the app — would blow the ~5 MB storage and
  backups; the owner keeps them in the Photos app.
