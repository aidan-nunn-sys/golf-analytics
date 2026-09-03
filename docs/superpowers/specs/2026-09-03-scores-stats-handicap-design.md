# Scores, Round Stats & Handicap (Pillar 3) — Design

> **Status:** v1 design — approved 2026-09-03; WHS rules verified against the 2024 Rules of Handicapping (§7). Builds on the completed Pillar 1 (`specs/2026-06-19-golf-analytics-design.md`) and Pillar 2 (`specs/2026-07-11-on-course-gps-course-management-design.md`) slices.

_Last updated: 2026-09-03_

---

## 1. Goal & scope

Turn the rounds we already record into a real scoring record: per-hole detail (fairways, putts, penalties) on top of the strokes Pillar 2 already captures, derived round statistics, the ability to enter **backlog rounds** played before the app existed, and a **World Handicap System Handicap Index** computed from that history.

This is the third of the four pillars in the main design doc's roadmap (§8). Pillar 2 already pulled strokes-per-hole forward, so this slice owns the rest of what the roadmap assigned to Pillar 3: "backlog rounds, handicap, GIR/fairways/putts."

The handicap engine is the centre of gravity. It is a published specification with worked examples, it reduces to pure functions over known inputs, and it therefore fits the repo's existing "TDD for the stats engine" convention exactly.

**Accuracy stance:** implement the Rules as written wherever they are knowable, and refuse to invent the parts that are not. Every constant here is cited to a rule and was verified against the 2024 Rules of Handicapping (§7). Two things WHS specifies cannot be computed outside the USGA — PCC and expected score (§2.3, §2.6) — and where a sanctioned substitute exists we take it and document it; where none exists, the round is excluded from the Index with a stated reason rather than approximated. An Index that is quietly wrong is worse than no Index, because you cannot tell by looking at it.

### Slice split

Following the Pillar 1 and 2 pattern, this spec covers both halves; they become two plans and two build cycles.

- **Plan 3a — backend:** data model, handicap package, round-stats engine, API.
- **Plan 3b — frontend:** tee/rating setup, scorecard stat entry, fast backlog entry, handicap screen.

Backend ships and is verified first.

## 2. The handicap engine

All rules below are cited to the *Rules of Handicapping*, effective January 2024, verified 2026-09-03 against the official PDF published by GolfRSA (`https://www.golfrsa.com/wp-content/uploads/2024/01/WHS_Rules_of_Handicapping_2024.pdf`). Rule numbers are that document's.

### 2.1 Definitions

**Score Differential**, for an 18-hole score — Rule 5.1a. Rounded to the nearest tenth, .5 upwards:

```
Score Differential = (113 / Slope Rating) × (Adjusted Gross Score − Course Rating − PCC)
```

PCC ranges −1.0 to +3.0 (Rule 5.6); we fix it at 0 (§2.6).

**Minus differentials** round *toward* zero — −1.54 → −1.5, −1.55 → −1.5, −1.56 → −1.6 (Rule 5.1c). This is not ordinary rounding and needs its own test.

**Handicap Index** — Rule 5.2b. The average of the lowest 8 of the most recent 20 Score Differentials, rounded to the nearest tenth, then subject to the caps in §2.4. Maximum 54.0 (Rule 5.3).

**Course Handicap** — Rule 6.1a, rounded to the nearest whole number:

```
Course Handicap = Handicap Index × (Slope Rating / 113) + (Course Rating − par)
```

**Maximum hole score.** Before an Index is established, par + 5 (Rule 3.1a). After, net double bogey (Rule 3.1b):

```
net double bogey = par + 2 + strokes received on that hole
```

Strokes received follows from Course Handicap and the hole's **stroke index**: one stroke on every hole whose stroke index is `≤ H`, an additional stroke on holes `≤ H − 18`, continuing upward. A plus-handicap player gives strokes back to the course **beginning at stroke index 18** — a +2 gives back on stroke indexes 18 and 17 (Appendix C).

**Hole started but not holed out** — Rule 3.3: record most likely score, or net double bogey, whichever is lower.

### 2.2 Fewer than 20 rounds

Rule 5.2a, verified verbatim. Three rounds is the minimum to establish an Index.

| Rounds | Differentials used | Adjustment |
|---|---|---|
| 3 | lowest 1 | −2.0 |
| 4 | lowest 1 | −1.0 |
| 5 | lowest 1 | 0 |
| 6 | average of lowest 2 | −1.0 |
| 7–8 | average of lowest 2 | 0 |
| 9–11 | average of lowest 3 | 0 |
| 12–14 | average of lowest 4 | 0 |
| 15–16 | average of lowest 5 | 0 |
| 17–18 | average of lowest 6 | 0 |
| 19 | average of lowest 7 | 0 |
| 20 | average of lowest 8 | 0 |

Fewer than 3 rounds → no Index. The API returns `null` plus a `rounds_needed` count; it never fabricates a number.

### 2.3 Partial rounds and the expected-score problem

Abandoned rounds are normal — rain, darkness, walking in after 13 — and Pillar 2's live round mode will produce them constantly, so the engine treats them as a first-class case.

The minimum hole counts are **not** what an earlier draft of this spec assumed:

- An 18-hole score requires a minimum of **10 holes** played (Rule 2.2a).
- A 9-hole score requires **all 9** holes played (Rule 2.2b). Ten to thirteen holes is an *18-hole* score, not a 9-hole one.

**The blocker.** Rule 3.2b says holes not played are valued using the player's **expected score**, and the 2024 revision specifically replaced the old net-par procedure with it. But the expected-score calculation is *not published*: the Rules define it (Definitions, p.13) and state only that it "is automated," and the USGA's FAQ describes it as derived from the average Score Differential for a given Handicap Index without giving the table or the formula. It is not available outside the USGA and R&A. Exact WHS is therefore not implementable here.

Clarification 3.2b/2 provides the escape for incomplete rounds: **net par** may be used in place of the expected score "only when approved by the Authorized Association." Since this Index is explicitly unofficial (§9), we self-authorize that substitution and document it here. Net par for a hole = par + strokes received on that hole.

No equivalent escape exists for converting a 9-hole score into an 18-hole differential (Rule 5.1b combines the 9-hole differential with the expected score over 9 holes), so that conversion is not attempted.

| Holes scored | Treatment |
|---|---|
| 18 | 18-hole differential |
| 10–17 | 18-hole differential; unplayed holes valued at **net par** (documented divergence, above) |
| 9 exactly | 9-hole differential computed and displayed, but **does not feed the Index** |
| < 9 | Not handicap-acceptable (Rule 5.1b). Still recorded, still produces round stats. |

A hole is "not played" when its `strokes` is `NULL`, which the model already allows.

The 9-hole Score Differential is still worth computing and showing, and is defined by Rule 5.1b — note the halved PCC term, and that it stays **unrounded** until combined:

```
9-hole Score Differential = (113 / 9-hole Slope) × (9-hole AGS − 9-hole Course Rating − 0.5 × PCC)
```

9-hole ratings are separate published values per tee, not half the 18-hole rating, which is what the `TeeRating` scopes in §3.1 exist for. A round that is not handicap-acceptable must say why by name — "9-hole rounds do not count toward the Index" or "only 7 holes scored" — never a silent null.

### 2.4 Soft cap and hard cap

Rule 5.8, measured against the **Low Handicap Index** (Rule 5.7):

- **Soft cap:** when the calculated Index exceeds the Low Index by more than 3.0, the excess above 3.0 is reduced by 50%.
- **Hard cap:** after the soft cap, the Index may not exceed the Low Index by more than 5.0.
- There is no limit on downward movement.

Two constraints that materially affect the build, both from Rule 5.7:

1. **A Low Handicap Index is established only once the player has at least 20 acceptable scores**, and Rule 5.8 states caps "start to take effect only after the Low Handicap Index has been established." Caps are therefore inert until the 20th round — real, but not observable early. Their tests must construct a 20+ round history rather than relying on manual play.
2. The Low Index is the lowest Index over the **365 days preceding the date of the most recent score in the record** — anchored to that score's date, not to today.

A cap must be visible, not silent: `GET /stats/handicap` reports whether a cap is applied and by how much.

### 2.5 Chronology, and why the engine replays history

AGS depends on Course Handicap → Handicap Index → the differentials of *earlier* rounds. Caps depend on the Low Index over the prior 365 days. Neither can be evaluated for a round in isolation.

**The engine therefore walks a player's rounds in date order, carrying Index and Low Index forward.** Each round is adjusted using the Index established by the rounds preceding it.

Nothing derived is persisted (§4.1). Raw hole scores are the single source of truth, so correcting a typo in a two-year-old round automatically repairs every downstream number, and a backdated round inserts correctly with no backfill logic.

For rounds played before an Index exists (the first three), hole scores cap at par + 5 (Rule 3.1a) rather than net double bogey. That branch gets its own tests.

### 2.6 Deferred or excluded

- **PCC (Playing Conditions Calculation)** — Rule 5.6 computes it from a field of same-day scores at the same course, which a self-hosted app for a few friends structurally cannot have. Fixed at `0`, kept as an explicit parameter in the differential signature (and as `0.5 × PCC` in the 9-hole form) so it can be supplied later without touching call sites.
- **Expected score** — unpublished; see §2.3. If the USGA ever publishes the table, net par is replaced in one function and 9-hole conversion becomes possible.
- **Exceptional score reduction** — Rule 5.9. Deferred.
- **Committee adjustments and penalty scores** — Rule 7. Not applicable to a personal record.
- **Competition/tournament scoring**, match play, Stableford.

## 3. Data model

### 3.1 New: tee sets and their ratings

Handicap arithmetic needs Course Rating, Slope Rating and par. `Course` and `Hole` carry none of them, and **OpenStreetMap does not publish them** — the Pillar 2 importer (`routers/courses.py`) reads only hole number, par, green coordinates and hazards, and even par is nullable because OSM often omits it. These values live in national association databases with no open API, so they are **entered by hand** (§5).

Ratings differ per tee, and 9-hole differentials need separate front/back ratings (§2.3), so they get their own tables:

```
TeeSet
  id         int  pk
  course_id  int  fk -> courses.id
  name       str          # "Blue", "White", "Championship"
  yardage    int | None

TeeRating
  id            int  pk
  tee_set_id    int  fk -> tee_sets.id
  scope         str          # "18" | "front9" | "back9"
  course_rating float
  slope_rating  int          # 55–155
  par           int
  unique (tee_set_id, scope)
```

A child table rather than nine nullable columns on `TeeSet`: the engine's actual question is "give me the rating for this scope," which becomes one lookup, and "does this tee support 9-hole scoring" becomes "does a `front9`/`back9` row exist" instead of a three-column null check.

`Hole` gains one field:

```
  stroke_index  int | None   # 1..18; required before a round is handicap-acceptable
```

Stroke index can technically vary by tee and gender. Keeping it on `Hole` is a deliberate simplification; if it ever matters it moves to a `HoleTee` join without touching the engine, which only ever receives stroke index as an argument.

### 3.2 Round: snapshot the rating

```
Round gains:
  tee_set_id     int | None   fk -> tee_sets.id
  hole_count     int          default 18       # 9 or 18: which rating scope the round is played against
  nine           str | None                    # "front" | "back", required when hole_count == 9
  # snapshotted at round creation from the applicable TeeRating; never read live:
  course_rating  float | None
  slope_rating   int   | None
  course_par     int   | None
```

`Round.status` gains `abandoned` alongside the existing `in_progress` and `completed`, so a walked-off round stops looking like a round still in progress. Acceptability is derived from the holes actually scored (§2.3), never from status.

`hole_count` and `nine` declare which rating scope the round is played against — an 18-hole round snapshots the `18` rating, a nine snapshots `front9` or `back9`. They are fixed when the round starts and are not re-derived from how many holes ended up scored: an 18-hole round abandoned at hole 12 remains an 18-hole round against the 18-hole rating, with holes 13–18 valued at net par. This is the whole reason the thresholds in §2.3 are expressed as "holes scored" against a round whose scope is already known. A round whose tee has no `TeeRating` for its scope is not handicap-acceptable, and `GET /rounds/{id}/stats` says so by name ("this tee has no front-9 rating").

**The snapshot is the load-bearing decision.** Courses get re-rated. If differentials read live from `TeeRating`, re-rating a course silently rewrites scoring history and the Index changes for a round played two years ago. Copying rating/slope/par onto the `Round` at creation makes history immutable — the same instinct as the existing "distances are canonically yards" rule: pin what must not drift.

### 3.3 RoundHole: the stat detail

```
RoundHole gains:
  fairway_hit  bool | None   # null on par 3s, and when not recorded
  putts        int  | None
  penalties    int           default 0
```

**GIR is not stored.** It is derived: a green is hit in regulation when `strokes − putts ≤ par − 2`, which follows from putts being exactly the strokes taken on the green. Same for scrambling and fairway percentage. This keeps the slice inside the existing derived-stats convention.

### 3.4 Migration

One Alembic migration: `tee_sets` and `tee_ratings` tables; five columns on `rounds`; three on `round_holes`; one on `holes`. Every new column is nullable or defaulted, so existing Pillar 2 rounds survive — they simply are not handicap-acceptable until a tee set is attached. Must be verified against a fresh DB *and* on top of the existing four-migration chain.

## 4. Module structure

### 4.1 Handicap package

Pure functions, no DB access, no ordering knowledge except in `history.py`:

```
app/stats/handicap/
  strokes.py        strokes received from stroke index; net double bogey; par+5 fallback; net par fill
  differential.py   adjusted gross score; score differential; 9-hole handling
  index.py          best-8-of-20; the §2.2 table; soft/hard cap; Low Index from a window
  history.py        the chronological walk — the ONLY module that knows about ordering
```

Each file is testable in isolation against published worked examples. `history.py` is the single place sequencing lives; everything else takes explicit arguments and returns a number, which is what makes the worked examples usable as fixtures.

### 4.2 Round statistics

`app/stats/round_stats.py`, mirroring the existing `engine.py` style:

| Stat | Definition |
|---|---|
| Score / to-par | sum of strokes vs. sum of par |
| Fairways in regulation | fairways hit ÷ par-4-and-5 holes (par 3s excluded from the denominator) |
| Greens in regulation | holes where `strokes − putts ≤ par − 2` |
| Putts | total, per round, and **per GIR** — the honest putting metric, since putts-per-round rewards missing greens |
| 1-putts / 3-putts | counts |
| Scrambling | of holes missing GIR, the share still made in par or better |
| Penalties | total per round |

Holes with missing data are excluded from that stat's denominator rather than counted as zero — a partially-filled scorecard must never report 0% fairways.

## 5. Course setup and backlog entry

Both flows exist because the handicap is worthless without data, and both are manual by necessity.

**Course rating setup.** Per course, per tee: name, then rating/slope/par for 18 (and optionally front9/back9), then 18 stroke indexes. Roughly 20 numbers per tee, once. The form should accept the whole tee in one submission and validate before saving: stroke indexes must be a permutation of 1–18, slope must be 55–155, and hole pars must sum to the stated par. Catching a transposed stroke index at entry is far cheaper than discovering it in a differential months later.

**Backlog rounds.** A backlog round is a `Round` created directly in `completed` status with hole scores supplied up front and no GPS involvement. Two depths, because demanding full stat detail for a round from last summer guarantees the feature goes unused:

- **Score only** — hole scores and nothing else. Sufficient for a valid differential.
- **Full detail** — plus fairway/putts/penalties per hole, feeding the stat trends.

Both go through the same `POST /rounds` path with inline holes, not a parallel code path. The design target is **entering a past round in under a minute**: pick course/tee/date, then a single score grid with keyboard-friendly numeric entry and no per-hole navigation.

## 6. API surface

All under `/api`, all scoped to `current_user`.

**Tees & ratings**
- `GET|POST /courses/{id}/tees` · `PATCH|DELETE /tees/{id}`
- `PUT /tees/{id}/ratings/{scope}` — upsert the 18/front9/back9 rating
- `PUT /courses/{id}/stroke-index` — all 18 at once, validated as a permutation

**Rounds** (extending Pillar 2)
- `POST /rounds` — gains `tee_set_id`, `hole_count`, `nine`, and optional `status: completed` + inline holes for backlog entry
- `PATCH /rounds/{id}/holes/{number}` — gains `fairway_hit`, `putts`, `penalties`
- `GET /rounds/{id}/stats` — the §4.2 table for one round, plus its Score Differential and whether it was handicap-acceptable (with the reason if not)

**Handicap & trends**
- `GET /stats/handicap` — current Index (or `null` + `rounds_needed`), the last 20 differentials flagged with which 8 counted, Low Index, whether a cap is applied and by how much, and the Index trend over time
- `GET /stats/rounds` — §4.2 stats aggregated across the last *N* rounds, with trend

## 7. Rule verification (completed 2026-09-03)

Every WHS constant in this spec was checked against the *Rules of Handicapping* effective January 2024, read from the official GolfRSA PDF. Three items in the first draft were wrong and are corrected above.

| Item | Rule | Result |
|---|---|---|
| Fewer-than-20 table | 5.2a | ✅ Verbatim match |
| 18-hole Score Differential formula | 5.1a | ✅ Confirmed |
| Course Handicap formula | 6.1a | ✅ Confirmed |
| Net double bogey; par + 5 pre-Index | 3.1b, 3.1a | ✅ Confirmed |
| Soft cap 3.0 / 50%, hard cap 5.0 | 5.8 | ✅ Confirmed |
| Maximum Handicap Index 54.0 | 5.3 | ✅ Confirmed |
| Minimum holes for an 18-hole score | 2.2a | ❌ **10**, not 14 as drafted |
| 10–13 hole rounds | 2.2a, 2.2b | ❌ These are 18-hole scores; a 9-hole score needs all 9 |
| Value for holes not played | 3.2b, 3.2b/2 | ❌ Expected score, not net par; net par permitted only by approval |
| Caps require an established Low Index | 5.7, 5.8 | ⚠ Inert until 20 acceptable scores |
| Low Index window | 5.7 | ⚠ 365 days before the *most recent score's* date |
| 9-hole differential, halved PCC, unrounded until combined | 5.1b | ⚠ Recorded but excluded from the Index (§2.3) |
| Minus differentials round toward zero | 5.1c | ⚠ Not ordinary rounding; needs its own test |
| Hole started, not holed out | 3.3 | ⚠ Most likely score or net double bogey, whichever lower |
| Expected score table | Definitions p.13 | 🚧 **Unpublished**; not obtainable outside USGA/R&A |

The Rules document contains worked examples (for instance Clarification 5.2a/1: differentials 15.3, 15.2, 16.6 → Index 13.2) which become test fixtures for the handicap package directly.

## 8. Screens (routes)

- **`TeeSetup`** (new, under `CourseDetail`) — tee sets, ratings per scope, stroke index grid with permutation validation.
- **`RoundEntry`** (new) — fast backlog entry: course/tee/date, then a score grid; optional stat detail.
- **`Handicap`** (new) — the Index, the 20-differential table with the counting 8 highlighted, Low Index, any active cap and why, and a trend chart.
- **`RoundSummary`** (exists) — extend the scorecard with fairway/putts/penalty entry and a derived stat strip.
- **`LiveRound`** (exists) — optional one-tap putts/fairway capture per hole, kept fast enough not to slow play.
- **`Dashboard`** (exists) — add the Index and a recent-form line.

## 9. Out of scope

- Strokes gained, learning profile, club recommendations — **Pillar 4**.
- PCC and exceptional score reduction (§2.6).
- Launch-monitor CSV import — Pillar 1.1.
- CSV/API import of scoring history from other apps — deferred; hand entry only for now, revisit once a real export format is in hand.
- Sand saves and up-and-down from bunkers — needs lie tracking; revisit with Pillar 4.
- Posting scores to a real handicap authority. This Index is for personal use and is explicitly **not** a licensed WHS record; the UI must say so plainly.

## 10. Decision log

- 2026-09-03 — Pillar 3 spec drafted. Scope: tee sets and ratings, per-hole stat detail, derived round stats, backlog rounds, WHS Handicap Index. Split into backend (Plan 3a) and frontend (Plan 3b) per the Pillar 1/2 pattern.
- 2026-09-03 — Course Rating, Slope and stroke index are **not obtainable from OSM** and have no open API. Accepted manual entry (~20 numbers per tee, once) in exchange for a genuinely correct Index, over the alternatives of a simplified handicap or a stats-only slice.
- 2026-09-03 — Ratings live on `TeeSet` + `TeeRating` rather than on `Course`: rating/slope/par differ per tee, and 9-hole play needs separate front/back values. A child table keyed by scope beats nine nullable columns.
- 2026-09-03 — Course rating/slope/par are **snapshotted onto `Round`** at creation. Re-rating a course must not retroactively rewrite scoring history.
- 2026-09-03 — Full WHS accuracy chosen over approximation, including soft/hard caps (§2.4). PCC excluded as structurally impossible for this deployment (Rule 5.6 needs a field of same-day scores); kept as an explicit parameter defaulting to 0.
- 2026-09-03 — Rating scope is **declared** by the round's `hole_count`/`nine` and fixed at creation, not re-derived from how many holes ended up scored. An 18-hole round abandoned at hole 12 stays an 18-hole round. A missing `TeeRating` for the declared scope makes the round non-acceptable with a named reason rather than a silent null.
- 2026-09-03 — **Corrected after rule verification.** Partial rounds are first-class, but the thresholds in the first draft were wrong: an 18-hole score needs a minimum of 10 holes (Rule 2.2a, not 14), and a 9-hole score needs all 9 (Rule 2.2b) — so 10–13 holes is an 18-hole score, not a 9-hole one. `Round.status` gains `abandoned`.
- 2026-09-03 — **Approach A (pure recomputation)** chosen over a materialized ledger or hybrid read model: the engine replays history chronologically on each request. Matches the existing derived-stats convention, makes backdated inserts and corrections self-healing, and is trivially cheap at this data volume. Revisit only if profiling demands it.
- 2026-09-03 — Handicap logic is a package of pure modules (`strokes`, `differential`, `index`, `history`), with ordering knowledge confined to `history.py`, so USGA worked examples can serve directly as fixtures.
- 2026-09-03 — GIR, scrambling and fairway percentage are derived from `strokes − putts` vs. par, not stored, per the existing derived-stats convention.
- 2026-09-03 — Backlog history is hand-entered; CSV import from other apps deferred until a real export format is available. Entry form targets under a minute per round.
- 2026-09-03 — Stroke index lives on `Hole`, not per tee — accepted simplification, movable to a `HoleTee` join without touching the engine.
- 2026-09-03 — Holes not played are valued at **net par**, a documented divergence from Rule 3.2b (which specifies the expected score). Clarification 3.2b/2 permits net par with Authorized Association approval; since this Index is explicitly unofficial, we self-authorize and record it. Swappable in one function if the expected-score table is ever published.
- 2026-09-03 — The **expected-score calculation is unpublished** and unavailable outside the USGA/R&A, so exact WHS is not implementable. Consequence: standalone 9-hole rounds get a 9-hole differential computed and displayed (Rule 5.1b) but **do not feed the Index**, shown with a named reason. Rejected alternatives — the pre-2024 pairing method (diverges from current rules, pairs rounds across different days and conditions) and approximating the expected differential (invents a number the spec's own accuracy stance forbids).
- 2026-09-03 — Soft/hard caps are **inert until 20 acceptable scores**, because Rule 5.7 establishes a Low Handicap Index only at 20+ and Rule 5.8 gates caps on it. Their tests must construct a 20+ round history rather than relying on played rounds. Low Index window is the 365 days preceding the most recent score's date.
- 2026-09-03 — **All WHS constants verified** against the Rules of Handicapping effective January 2024 (official GolfRSA PDF), read directly rather than from secondary summaries. Results, including the three corrections above, are tabulated in §7 with rule citations. Rule 5.1c minus-differential rounding (toward zero) and Rule 3.3 (most likely score or net double bogey, whichever lower) were picked up during verification and added.
