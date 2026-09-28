# Next product milestones — September 27, 2026

This is a follow-up assessment of the current working tree, after the play-readiness
and basic club-advice increment. It is a recommendation, not an approved feature
spec or an implementation commitment. Existing uncommitted development was preserved.

## Product recommendation

Build a private golf companion that connects **choose a shot → record the result
→ understand the round → practice → measure improvement**. Reliable offline play,
clear explanations and practical data ownership should run through that loop.

18Birdies already advertises club recommendations, games, advanced analytics and
automatic tracking. These feature names alone will not distinguish this project.
The opportunity is an integrated experience for an individual or small private group,
with a useful core that can run on their own server. Competitor claims were checked
against the official [feature overview](https://18birdies.com/features/),
[Premium page](https://18birdies.com/premium/), and
[Smart Tracking documentation](https://help.18birdies.com/article/734-smart-tracking-automatic-shot-tracking-with-18birdies).

The earlier review's compact scoring, Home resume, readiness, explicit updates and
basic bag distributions are now implemented. They should be hardened and extended,
not counted as missing features again.

## Recommended order

| Priority | Addition | Player benefit | Scope and dependencies |
| --- | --- | --- | --- |
| 1 | Yardage book and club advice inside Play | Understand the hole and choose a club without leaving the round | Bring existing advice into Play first; then editable green boundaries, front/center/back distances, hazard carries, tap-to-measure layups and persistent personal hole notes. |
| 2 | Durable shot timeline and hole replay | Review every shot on another device and correct tracking mistakes | Persist ordered endpoints, location accuracy, timestamps, lie, target/distance, penalties, shot intent and holed-out state; support manual distances, correction and export. |
| 3 | Strokes gained and a measurable practice plan | Know where strokes are lost and whether practice is helping | Build on the timeline with a documented, versioned reference model and tracking coverage; link each priority to evidence, a drill and a follow-up measurement. |
| 4 | Trusted course packs and better onboarding | Prepare a new course in minutes | Expand beyond the two official scorecard adapters; preserve layout, tee/rating identity, provenance, freshness and edit previews. Download vector geometry with the scorecard. |
| 5 | Range imports and a richer personal bag | Make recommendations useful without laborious manual entry | CSV preview/column mapping, units, deduplication, club mapping, full/partial swing tags, wedge matrix, date/source filters and equipment history. |
| 6 | Private groups and lightweight games | Give friends a reason to use the same app | Guest players, shared scorecards, match play and skins first; explicit score ownership and offline conflict handling before live leagues. |
| Continuous | Whole-account portability and dependable operation | Make self-hosting a benefit a player can trust | Versioned exports, consistent database backups, clean-instance restoration, tested upgrades, simple admin UI and browser regression automation. |

Priority 1 can ship in small increments. Hazard-aware aiming and weather adjustments
come after reliable geometry and richer shot samples. A nearest-median club is not
a prediction that a shot will carry a hazard. Preserve missing-data states and show
the measurements behind recommendations.

## The first concrete increment

Start with **club advice in Play and a personal hole notebook**:

- Reuse the existing account-scoped offline bag profile and recommendation function.
- Offer advice for the available green-center distance or a manual target, with
  explicit carry/total semantics and a manual fallback when GPS is missing or stale.
- Keep quick scoring accessible and show sample counts, recorded range and recency.
- Separate reusable course/hole strategy notes from observations about a particular
  round's pin position, pace or weather. Surface previous visits to the current hole.
- Avoid presenting distance-only recommendations as hazard-aware strategy.

Then add editable course geometry and a portable yardage book. Define the first
supported courses and complete their geometry before promising broad coverage.
Map imagery availability is a separate dependency from saved vector geometry.

Acceptance: a golfer opens an already downloaded round, gets useful advice with the
server stopped, records a score, navigates holes and sees the appropriate saved
personal note. Existing missing-data, unit conversion, account isolation and
score-sync behavior must remain correct.

In parallel with subsequent feature planning, design the server shot record so new
measurements stop losing the information needed for replay and future analytics.
Do not invent coordinates, lies or shot sequences for historical distance-only shots.

## Important repository evidence

- `frontend/src/routes/OnCourseRound.tsx` provides Score, Green and Shots tabs.
  Club advice is a separate route under More in the mobile navigation.
- `frontend/src/bagAdvice.ts` ranks up to two clubs by distance from the recorded
  median, with at least five samples. It does not model hazards, lie or weather.
- `backend/app/models/shot.py` has distances, club, hole, direction, source and
  device identity, but lacks ordered positions, lie transitions and holed-out state.
- `backend/app/routers/offline.py` accepts GPS start/end coordinates and computes
  total distance, but the server Shot row does not retain those endpoints.
  Durable server replay therefore requires a schema change, even though device
  records already retain coordinates.
- `frontend/src/components/RoundMap.tsx` renders tiles and markers;
  `DistancePanel.tsx` calculates green-center distance. A `hazards` JSON field in
  the course model is not a complete hazard-distance feature.
- Green notes currently belong to the round. A reusable personal course notebook
  needs its own identity and lifecycle.
- Existing automated frontend tests run in jsdom. There is no checked-in browser
  end-to-end suite or repository CI workflow in the inspected tree.

## Verification and correction in this follow-up

- Backend suite: 254 cases passed outside the sandbox. The sandboxed TestClient run
  stalled and was stopped. Existing FastAPI/Starlette/AnyIO deprecations remain.
- Frontend baseline: 218 tests across 46 files passed. Production TypeScript/Vite
  build passed. Lint passed with the two existing Fast Refresh warnings; an existing
  React `act` warning was also present in the test output.
- Used the connected Brave browser, a production bundle, synthetic review data and
  an isolated SQLite database in `/tmp`. No real golf database was edited.
- Fresh-origin browser checks at `127.0.0.1:5191` covered sign-in, Home resume,
  scoring, putts, next/previous hole, reload and club advice.
- At 390×844, quick score presets, strokes, putts and Next were visible together.
- Four strokes and two putts survived an online reload. With the isolated server
  stopped, five strokes were acknowledged as saved on device, survived reload, and
  subsequently synchronized. A read-only database check confirmed `(5, 2)` for
  the synthetic round's first hole after reconnect.
- An immediate click-and-reload attempt before the local-save acknowledgment
  returned the preceding score. The acknowledged-save scenario passed. Add the
  rapid reload/close boundary to future browser regression coverage; this observation
  alone does not establish a lost acknowledged save.
- A 150-yard carry target returned the synthetic 7 iron and 8 iron, with distances,
  sample counts and recency.
- Fixed a visible form defect in `frontend/src/routes/BagAdvice.tsx`: the three
  controls used an undefined `input` CSS class. They now use the existing `field`
  class, giving the empty target input a visible boundary and the selects consistent
  width and spacing. The existing advice test and a new production build passed;
  the correction was visually verified at phone width.
- Exercised an actual update from build `2026-09-28T02:28:10.351Z` to
  `2026-09-28T02:34:00.294Z` on the fresh origin. The update installed and reloaded
  successfully after the pending score was synchronized.
- An older cached build at `localhost:5178` refused installation with a close-other-
  tabs message. That was not used as evidence of a current-build regression.

These are browser checks on a desktop engine, not proof of iPhone background GPS,
battery life or a full 18-hole field round. Physical-phone play, broad course-data
accuracy, Docker deployment and full backup restoration were not verified here.

## Release checks to automate

Add browser tests for a complete 9/18-hole round; a downloaded course starting a
round without the server; offline reload and reconnect; duplicate shot retries;
two-tab conflicts; expired sessions; and updates with unsynced scores or shots.
Include the interval between input and local-save acknowledgment. Exercise fresh
database migrations, upgrades from an existing schema, and backup restoration.
Keep an actual installed-phone round as a separate release check.

Watch support, automatic swing detection, surveyed green contours and video coaching
are later investments with hardware, distribution or data requirements. The current
web-only direction supports finishing the phone experience first. Optional language
model explanations can come after reliable calculations and should not be required
for core offline advice. Confirm available migration formats before promising a
one-click import from 18Birdies.
