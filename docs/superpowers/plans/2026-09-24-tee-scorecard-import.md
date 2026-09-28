# Tee and scorecard import + usability refactor

✅ STATUS: IMPLEMENTED — automated and live-source verification completed 2026-09-24. Browser/device and rebuilt Docker smoke remain explicitly outstanding.

Approved by the user on 2026-09-24 against [the design](../specs/2026-09-24-tee-scorecard-import-design.md), together with the mobile usability and hardening refactor.

## Delivered

1. Official source adapters: RGA public-course PDF and Lonnie Poole HTML scorecard/ratings. Minimal factual fixtures retain published data and category distinctions. Source failures or structural inconsistencies fail without database writes.
2. Authenticated signed preview/apply, 15-minute expiry, user/course binding, source allowlist, bounded downloads, whole-card validation, explicit conflicts, optimistic concurrency checking, idempotent tee source keys, atomic application, and preserved mapped hole identities/geometry.
3. Alembic provenance fields and historical stroke-index snapshots. Existing pars, ratings, and stroke indexes remain unchanged when course setup is updated.
4. Import screens linked from course overview and tee setup, with source links, layout matching, source limitations, reviewed conflicts, and cache invalidation.
5. Correct 9/18-hole round creation: valid pars for every selected hole, only selected holes stored, back-nine start at hole 10, invalid navigation/shot hole rejection, no fabricated par-4 defaults, and stricter score input validation.
6. Responsive desktop/mobile navigation, reusable visual styles, touch-sized controls, accessible loading/errors, informative course readiness, login feedback, and render-error recovery. Maps load only when a live round opens.
7. Live scoring blocks advancing with unsaved input or an unfinished shot. Failed shot saves retain measurements; missing green coordinates never become distance to the course center. Tee forms preserve unsaved input through background refetches.

## Verification

- 219 backend tests passed, including fresh/upgraded database migration tests, snapshot preservation, authenticated imports, changed/invalid previews, idempotency, source outages, incomplete scorecards, and back-nine scope.
- 171 frontend tests passed, including preview/apply, conflict acknowledgement, incomplete setup, unsaved input, failed-shot retry, and page-error recovery. Auth/client targeted tests also passed after subscription cleanup.
- Production build and TypeScript pass. Main JavaScript bundle reduced from about 506 KB to about 342 KB before gzip by splitting out the map/live-round code. Live-round assets remain available as separate chunks.
- Lint succeeds with one pre-existing AuthContext Fast Refresh warning (mixed component/hook exports). Other effect-dependency warnings addressed without discarding unsaved tee-form edits.
- Live read-only official-source smoke: RGA 18 holes / 5 tees / par 71; Lonnie Poole 18 holes / 12 tee-rating choices / par 72.
- Running frontend/API proxy health verified. No source import was applied to user course data during development; the additive schema migration runs through the app's existing startup migration flow.

## Limits / remaining release checks

- No browser is connected to the available automation tool, so visual/device smoke could not be performed. Check narrow-screen layout, keyboard navigation, preview/apply and a full live round on a real device.
- Dockerfile now installs Poppler for RGA PDF extraction; a rebuilt-container smoke was not run. Local Poppler was present and exercised.
- Current import support is two official course sources, not a general course database. RGA's published card does not identify rating category or nine-hole ratings; the UI preserves and explains these omissions.
- Scores still need a live server connection. Offline persistence, mutation idempotency across interrupted connections, backup/export and broader security/deployment review are next slices, not claims of this implementation.
