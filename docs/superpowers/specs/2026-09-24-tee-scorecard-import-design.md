# Tee and scorecard import — 2026-09-24

Status: approved by the user on 2026-09-24, including the accompanying mobile usability and hardening refactor.

## Goal

Populate tee choices and missing scorecard holes from a second data source. OpenStreetMap remains the source of map geometry; incomplete OSM coverage must not be interpreted as a complete scorecard. The immediate acceptance courses are Lonnie Poole Golf Course and Raleigh Golf Association's public 18-hole course.

## Source investigation

Read-only checks on 2026-09-24:

- OpenGolfAPI provides unauthenticated course search and tee reads: https://opengolfapi.org/docs/ . Both requested courses were found. RGA also has a separate Stockholders course, so name-only automatic matching is unsafe.
- Lonnie Poole API ID: `6cace22f-cf43-4401-9718-0973b6dd6ab9`. Its tees endpoint returned Competition 74.4/142 and Black 72.0/138. The official ratings page instead publishes NC State Competition 74.7/142 and Black 72.4/137, plus separate men's/women's ratings and front/back-nine ratings: https://lonniepoolegolfcourse.com/about/ratings-slopes/ . Neither differences nor missing values may be silently reconciled.
- RGA public course API ID: `88c3f066-ea0f-480f-afe6-7b3e885cba3c`. The API returned par 70 and Blue 68.8/123. The official scorecard linked from https://www.rgagolf.net/18-hole-course/ is https://www.rgagolf.net/wp-content/uploads/sites/5963/2026/06/RGA-Scorecard_2026.pdf ; it publishes par 71 and Blue 68.3/122.
- GolfCourseAPI is another provider but requires signup/key; its data for these courses has not been verified. Do not add a paid dependency or assume its data is more current.

Conclusion: a generic API pull is technically feasible but must not silently install the tested inconsistent records. Prefer official scorecards for the two immediate courses. Keep broader provider import as a follow-on, not an unverified default.

## Proposed first slice

Add **Import tees & scorecard** to course detail and Tee Setup.

1. Select the supported course/layout. Use exact OSM identifiers when available; for manually created records show the official course name and address and require choosing the match. Never treat RGA Public and Stockholders as the same layout.
2. Fetch from allowlisted official sources on the backend. Lonnie Poole uses its published scorecard and ratings page. RGA uses the scorecard link discovered on its official course page. Parse HTML tables / PDF text, validate the whole result, and return a preview. Parser failures leave saved data untouched.
3. Preview the source link, retrieval date, tee names, rating category, yardages, available 18/front/back ratings, hole count, pars, and stroke indexes. Show omissions/conflicts explicitly. Do not infer nine-hole ratings by halving an 18-hole rating or assign a gender absent from the source.
4. **Apply import** atomically fills the reviewed setup. Preserve existing mapped geometry. Add missing hole numbers; never delete/recreate hole rows that rounds reference. Reject unresolved layout/numbering conflicts.
5. Keep imported tees distinguishable by rating category (e.g. Red — Men versus Red — Women). The existing model can initially use distinct labeled TeeSet rows; do not collapse different ratings into the same row.
6. Re-imports are idempotent via persisted source IDs/tee keys. Retain source URL and retrieval timestamp. Existing manual edits produce a conflict in the preview rather than being silently overwritten.
7. Require the selected 9/18-hole scope to have all required hole numbers and pars before starting a round. One saved hole must not start an apparent 18-hole round.

The action fetches data automatically; the preview is the normal product step for matching a course and selecting which local setup to update. There are no invented ratings, pars, stroke indexes, or GPS coordinates.

## Historical data constraint

Round ratings and pars already use snapshots, but handicap history currently reads stroke indexes from live Hole rows. Before allowing imports to change an index referenced by a round, snapshot that index in RoundHole and backfill existing rows with their current value through Alembic. Update the handicap adapter to use the snapshot. Filling a course must not retroactively change an existing round, or attach newly added holes to it. This requires dedicated regression coverage.

## Boundaries

No account creation, API key, subscription, or upload of player/round data. Backend fetching uses fixed provider hosts and bounded timeouts. A timeout preserves the local course and manual setup. No scheduled synchronization in this slice. Source-specific parsers need fixture coverage because official sites/PDF layouts can change.

Per-hole tee yardage storage and a general course-data provider are follow-on slices; v1 imports aggregate tee yardage supported by the current model. If hole pars/stroke indexes differ by tee/category, do not force them into the current shared-hole model: report the difference and require an explicit supported scorecard selection, or defer that course until the model supports it.

## Acceptance

- Official-source previews for both named courses, with all 18 holes and every unambiguous tee/rating row present in the source.
- Preview/apply repairs an incomplete one-hole course without destroying existing geometry or historical scores.
- Repeating the import creates no duplicate tees or holes.
- Missing/ambiguous data and service failures produce actionable errors without partial writes.
- Backend parser/import/history/migration tests; frontend preview, conflict, and round-start validation tests; build/typecheck/lint; live read-only source smoke.

## Decision log

- 2026-09-24: Investigated a second API and official sources. Propose official-source adapters for the two requested courses because live API values conflict with their published scorecards. No application code or user course data changed in this investigation.

### 2026-09-24 — Implementation and source parsing decisions

The user approved this design and the accompanying usability refactor. Implemented official-source adapters, signed preview/apply, explicit conflicts, immutable historical indexes, and course-readiness validation. The deployed HTML uses an optional table-row end tag; parser fixtures cover it. PDF libraries tested locally did not preserve RGA's par-table reading order, so RGA extraction uses Poppler's `pdftotext -layout` with a subprocess timeout and size-bounded input. Docker declares this system dependency; no Python PDF library is required.

The site publishes independent front/back/full ratings; the importer preserves them rather than deriving one from another. A source format change intentionally produces an actionable import error. Visual work uses shared styles and native controls, with mobile bottom navigation, a desktop sidebar, and an explicit import preview. No offline or full competitive-parity claim is made. See the plan for checks and remaining release smoke.
