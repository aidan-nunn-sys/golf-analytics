# Shot history and hole replay

Open a round's **Shots** tab, or use **Shot history & replay** from its summary.
Tracking is optional. Shot records never automatically change scores, putts, or
scorecard penalties; keep those current in **Score**.

## Record and review

- For GPS shots, mark the start, walk to the ball, and save the end position.
  Recorded distance is total distance, including roll.
- Use **Add shot without GPS** for a manual record, including short shots and
  putts. Distance can remain unknown.
- Correct the club, shot number, direction, start/end lie, penalties, and holed-out
  state. GPS positions can also be corrected; changed coordinates lose their
  original accuracy and capture timestamp rather than claiming a new GPS fix.
- Step through the hole using **Previous shot** and **Next shot**. The north-up
  map draws each shot's saved endpoints and works offline without map tiles.
  It depicts recorded positions, not ball flight or surveyed course boundaries.
- **Remove shot** retains a recoverable record under **Removed shots**. Restore
  it there. Removed shots are excluded from club statistics after synchronization.

Older shots retain their known distances. Missing order, lies, or positions are
shown as unknown; the app does not invent them. Older device records with real
GPS endpoints can enrich their matching server records when synchronized.

## Offline saves and recovery

Download/open the round while connected before relying on it offline. Corrections,
new shots, removals, and restores save on the device and synchronize when the
server is available. Opening the round on another device loads synchronized
history. Unsynchronized changes remain only on the device and in its exported
backup.

Each shot has a stable identity and revision. Retrying an upload does not create
a duplicate. If another device changes the same shot, review the device and
server versions in **Shots** and choose which to retain. A server response cannot
silently replace a newer local correction. Round backup files include these
records and still accept the previous version-1 format.

## Deployment and verification

Run the normal Alembic upgrade before serving the new client. Migration
`h85c62fa4d36` follows `g74b51e93c25`, adds shot history fields, and gives historical
round shots stable identities without fabricating geometry or shot order.

Verified: 276 backend tests, 242 frontend tests, production build/TypeScript, and
lint (two existing Fast Refresh warnings). Tests cover migration, ownership,
idempotency, stale revisions, concurrent edits, removal/restore statistics, backup
validation, and manual/GPS editing.

An isolated browser review at 390 × 844 verified fresh-origin history loading,
replay stepping, correction with the server stopped, offline reload, removal and
restore, and successful resynchronization. The corrected server record advanced
to revision 2 while the scorecard remained unscored. Synthetic coordinates were
used; physical-phone GPS accuracy, battery use, and field usability remain untested.
