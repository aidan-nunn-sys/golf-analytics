# A self-hosted golf companion

The [latest follow-up review](2026-09-27-next-product-milestones.md) evaluates the
play-readiness and club-advice foundation. Its first recommended increment is now
implemented: **Play → Plan** provides offline club advice and reusable private
course-hole notes with revisioned synchronization. See [usage and verification](play-plan-notebook.md).
Next: expand course geometry in the yardage book and preserve complete shot history
on the server. Physical-phone field validation remains a release requirement.

## September 27 play readiness and basic caddie

Implemented compact scoring, Home resume, preparation readiness, explicit guarded
PWA updates, account-scoped bag distributions, source filters, and offline basic
club recommendations. See [usage and verification](play-readiness-club-advice.md).
Next product work remains richer course geometry and server-preserved shot history;
physical-phone field validation remains a release requirement.

See the [September 27 product opportunity review](2026-09-27-product-opportunity-review.md)
for the current competitor comparison, prioritized additions, and verification findings.

Product direction agreed 2026-09-24: a polished, dependable alternative for golfers who want to own their data. The quality bar is a round that is easy to set up, quick to score, and useful to review.

The [18Birdies feature overview](https://18birdies.com/features/) describes GPS, scoring, performance stats, games and wearable support. These provide useful context, but our first milestone is a reliable core golf experience rather than matching the whole feature catalog.

## Current foundation

Club/range analytics, GPS shot measurements, scoring, historical rounds, a personal unofficial handicap, saved courses, official-source scorecard import for two local courses, and a responsive web UI. The September 24 pass improves input safety, course completeness, source provenance and history preservation.

## September 24 round-management increment

Implemented date correction, round notes, recoverable Trash, owner-only restore,
status/date filters, and score correction from the summary. Deletion/restoration
updates scoring, handicap, and club statistics without losing historical data.
The database migration and aggregate behavior have regression coverage; mobile
browser layout and note persistence were checked with isolated demo data.
See [round-management scope](round-management.md).

The user has a Mac but does not want a paid Apple developer membership. Continue
feature development and offline/PWA foundations without paid distribution
requirements; reconsider iPhone packaging later.

## Next slices, in order

1. **Finish the real-device round loop.** Run course import → tee selection → front/back/full round → score correction → finish/resume on a phone. Add browser end-to-end regression coverage when a browser test environment is available. Resolve source/scorecard inconsistencies before adding more analytics.
2. **Work through weak connectivity.** Persist local drafts, show saving/saved/unsynced states, use stable mutation IDs to avoid duplicate rounds/shots, retry deliberately, and resolve conflicts. Only then promise offline support and installable PWA behavior. Cache map tiles only within provider permissions and storage limits.
3. **Make data ownership practical.** Versioned export/import, documented backup and restore, tested upgrades, deployment configuration review, authentication abuse protection, and diagnostics that exclude credentials/location history. Validate restoration, not just backup creation.
4. **Expand trusted course coverage.** A provider interface, source freshness, correct course/layout matching, rating-category-aware data, tee-specific hole yardages/pars/indexes where required, and a useful manual repair path. Evaluate wider providers against official scorecards before automatic import.
5. **Improve post-round insight.** Course/tee/date filters, hole-level patterns, consistent carry-versus-total distance labeling, and clearly supported practice priorities. Add strokes-gained analysis only when the captured data and reference model support it.
6. **Friends and games.** Small-group rounds and scoring formats, then optional wearable integrations. Keep account creation, privacy, sharing and data ownership explicit.

Each slice follows spec → approved plan → implementation → verified outcome. Mobile readability, keyboard access, honest missing-data states, fast navigation and preservation of golf history are requirements throughout.

## September 26 course-library and offline increment

Implemented CSV/JSON scorecard previews/imports, portable scorecard export,
course/green repairs, archive/restore, tee editing and per-hole yardages, and
historical labels/yardage snapshots. Production builds now include the app shell,
manifest, and icons for Home Screen installation.

Prepared rounds have a dedicated offline scorecard with durable local saves,
manual/automatic reconnect sync, conflict review, account isolation, and recovery
exports. Reusable course downloads, new rounds started offline, and device-backup restore
are implemented in the follow-up increment. Offline GPS shots/maps and real
iPhone/Proxmox deployment testing remain future work. See
[implementation and usage](course-library-offline.md).

## Unified on-course Play

Implemented one local-first Play screen for connected and offline rounds, quick scoring and undo, explicit GPS activation with accuracy/freshness checks, queued shot measurements, and personal green observations. The mobile layout has a focused play mode. Map tile downloads, surveyed green slopes, and real iPhone field testing remain future work. See [Play guide](on-course-play.md).

## September 26 yardages and round report

Carry and total measurements now remain separate throughout club detail, stock
yardages, and gapping. Post-round review adds front/back totals, scoring by par,
double-bogey/penalty/three-putt hole links, and explicit missing-data coverage.
Verified with 250 backend and 207 frontend tests, build/lint, and a connected
browser review using disposable data. Course-specific trends, date/tee filters,
distance distributions, and real-phone field checks remain future work.

## Shot history and replay shipped — 2026-09-27

Durable shot records now preserve positions, order, club/lie details, penalties, and
revisions. Optional manual entry, corrections, recoverable removal, cross-device
conflict review, and offline hole replay are implemented. See the
[shot history guide](shot-history-replay.md). Course geometry and real-phone field
validation remain future work.
