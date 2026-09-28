# Course library and offline scoring

The latest [unified Play screen](on-course-play.md) now handles both connected and offline rounds, including GPS distances, queued shot measurements, and green observations. The earlier increment details below document the original rollout.

Authorized scope: course repair, CSV/JSON import preview, portable export, archive
and restore, tee yardages, and downloaded round scoring with explicit sync.

Course edits preserve hole identities and historical round snapshots. Removing a
hole used by a round is rejected. Archives remain readable by historical rounds.
Imports are validated on preview and apply, and duplicate names need acknowledgement.

Prepare an existing round while connected. Its course, tees, scores and player
identity are stored on the device. A dedicated offline scorecard saves locally,
survives reload, and synchronizes when the app is open and the server is reachable.
Revision conflicts require an explicit choice; retries use absolute scores and
cannot create duplicate rounds. Offline GPS shot logging and map tile downloads
are outside this increment. Courses can now be downloaded as reusable tee/scope configurations. Starting a round from one of those downloads requires no connection.

Production builds include an installable app shell and precache all built assets,
including lazy routes. HTTPS (or localhost for development) is required. Account
data is kept outside the service-worker cache and isolated by user ID. Signing out
keeps pending device scores; they become accessible again only for that account.

Validate import rejection/round trips, historical preservation, migration,
archive behavior, sync ownership/conflicts/retries, durable local storage, offline
reload and phone layouts. Document remaining real-device validation explicitly.

## Using the course library

- **Courses → Import CSV / JSON** accepts a file or pasted contents. Download the
  CSV template to see supported columns. Only `course,hole,par` are required;
  optional columns are `stroke_index,tee,yardage,green_lat,green_lng`.
- Use one row per hole/tee combination. Hole details must agree across tees.
  Yardages are yards. CSV does not infer slope/course ratings. JSON exports
  include ratings and can be previewed/imported on another instance.
- **Manage course** edits the name, pars, stroke indexes, and green coordinates.
  It can add/remove unused holes and export a JSON scorecard. Referenced holes
  cannot be removed. Reconfigured layouts should use a separate course record.
- **Set up tees → Edit [tee]** supports renaming, per-hole yardages, total yardage,
  and deletion. A complete set of per-hole distances determines the total.
- Course repairs clear official-source attribution and remove ratings whose
  scope/par no longer matches. Existing rounds keep their original snapshots.
- Archive duplicate/unneeded courses from **Manage course**. Restore through the
  **Archived courses** library tab. Archiving does not delete any rounds.

## Taking a round offline

1. While connected, sign in and open a course. Choose your tee, 9/18 holes, and front/back nine, then **Download course for offline starts**.
2. Open **Offline rounds**, select the date, and press **Start round on device** on a downloaded configuration—even without your server. Alternatively, start a connected round and choose **Download round for offline play** on its live screen.
3. Use **Offline rounds** (under More on phones) to open that downloaded scorecard.
   Enter strokes, putts, penalties, and fairways, then press **Save hole on device**.
   Blank strokes clear a score; blank putts mean unrecorded.
4. You can finish/reopen the downloaded round offline. Local scores survive reload
   and app closure. Unsaved form input is not a saved score; save before leaving.
5. Sync retries on opening the scorecard, returning focus, reconnecting, and every
   30 seconds while the scorecard is open. **Sync now** also retries. The browser's
   online flag alone is not treated as proof your private server is reachable.
6. A conflict shows device/server scores and metadata. Choose a complete version,
   then confirm. A new server edit during resolution causes another conflict.
   Deleting a round on the server blocks sync until the round is restored.
7. An expired session needs sign-in before sync; pending scores remain stored for
   the same account. Signing out removes the local remembered login, not downloads.

Device backups are JSON recovery copies containing the local scorecard and sync
state. Use **Restore a device backup** on Offline rounds, choose the JSON file,
review its course/date/scores, then confirm. Validation rejects malformed scores,
wrong accounts, and backups from another server address. Older backups lack a
server address: restore these only to their original server/account. Restore
never overwrites an existing download. Export and sync that copy before removing
it; unsynced downloads cannot be removed through the UI. Course JSON imports are
a separate format. Restored rounds must sync again; server changes produce the
same explicit conflict review as normal scoring.

### Offline creation and recovery guarantees

- Each new device round has a UUID. The server uses a unique identity constraint
  so retrying after a lost response returns the existing round. Creation and score
  sync are separate: the client persists the server identity before sending scores.
- Downloaded templates contain server-signed pars, stroke indexes, yardages and
  ratings for the selected tee/scope. Later course edits or archiving do not
  rewrite those snapshots. A removed tee retains its original name/ratings.
- If a referenced hole was removed, synchronization stops with a repair message;
  scores remain on the device. Rotating the server secret invalidates preparation
  signatures. Keep backups and the original server secret during upgrades.
- Templates are specific to the authenticated user. They do not grant login
  access and do not expire; normal authentication is still required for syncing.
- Download again to use updated course data. Removing a course download does not
  remove rounds already started from it. Backups recover rounds, not the reusable
  course library or the whole server database.

## Install and self-host

Build normally (`npm run build` in frontend); the existing Docker build copies the
result into FastAPI's static directory. The manifest, app icons, and generated
service worker are included. Serve the app over HTTPS on your reachable private
server hostname. Localhost is suitable for desktop testing; a plain HTTP LAN IP
is insufficient for reliable service-worker installation on a phone.

On iPhone, open the HTTPS address in Safari and choose Share → Add to Home Screen.
Open the installed icon and prepare the round there: standalone and Safari
storage may be separate. No paid Apple developer account is required. The
**Offline rounds** page reports whether the app shell is available offline.
Production precaches local assets and lazy routes; it does not download map tiles
or cache API/auth responses in the service worker. Dev mode intentionally does
not install a service worker.

After deploying an update, close existing app windows/tabs and reopen while
connected so the waiting service worker can activate. Local downloads remain in
account-scoped storage across updates. Avoid clearing site storage with unsynced
scores. A persistent-storage request is made at download time, but a browser can
still remove site data; export important pending rounds as a separate copy.

A private tunnel such as Tailscale can provide access from the course to a server
VM on Proxmox. Tunnel installation and HTTPS configuration are deployment work
outside this repository increment. Offline scoring keeps working when that
connection drops; server features, fresh course downloads, and sync need connectivity.

## Verification

API regression coverage includes CSV/JSON rejection, preview without mutation,
portable course round trips, duplicate acknowledgement, archive/restore, tee
validation, snapshot preservation, migration upgrade/downgrade, sync ownership,
retries, deleted rounds, and revision conflicts. Frontend coverage includes local
storage failures, account isolation, stale-tab edits, network failures, edits
during sync, offline authentication, import preview, and offline screen remount.

Manual Chrome/Brave production-build verification used a disposable database on
port 5174 and a 430×932 viewport: import nine-hole CSV → start/download round →
stop server → save strokes/putts → reload app with server still stopped → restart
server → sync and verify persisted server scores. A simulated second-device edit
correctly displayed the conflict comparison. Real iPhone installation, browser
storage eviction behavior, and Proxmox/Tailscale deployment remain untested.

Final checks: the 239-test backend suite passed, followed by the affected tests
including two added cases for tee-yardage validation and concurrent writes. All
196 frontend tests pass. Production build, lint, and whitespace checks pass; lint
retains the existing AuthContext Fast Refresh warning. The normal development
frontend/backend were restarted on localhost:5173/8000 and their API proxy passed
a health check. The disposable review server was stopped.

## Offline starts and restore verification (September 26 follow-up)

Added API coverage for preparation without creating a round, back-nine selection,
UUID retries, deleted-round retries, immutable snapshots after edits/archive/tee
deletion, invalid signatures/owners, removed holes, incomplete cards, and score
sync retries. Frontend tests cover offline starts, lost creation responses, score
sync failures after creation, quota failure, backup validation/collision rejection,
and preview-before-restore behavior. Full suites passed: 246 backend tests and
204 frontend tests; production build and lint passed (existing Fast Refresh warning).

Browser review confirmed a downloaded course can start a new round with the demo
server stopped, save five strokes/two putts, and survive a reload while disconnected.
After reconnecting, the app reported all scores synced; the isolated database
contained one device-created round with five strokes and two putts on hole one.
Real iPhone installation and Proxmox deployment still require device testing.
