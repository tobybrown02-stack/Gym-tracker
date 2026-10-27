# Overload Tracker

A single-file, mobile-first workout tracker that automatically calculates the
weight and reps for your next session using the **double progression** method.

Open `index.html` in any modern browser — no build step. Data is stored in the
browser's `localStorage` (use **History → Export** to back it up).

## Features

- **Workout** — today's scheduled routine with auto-calculated targets, set
  logging, a rest timer (starts when you tick a set, vibrates/beeps when done),
  warm-up sets and a barbell plate calculator, plus RPE and notes per exercise.
- **Plan** — up to 5 routines, a weekly repeating schedule, and a calendar
  where you can swap, skip or move any single day without changing the plan.
- **Stats** — weekly sets per muscle (vs a 10–20 set target), weekly volume
  trend, estimated 1RM chart per exercise, streaks and personal records.
- **Exercises** — a built-in library of 60+ common exercises to add in bulk, plus equipment type, rep range, working sets, rest time and the
  muscles worked (primary = 1 set, secondary = ½ set).
- **History** — every session with PR badges, export/import and settings.

## How targets are calculated

* **Working sets** are the sets done at the heaviest weight in a session;
  lighter sets count as warm-ups.
* **Rule 1 — hit the ceiling:** if every working set reached the top of the rep
  range (and you completed all planned working sets), the next session adds the
  smallest increment for the equipment and resets reps to the bottom of the range.
* **Rule 2 — below the ceiling:** the weight stays the same and the target is
  last session's rep total + 1. The extra rep goes on your weakest set.
* **Plateau:** if 3 sessions in a row fail to progress, the app offers a ~10%
  deload, rounded to the equipment step.

| Equipment | Increment / rounding |
|-----------|----------------------|
| Dumbbell  | 2 kg                 |
| Machine   | 3 kg or 4 kg (chosen per exercise) |
| Barbell   | 2.5 kg               |
