# Unified on-course play

Both `/rounds/:id` and `/offline/:id` use the same Play screen. Opening a connected
round saves its scorecard and course on the device automatically. An existing
local copy takes precedence; another device's edits are refreshed when clean or
reviewed as a conflict when dirty. A server route resolves an offline-created
round's local identity instead of making a second scorecard.

## Playing a round

- On a phone the screen hides the general app header/navigation and offers a
  dedicated return link, scorecard, and Score / Green / Shots tools.
- Birdie / Par / Bogey / Double presets and score steppers save each valid change
  locally. Putts, fairways and penalties are optional. Undo reverses the last
  score change unless a newer edit makes that undo stale.
- Next/previous and the hole grid preserve the current hole across reopening.
  Finishing a partial or complete round requires confirmation; it can be reopened.
- Server synchronization is separate from local writes. A slow server does not
  lock scoring. In-flight edits stay dirty and are retried. Sync runs after edits,
  on focus/reconnect, and periodically while Play is open.
- Conflicts show scores, details, and green notes from both versions. Selecting a
  version requires confirmation. GPS shots remain independent of score conflicts.

## GPS and shots

Enable GPS explicitly. Green-center distance is calculated on the device from
saved coordinates; it does not require a server or map imagery. Display respects
yards/meters. Stale fixes (over 30 seconds) or accuracy worse than 25 meters do not
produce a current distance or allow a new shot endpoint. Accuracy and age are
shown when available. This threshold is a guard against poor fixes, not a claim
that phone GPS is precise enough for putting measurements.

Mark the shot start, walk to the ball, and choose **I'm at my ball**. Select a club
and direction, then save. Both endpoints and unfinished measurements are stored
locally. Measurements are total distance including roll, not carry. The bag is
cached while connected; it can be refreshed from Shots. A new device needs a bag
download before choosing a club offline. Shots sync with stable UUIDs; retrying a
lost response does not add duplicate shots. Pending shots prevent removal of a
round download and are included in device backups. The existing server shot model
stores total distance/accuracy, while endpoint coordinates remain in device data.

Map imagery still requires a connection. No third-party map tiles are downloaded
for offline use. GPS permissions, reception and battery behavior need real-device
validation, including iPhone Home Screen installation over HTTPS.

## Green notebook

The Green tool saves a player's observed left/right/straight break, uphill/downhill/
level pace, and up to 500 characters of notes per hole. Unsubmitted note drafts
survive switching tools/reloading on the same device. Press **Save green notes**
to include them in round sync and exported backups. Green notes appear in sync
conflict comparisons and are stored with the round on the server.

This is not an automatic green-reading system. No surveyed elevation data, contour
heatmaps, predicted putt lines, front/back green geometry, or daily cup positions
are supplied. The center map explicitly describes its limits. Surveyed and licensed
course data is a future prerequisite for reliable slope mapping.

## Verification

Backend coverage includes ownership, valid GPS coordinates, idempotent device
shots, green-note validation, old sync-client compatibility, revision conflicts,
and the existing migration/historical-data suite. Frontend coverage includes
local-first scoring, undo, denied/stale GPS, route aliases, automatic preparation,
shot retry/recovery, backup validation, and local green notes. Production assets
remain split so maps load only when opened, and are included in the offline shell.

A disposable production demo was checked in Chrome/Brave at 430×932. The unified
scorecard saved score changes and green notes with the server stopped, then
reloaded offline. After reconnecting, the scorecard reported synced and the server database contained the updated score and green notes. No real user rounds were changed during this review.

The full backend suite (248 tests) passed. The frontend suite passed, followed by targeted checks for the final shot-tracking changes (200 frontend cases covered in total). Production build and lint passed; lint retains the existing AuthContext Fast Refresh warning.
