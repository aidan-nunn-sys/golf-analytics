# Play readiness and basic personal caddie

Approved direction: user accepted the September 27 review and first two proposed
implementation slices on September 27, 2026. This spec makes that scope concrete.

## Slice 1: quick scoring and safe updates

Compact the GPS panel in Score mode; preserve explicit GPS permission and existing
accuracy guards. Keep score presets, putts and Next within the initial phone view.
Home offers resume links merging downloaded and server rounds without duplicates.
Offline preparation shows course/tee, bag, app-shell, GPS and pending-data status.
GPS readiness must not itself request location permission.

Production builds have a build ID, update discovery and a dedicated App updates
screen linked from Settings.
No automatic mid-round reload. Updates are blocked for pending device scores or
shots, unreadable device storage, an active Play route or additional open app tabs.
The worker rechecks open clients before skipping its waiting phase. Only the tab
that requested installation may reload, and only while still on App updates.
Existing device data is not cleared. Account isolation remains intact.

## Slice 2: bag distributions and basic recommendations

Add a derived, authenticated bag-profile endpoint. Active non-putter clubs expose
separate carry/total count, median, p10/p90, min/max and latest measurement date.
Allow source filters (all/manual/GPS/launch monitor). Dates use session/round dates.
Only finite positive distances enter a distribution; disclose excluded records.
Do not silently trim mishits or mix carry and total. Keep the current stats API.

A Bag advice page accepts a manual target in the user's units, ranks up to two
clubs by median-distance difference (stable club-ID tie break), and requires five
measurements per club. Show spread, sample size, recency, stale-cache status and
an insufficient-data state. These are empirical ranges, not confidence intervals
or hazard-clearance probabilities. Existing shots do not distinguish partial/full
swings; disclose that limit. Weather, hazards and swing mechanics are outside
this increment. Cache each source profile per account for offline use; refresh
explicitly and during connected preparation, preserving the last good copy.

## Verification

Pure distribution tests precede implementation. Add ownership/filter/deleted-round
API checks, recommendation/unit/low-sample tests, offline-cache tests, safe-worker
activation tests and component tests for resume/readiness/updates. Run both full
suites, build/lint, then review production UI and offline scoring in the connected
browser. Physical phone GPS and battery checks must remain explicitly unverified.

## Decision log

- 2026-09-27: Approved first two increments; preserve existing working-tree work.
- 2026-09-27: Use transparent deterministic recommendations; no external AI calls.
- 2026-09-27: Require a single non-playing app tab for explicit worker activation.
- 2026-09-27: Isolate installation on `/updates` so a settings form cannot lose
  unsaved edits. Worker validates the live route sent by the application; the
  browser regression showed that Client.url can retain the document's old URL.
