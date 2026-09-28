# Faster play, readiness and club advice

Implemented September 27, 2026, following the approved product review.

## Play and preparation

Home now offers **Pick up your round**, combining server rounds and device copies.
The device copy takes precedence, and pending work is shown first, including
completed rounds that still need synchronization. Score mode uses a compact GPS
panel; **Next hole** sits directly after strokes and putts. Green and Shots retain
the larger GPS panel. GPS activation and accuracy checks are unchanged.

**Ready for the course?** appears beside course downloads and on Offline rounds.
It checks the selected downloaded course/tees, saved bag, club-advice snapshot,
pending scores/shots, installed app shell and GPS permission. It does not request
location access. A downloaded round can still be played without a reusable course
template; the course-download check refers to starting future rounds offline.

## Club advice

Open **More → Club advice** on phones or Club advice in the desktop navigation.
Enter a target distance, select Carry or Total, and optionally filter the source.
The page shows up to two clubs nearest that distance by median, requiring at least
five measurements per club. The middle 80% is the interpolated 10th–90th percentile
of recorded distances, not a prediction or confidence interval. Sample count and
last played date remain visible. Carry and total are never pooled.

All finite, positive distances are retained, including mishits. Invalid recorded
distances are counted as excluded; missing measurements are simply absent. Existing
records cannot distinguish full swings from partial shots. Wind, elevation, lie,
hazards and swing mechanics are not modeled. Advice can help compare clubs but
does not promise a safe carry over an obstacle or recommend an aiming strategy.

Opening Club advice refreshes and saves a profile for that source on this device.
Course preparation and opening Play also save the all-source profile while online.
If the server is unreachable, the previous snapshot remains usable and its saved
timestamp is shown. Refresh after adding/correcting shots or changing clubs. Each
source and account has a separate snapshot. A failed refresh never replaces it.

API: `GET /api/stats/bag-profile?source=all|manual|gps|launch_monitor`. Derived from
the current user's sessions and non-deleted rounds, for active non-putter clubs.
The source field already exists; this increment does not add monitor file import.
No database migration is needed.

## Safe updates

Settings shows the installed build ID and links to **App updates**. The app shows
a waiting-update notice outside Play. Checking for updates does not interrupt a
round. Installation is explicit and requires saving/syncing pending scores, shots
and green-note drafts, and closing other app tabs/windows. An active shot start
also blocks installation. Corrupt/unreadable device-round storage blocks updating
until it is recovered. This check covers locally stored work for all accounts.

The waiting worker independently counts open clients before activating. The app
sends its live route because a service-worker Client URL can retain an earlier
document URL after SPA navigation. Only the requesting tab reloads, and only if
it remains on App updates with no pending work. No device data is cleared.

Older installed builds without this update screen may require closing all app
windows and reopening online once to adopt it. The worker's normal activation on
closing all clients is unchanged. Core offline formats remain backward-compatible.

## Verification

- 254 backend tests passed, including distributions, account isolation, source
  filters, deleted rounds, inactive clubs and invalid measurements.
- 218 frontend tests passed across 46 files, including cache/account isolation,
  meter conversion, insufficient data, resume deduplication, readiness, pending
  work checks and simulated worker multi-client/route checks.
- Production TypeScript/Vite build passed. Lint passed with the two pre-existing
  Fast Refresh warnings; existing React test and backend deprecation warnings remain.
- Connected Brave review used a production build and disposable SQLite data.
  At 390×844, presets, strokes, putts and Next were visible without scrolling.
  Home resume opened the saved round. Five strokes entered while the server was
  stopped survived reload, then synchronized after the server restarted.
- Club advice worked with the server stopped: a 150-yard carry target showed the
  demo 7 iron (155.5-yard median) and 8 iron (142.5-yard median), eight samples each,
  ranges and recency. Readiness correctly reported the saved profile and pending
  score without asking for location.
- A waiting build was discovered. Installation refused pending data, and then
  refused a second open round tab after the data was synchronized. Browser testing
  exposed a SPA route-check issue in worker activation; the fix and regression
  test use the live update request route instead of the client's document URL.
- The corrected production update was then installed successfully from the UI:
  build `2026-09-27T20:23:34.275Z` changed to `2026-09-27T20:34:44.277Z`, with the
  requesting tab reloading on App updates and remaining signed in.

Physical iPhone GPS reception, background behavior, battery life and a full
18-hole field test are still unverified. Worker unit tests simulate the lifecycle;
the browser scenarios above are manual regression checks, not an unattended
cross-browser end-to-end suite.
