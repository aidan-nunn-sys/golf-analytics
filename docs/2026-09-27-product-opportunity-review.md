# Product opportunity review — September 27, 2026

Status: recommendations and verification findings, not an approved feature spec or implementation commitment.

## Product direction

Build the golf companion that helps a player choose a shot, record it quickly,
understand the result, and practice the right thing next. Make the entire loop
usable with a private server and an unreliable connection. Data ownership,
transparent calculations, and a small private group are credible differentiators.

18Birdies already advertises GPS, scoring, statistics, games, watch support,
personalized club recommendations, strokes gained, swing analysis, and green maps.
Simply adding these names to a feature list is not a competitive advantage.
Our advantage should be a dependable, understandable experience without a
mandatory vendor account or subscription for the core application.

Official comparison sources checked on September 27, 2026:

- [18Birdies features](https://18birdies.com/features/)
- [18Birdies Premium](https://18birdies.com/premium/)
- [18Birdies Smart Tracking](https://help.18birdies.com/article/734-smart-tracking-automatic-shot-tracking-with-18birdies)

## What the repository already has

The current working tree has substantial uncommitted development. This review
evaluates that working tree, not just the latest commit. Existing application
changes were preserved.

| Area | Implemented foundation | Next meaningful gap |
| --- | --- | --- |
| Scoring | Unified Play screen, quick presets, undo, local saves, reconnect sync, conflict review | Less scrolling, obvious resume action, automated browser and real-phone checks |
| Offline | PWA shell, downloaded course starts, score recovery, queued GPS shots | Safe visible updates, field validation, larger transactional storage as shot data grows |
| Courses | OSM discovery, manual repair, CSV/JSON exchange, two official scorecard adapters, historical snapshots | Broader trusted coverage, green boundaries and usable hazard geometry |
| Range and bag | Carry/total separation, means, medians, consistency, direction counts and gapping | Source/date filters, distance distributions, partial-shot profiles, monitor imports |
| Round insights | Trends, GIR/fairways, penalties/putts, round report, unofficial handicap | Course/tee filters, recurring hole patterns, practice outcomes, strokes gained |
| Ownership | Course exports and device-round backups | Portable whole-account export and tested whole-instance recovery |
| Private groups | Admin-created accounts with player isolation | Invitations/administration UI, shared rounds, explicit sharing and side games |

Important implementation evidence:

- `backend/app/models/shot.py` stores club, hole, distances, direction and source.
  It does not store ordered shot endpoints, lie transitions or a holed-out state.
- `frontend/src/offline/storage.ts` retains GPS endpoints in device data. Server
  synchronization currently reduces these to shot distance/direction. Server
  history cannot reconstruct a full shot trace after device data is lost.
- `frontend/src/components/RoundMap.tsx` provides a basic OSM tile map and markers.
  A `hazards` field exists in the course model, but that does not constitute a
  usable hazard-aware strategy engine.
- `frontend/src/components/ScoringTrends.tsx` already offers putting and penalty
  suggestions. The missing capability is a richer, measurable practice loop.
- Local course/round backup is not equivalent to a complete server backup.

## Recommended work, in order

### 1. Make an actual round effortless

This is the prerequisite for every other feature.

- Put score presets, putts and Next within easy reach. Collapse the large GPS
  panel when GPS is off or the player selects a scoring-focused view.
- Show a prominent Resume round action on Home, including unsynced local rounds.
- Provide a pre-round readiness check: course and tees downloaded, bag available,
  GPS state, app shell cached, and pending data. Avoid making setup a recurring
  obstacle once the course is prepared.
- Add a visible build/version indicator and an Update available action. Preserve
  pending edits before switching workers, and avoid an automatic reload mid-hole.
- Add browser regression tests for offline reload, reconnect, two-tab edits,
  session expiry, shot retry, and a service-worker update during a pending round.

Acceptance: at 390×844 and 430×932, common scoring controls are usable without
scrolling through a disabled GPS hero. Score an entire demo round with the server
stopped; reload; reconnect; verify one round and no lost/duplicate scores or shots.
Then perform an actual iPhone Home Screen round, including lock/unlock and battery
observations. Browser success alone is not evidence of field readiness.

### 2. Build a useful yardage book and trusted course library

- Add editable green boundaries and front/center/back distances relative to the
  player's position. Label daily pin placement separately and only show it when
  entered or supplied by a trustworthy source.
- Add hazard near/far distances, required carries, and tap-to-measure layups.
- Let players retain personal hole notes across rounds and review how they have
  played that hole before.
- Separate source adapters from course validation. Track layout identity,
  rating category, provenance and freshness; preview corrections before applying.
- Support portable course packs. Begin with a small set of local courses that
  are complete and correct, then expand coverage.

Acceptance: a player can prepare an unfamiliar supported course, see which data
is missing, and use saved vector geometry without a server. Historical rounds
retain their original scorecard snapshots. Offline map imagery requires a
provider or self-hosted source that permits it; current OSM tiles are not an
offline download feature.

### 3. Add a transparent personal caddie

Start with existing bag data and a manually entered target distance. This can
deliver value before richer course geometry exists.

- Show typical carry and total, distance spread, sample count and recency.
- Separate full shots from punch shots, chips and deliberate partial swings.
  Never silently remove mishits; show what filtering changes.
- Suggest two plausible clubs with reasons and a clear insufficient-data state.
- Add wedge profiles for partial swings and reveal overlapping/gapped clubs.
- Later add wind/elevation adjustments with source timestamps, manual overrides,
  and an unadjusted fallback when inputs are missing or stale.
- Once reliable shot/target geometry exists, compare miss patterns against hazards
  and offer conservative or aggressive targets.

Example: “7 iron typically carries 151 yards across 24 full shots; 6 iron carries
163. To cover 155 yards of water, the longer club has more margin.” The interface
must distinguish an empirical distance range from a calibrated probability.

Acceptance: deterministic recommendation tests, explicit carry/total labels,
source filtering, unit conversion, low-sample behavior and offline bag access.
The current left/straight/right labels cannot support a true two-dimensional
dispersion ellipse; capture lateral offsets or target-relative geometry first.

### 4. Preserve shot history, then add strokes gained

This is the key data investment for long-term analytics.

- Add shot sequence, start/end coordinates with accuracy/timestamps, start/end
  lie, distance to target, penalties and holed-out state. Allow manual distances
  when GPS is unavailable, particularly around and on the green.
- Persist these fields on the server and in portable exports. Keep stable device
  identities, correction history and safe retry semantics.
- Build an editable shot timeline and hole replay before advanced scoring.
- Reconcile the timeline with hole scores and explain incomplete tracking.
- Then calculate off-the-tee, approach, short-game and putting strokes gained
  against a documented, versioned reference model with appropriate data rights.
  Provide a chosen comparison level and explicit coverage.

Acceptance: a replay survives a new device; corrections update downstream results;
missing shots are visible; penalty and holed-out cases have reference tests. Do
not infer precise putting distances from phone GPS or label raw score differences
as strokes gained. Existing rounds remain usable without invented shot details.

### 5. Connect analysis to practice and measure the result

- Add course/tee/date filters and repeat-hole trends.
- Turn supported patterns into a small weekly plan: drill, time budget, baseline,
  target and a follow-up measurement.
- Track putting distance-control drills, wedge ladders, approach windows and
  penalty-avoidance decisions with metrics appropriate to each activity.
- Import launch-monitor CSV through a preview and column-mapping flow, with units,
  club mapping, duplicate detection and explicit carry/total semantics.
- Add equipment comparisons and longitudinal progress once sample quality permits.

Acceptance: a player can follow a suggested drill, record its result, and compare
later performance on the same measure. Advice links to the actual rounds/shots
behind it. Limited data produces a request to collect a specific measurement,
not an unsupported diagnosis of swing mechanics.

An optional local or user-selected language model could explain calculated
findings later. Keep calculations deterministic and make external data sharing
opt-in; a hosted AI dependency should not be required for core advice.

### 6. Make switching and self-hosting easy

Treat this as continuous release work alongside the golf features.

- Add a versioned whole-account export: courses, tee snapshots, rounds, shots,
  range sessions, club history, notes and practice records.
- Import documented files that users legitimately have from other apps. Confirm
  available formats before promising an 18Birdies one-click migration.
- Document and test a consistent SQLite backup, secrets/config preservation,
  restore to a clean instance, and upgrade/rollback procedure.
- Add an admin UI for small-group accounts and deployment diagnostics. Review
  login throttling before recommending an internet-facing installation.
- Show installed version, backup status and server reachability without exposing
  credentials or precise location history in diagnostics.

Acceptance: restore into a fresh instance and verify account ownership, rounds,
shots and historical labels. An upgrade with an unsynced phone round must have
an exercised recovery path. An export must be usable outside this application.

## Later additions

Private multiplayer scoring and a small set of games are a good retention
feature for friends and family. Start with guest players, explicit sharing,
match play and skins; define offline score ownership/conflicts before adding
live leaderboards. Avoid building a public social network first.

Watch support is valuable but a separate distribution/hardware investment. The
current web-only direction and preference to avoid paid Apple distribution favor
finishing phone play first. Revisit wearables with explicit platform constraints.

Surveyed green contours and swing-video coaching should come later. Both require
new trustworthy inputs and meaningful validation; neither follows automatically
from the existing GPS or shot-distance data.

## Verification performed in this review

- Backend: `.venv/bin/python -m pytest -q --tb=short` passed (250 collected cases).
- Frontend: `npm test -- --reporter=dot` passed, 207 tests across 39 files.
- Production TypeScript/Vite build passed.
- Lint passed with two Fast Refresh warnings in `DistanceMode.tsx` and
  `AuthContext.tsx`. Frontend tests emitted an existing React `act` warning;
  backend tests emitted TestClient/AnyIO deprecation warnings.
- Used an isolated SQLite fixture in `/tmp`, synthetic rounds and range shots,
  and the connected Brave browser. No real user round was edited.
- Browser at `localhost:5174`: sign-in, dashboard, history, resume, quick score,
  reload, server-stopped score change/reload, and reconnect were exercised.
  Five strokes persisted to the fixture database; six strokes entered while
  disconnected survived reload and subsequently synchronized to the database.
- That browser origin displayed an older interface than the current source
  (notably the round report was absent). Treat these checks as evidence for the
  cached build's scoring/sync behavior, not proof that every latest UI feature
  was exercised. On a separate clean origin (`localhost:5176`), the current
  dashboard's carry/total selector and the full round report were confirmed.
  The current Play screen retained the same large inactive GPS panel. With this
  server stopped, changing the demo score to four strokes survived reload and
  displayed the expected pending-sync state. After restart, the UI reported
  synced and the isolated server database contained four strokes.

The large inactive GPS panel pushed scoring below the initial narrow-window view.
That is a usability finding, not a failing automated regression. The old-interface
observation requires further service-worker lifecycle diagnosis before declaring
a root cause. Real iPhone GPS/background behavior, physical battery use, Docker
deployment and end-to-end backup restoration were not verified here.

## Suggested first implementation slice

Start with **round readiness, quick scoring, and safe update visibility**, with
browser regression coverage. Follow with **bag distributions and a basic club
recommendation** using manual target distance. Those two increments produce
visible daily value while preparing the richer course and shot-data work.

Each feature should move through the repository's spec → plan → implementation
workflow. This review records recommendations and evidence; it does not mark any
of the proposed additions as implemented.
