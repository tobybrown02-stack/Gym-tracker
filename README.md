# Overload Tracker

A single-file, mobile-first workout tracker that automatically calculates the
weight and reps for your next session using the **double progression** method.

Open `index.html` in any modern browser — no build step. Data is stored in the
browser's `localStorage` (use **History → Export** to back it up).

## How targets are calculated

* **Working sets** are the sets done at the heaviest weight in a session;
  lighter sets count as warm-ups.
* **Rule 1 — hit the ceiling:** if every working set reached the top of the rep
  range (and you completed all planned working sets), the next session adds the
  smallest increment for the equipment and resets reps to the bottom of the range.
* **Rule 2 — below the ceiling:** the weight stays the same and the target is
  last session's rep total + 1. The extra rep goes on your weakest set.

| Equipment | Increment / rounding |
|-----------|----------------------|
| Dumbbell  | 2 kg                 |
| Machine   | 3 kg or 4 kg (chosen per exercise) |
| Barbell   | 2.5 kg               |
