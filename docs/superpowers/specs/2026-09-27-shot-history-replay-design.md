# Durable shot history and hole replay

Status: implementation authorized by the user's acceptance of the recommended increment on 2026-09-27.

Preserve shot IDs, recorded order, GPS endpoints with accuracy/timestamps, club label,
start/end lie, penalties and holed-out state on the server. Keep manual distance
entry available when GPS is missing or unsuitable, particularly for putting.
Tracking remains optional and never silently changes the scorecard.

Each round shot has its own revision and stable client UUID. Full-record updates
use optimistic concurrency, repeat requests are idempotent, and conflicts show both
versions before resolution. Removed shots are retained as recoverable records and
excluded from club statistics. Range-session behavior remains unchanged.

Add an additive migration after the current notebook migration. Existing round shots
receive stable identities but no fabricated positions, lies or order. Older local
GPS records can enrich matching server records with their real saved endpoints.
The legacy GPS creation endpoints also preserve positions going forward.

Device records keep pending edits and conflicts through reload and backup/restore.
Merging a server response must preserve newer edits and an active measurement.
History is downloaded when a round opens and synchronized with the round's existing
retry controls. Account changes must not write old responses. Shot corrections,
removal/restore and order edits remain usable offline.

Provide a hole timeline in Shots with an offline vector map of recorded GPS paths,
step-through replay, and a route from the round summary. Only measured segments
are drawn; unlocated shots stay in the list. Unknown/duplicate order is explicit.
The map is a positional replay, not surveyed course geometry or green contours.

Acceptance: fresh-device replay retains positions; offline correction/retry is
idempotent; another device's edit requires review; removal/restore changes relevant
club statistics; old records and backups remain usable; scorecard totals are not
changed by tracking; new and existing databases migrate successfully. Verify unit,
API, migration, component and connected-browser flows using synthetic data.

Decision log — 2026-09-27: implement shot history/replay first, then course geometry.
Use a tile-independent vector replay so the saved shot map works without internet.
