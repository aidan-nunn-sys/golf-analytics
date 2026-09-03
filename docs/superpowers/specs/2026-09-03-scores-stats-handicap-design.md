# Scores, Round Stats & Handicap (Pillar 3) — Design

> **Status:** v1 design — draft, awaiting approval. Builds on the completed Pillar 1 (`specs/2026-06-19-golf-analytics-design.md`) and Pillar 2 (`specs/2026-07-11-on-course-gps-course-management-design.md`) slices.

_Last updated: 2026-09-03_

---

## 1. Goal & scope

Turn the rounds we already record into a real scoring record: per-hole detail (fairways, putts, penalties) on top of the strokes Pillar 2 already captures, derived round statistics, the ability to enter **backlog rounds** played before the app existed, and a **World Handicap System Handicap Index** computed from that history.

This is the third of the four pillars in the main design doc's roadmap (§8). Pillar 2 already pulled strokes-per-hole forward, so this slice owns the rest of what the roadmap assigned to Pillar 3: "backlog rounds, handicap, GIR/fairways/putts."

The handicap engine is the centre of gravity. It is a published specification with worked examples, it reduces to pure functions over known inputs, and it therefore fits the repo's existing "TDD for the stats engine" convention exactly.

**Accuracy stance:** implement WHS properly rather than approximating it — including 9-hole scores and the soft/hard caps. The one deliberate omission is PCC (§2.6). An Index that is quietly wrong is worse than no Index, because you cannot tell by looking at it.

### Slice split

Following the Pillar 1 and 2 pattern, this spec covers both halves; they become two plans and two build cycles.

- **Plan 3a — backend:** data model, handicap package, round-stats engine, API.
- **Plan 3b — frontend:** tee/rating setup, scorecard stat entry, fast backlog entry, handicap screen.

Backend ships and is verified first.

## 2. The handicap engine

### 2.1 Definitions

For each acceptable round:

```
Score Differential = (113 / Slope Rating) × (Adjusted Gross Score − Course Rating − PCC)
```

**Handicap Index** = the average of the lowest 8 of the most recent 20 Score Differentials, truncated to one decimal, capped at 54.0, then subject to the caps in §2.4.

**Course Handicap** = `Handicap Index × (Slope Rating / 113) + (Course Rating − Par)`, rounded to the nearest whole number. This is the number of strokes received on that course from that tee.

**Adjusted Gross Score (AGS)** caps each hole at **net double bogey**:

```
net double bogey = par + 2 + strokes received on that hole
```

Strokes received on a hole is a function of Course Handicap and the hole's **stroke index** (its 1–18 difficulty ranking): a player with Course Handicap `H` receives one stroke on every hole whose stroke index is `≤ H`, and an additional stroke on holes whose stroke index is `≤ H − 18`, continuing for higher handicaps. Negative (plus) handicaps remove strokes from the hardest holes.

### 2.2 Fewer than 20 rounds

WHS defines a lookup table for players holding 3–19 acceptable scores, which both shrinks the "lowest N" window and applies an adjustment. Three rounds is the minimum to establish an Index.

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

### 2.3 Partial and 9-hole rounds

Abandoned rounds are normal — rain, darkness, walking in after 13. The app will produce them constantly via Pillar 2's live round mode, so the engine treats them as a first-class case rather than an error.

| Holes played | Treatment |
|---|---|
| 18 | 18-hole differential |
| 14–17 | 18-hole differential; unplayed holes recorded as **net par** (par + strokes received) |
| 10–13 | 9-hole score |
| 9 | 9-hole score |
| < 9 | Not handicap-acceptable. Still recorded, still produces round stats. |

A hole is "not played" when its `strokes` is `NULL`, which the model already allows.

`hole_count` and `nine` on `Round` record what the player *intended* to play. The scope actually used for rating and differential is decided by the holes with a recorded score, not by that intent:

- 14+ holes scored → the `18` rating.
- 9–13 holes scored → a 9-hole rating, chosen by which nine the scored holes fall in (holes 1–9 → `front9`, holes 10–18 → `back9`). A round spanning both nines is scored against the nine holding the majority of played holes; ties take `front9`.
- A round whose tee has no rating for the required scope is not handicap-acceptable, and `GET /rounds/{id}/stats` says so by name ("this tee has no front-9 rating") rather than returning a silent null.

9-hole scores use **9-hole Course and Slope Ratings**, which are separate published values per tee — roughly half the 18-hole rating, but not derivable from it by division. This is what drives the `TeeRating` table in §3.1.

> **⚠ Must verify before Plan 3a (§7).** The 2024 revision of the *Rules of Handicapping* changed how a 9-hole score becomes part of the Index. The older scheme paired two 9-hole differentials into one 18-hole differential; the newer scheme scales a single 9-hole score up on its own. This spec does not state which applies or the exact arithmetic, because getting it wrong would be invisible. Confirm against the current Rules, record the citation here, then write the plan.

### 2.4 Soft cap and hard cap

WHS limits how fast an Index may rise, measured against the player's **Low Handicap Index** — their lowest Index over the preceding 12 months.

- **Soft cap:** once the calculated Index exceeds the Low Index by more than 3.0, the excess above 3.0 is reduced by 50%.
- **Hard cap:** the Index may never exceed the Low Index by more than 5.0.

Caps apply after the §2.2 calculation. The Low Index is itself derived from the same chronological walk (§2.5) — it is a rolling minimum over a 12-month window, not a stored field, so it inherits the same recompute-from-source guarantee as everything else.

A cap must be visible, not silent: `GET /stats/handicap` reports whether a cap is currently applied and by how much, so the number is explainable.

### 2.5 Chronology, and why the engine replays history

AGS depends on Course Handicap → Handicap Index → the differentials of *earlier* rounds. Caps depend on the Low Index over the prior 12 months. Neither can be evaluated for a round in isolation.

**The engine therefore walks a player's rounds in date order, carrying Index and Low Index forward.** Each round is adjusted using the Index established by the rounds preceding it.

Nothing derived is persisted (§4.1). Raw hole scores are the single source of truth, so correcting a typo in a two-year-old round automatically repairs every downstream number, and a backdated round inserts correctly with no backfill logic.

For rounds played before an Index exists (the first three), WHS caps hole scores at **par + 5** rather than net double bogey. That branch gets its own tests.

### 2.6 Deferred

- **PCC (Playing Conditions Calculation)** — requires a field of same-day scores at the same course, which a self-hosted app for a few friends structurally cannot have. Fixed at `0`, but kept as an explicit parameter in the differential signature so it can be supplied later without touching call sites.
- **Exceptional score reduction.**
- **Competition/tournament scoring**, match play, Stableford.

## 3. Data model

### 3.1 New: tee sets and their ratings

Handicap arithmetic needs Course Rating, Slope Rating and par. `Course` and `Hole` carry none of them, and **OpenStreetMap does not publish them** — the Pillar 2 importer (`routers/courses.py`) reads only hole number, par, green coordinates and hazards, and even par is nullable because OSM often omits it. These values live in national association databases with no open API, so they are **entered by hand** (§5).

Ratings differ per tee, and 9-hole play needs separate front/back ratings, so they get their own tables:

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
  hole_count     int          default 18       # 9 or 18 as intended when started
  nine           str | None                    # "front" | "back", only when hole_count == 9
  # snapshotted at round creation from the applicable TeeRating; never read live:
  course_rating  float | None
  slope_rating   int   | None
  course_par     int   | None
```

`Round.status` gains `abandoned` alongside `in_progress` and `complete`, so a walked-off round stops looking like a round still in progress. Acceptability is derived from holes actually played (§2.3), not from status.

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

**Backlog rounds.** A backlog round is a `Round` created directly in `complete` status with hole scores supplied up front and no GPS involvement. Two depths, because demanding full stat detail for a round from last summer guarantees the feature goes unused:

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
- `POST /rounds` — gains `tee_set_id`, `hole_count`, `nine`, and optional `status: complete` + inline holes for backlog entry
- `PATCH /rounds/{id}/holes/{number}` — gains `fairway_hit`, `putts`, `penalties`
- `GET /rounds/{id}/stats` — the §4.2 table for one round, plus its Score Differential and whether it was handicap-acceptable (with the reason if not)

**Handicap & trends**
- `GET /stats/handicap` — current Index (or `null` + `rounds_needed`), the last 20 differentials flagged with which 8 counted, Low Index, whether a cap is applied and by how much, and the Index trend over time
- `GET /stats/rounds` — §4.2 stats aggregated across the last *N* rounds, with trend

## 7. Verify before writing Plan 3a

These are transcribed from memory of a published standard. A transcription error would be silent, so each must be checked against the current *Rules of Handicapping* and the citation recorded in this spec before the plan is written:

1. The §2.2 fewer-than-20 table (windows and adjustments).
2. 9-hole handling under the 2024 revision — pair-and-combine vs. scale-up, and the exact arithmetic (§2.3).
3. Soft/hard cap thresholds (3.0 / 50% / 5.0) and whether caps apply before or after the 54.0 ceiling.
4. Net par fill for 14–17 hole rounds, and the 10-hole boundary for 9-hole treatment.
5. The par + 5 cap for players without an established Index.
6. Rounding and truncation rules — where WHS truncates versus rounds, and to how many decimals.

USGA worked examples become the test fixtures for the handicap package; the engine's pure-function shape exists partly to make them usable directly.

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
- 2026-09-03 — Full WHS accuracy chosen over approximation, including 9-hole scores (§2.3) and soft/hard caps (§2.4). PCC excluded as structurally impossible for this deployment; kept as an explicit parameter defaulting to 0.
- 2026-09-03 — Rating scope for a round is chosen from the holes actually scored, not from the player's stated `hole_count`/`nine`; a round spanning both nines uses the nine holding most played holes, ties to `front9`. A missing rating for the required scope makes the round non-acceptable with a named reason rather than a silent null.
- 2026-09-03 — Partial rounds are first-class: 14–17 holes fill unplayed holes with net par; 10–13 become 9-hole scores; under 9 is stats-only. `Round.status` gains `abandoned`.
- 2026-09-03 — **Approach A (pure recomputation)** chosen over a materialized ledger or hybrid read model: the engine replays history chronologically on each request. Matches the existing derived-stats convention, makes backdated inserts and corrections self-healing, and is trivially cheap at this data volume. Revisit only if profiling demands it.
- 2026-09-03 — Handicap logic is a package of pure modules (`strokes`, `differential`, `index`, `history`), with ordering knowledge confined to `history.py`, so USGA worked examples can serve directly as fixtures.
- 2026-09-03 — GIR, scrambling and fairway percentage are derived from `strokes − putts` vs. par, not stored, per the existing derived-stats convention.
- 2026-09-03 — Backlog history is hand-entered; CSV import from other apps deferred until a real export format is available. Entry form targets under a minute per round.
- 2026-09-03 — Stroke index lives on `Hole`, not per tee — accepted simplification, movable to a `HoleTee` join without touching the engine.
- 2026-09-03 — WHS constants and rules in this spec are transcribed from memory and are listed in §7 as must-verify items before Plan 3a is written.
