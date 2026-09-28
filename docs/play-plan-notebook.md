# Plan a shot and keep a personal yardage book

Implemented September 27, 2026. Open a round and choose **Plan**, beside Score.
The quick scoring layout remains available in Score, including presets, strokes,
putts and Next on a 390×844 screen.

## Club advice during a round

Use a fresh GPS green-center distance or choose **Enter distance** for a manual
target. Switch between carry and total, and filter by shot source. Advice reuses
the existing bag distributions: the two nearest recorded medians, at least five
samples per club, the middle 80% of recorded distances, sample counts and recency.
The account/source-specific saved bag works without the server. Refresh while
connected after changing shots. The profile timestamp remains visible.

An unavailable, inaccurate or stale GPS fix does not produce a recommendation.
Manual targets use your yards/meters preference; calculations remain in yards.
Targets must be positive and at most 600 yards. Recommendations describe recorded
distance samples. They do not account for hazards, weather, lie or swing intent,
and do not estimate a probability of success. GPS samples are total distance only.

## Personal hole notes

The notebook in Plan is private to your account and keyed to course and hole.
It appears in subsequent rounds, including rounds started from a downloaded course.
Different courses and holes have separate notes. Course scorecard repairs do not
erase a notebook by replacing a hole's database row.

Typing saves a device draft. Choose **Save personal note** to queue it for server
synchronization. The editor reports draft, pending or synced state. Notes refresh
and retry during Play, on reconnect/focus, periodically, and through **Sync personal
notes**. Pending edits survive a failed request and reload. A save during an
in-flight upload remains pending instead of being replaced by the older response.

Two devices editing the same note receive a comparison. Choose a version and
confirm before replacing the reviewed text. A stale editor in another tab also
requires review. Clearing text retains a revision so an old device cannot silently
restore it. Saving notes is separate from synchronizing the scorecard.

The existing **Green** tab continues to hold observations for that particular
round. Use it for today's pin, pace and break; use Plan for reusable strategy.

Course download also refreshes the notebook and bag. If ancillary downloads fail,
the scorecard remains saved and the app asks you to check Plan while connected.
App updates are blocked while personal drafts, pending notes or conflicts need
attention. Account changes cannot write an old request's response into the cache.

**Export personal notes** downloads a separate recovery JSON containing that
course's cached notebook and drafts, including raw content when storage needs
recovery. The round/device backup does not include this separate notebook. This
increment does not add an automated notebook import/restore screen.

## Server and migration

- `GET /api/courses/{course_id}/personal-notes` returns only the signed-in user's notes.
- `PUT /api/courses/{course_id}/personal-notes/{hole_number}` accepts `text` (up to
  2,000 characters) and `expected_revision` (zero for a new note).
- Stale changes return 409. Identical retries are idempotent. Updates use a
  conditional revision check; the database enforces one note per user/course/hole.
- Additive migration `g74b51e93c25` follows `a74b51e93c24`. Existing scores, shots,
  courses and round-specific green notes are preserved. Startup applies migrations.

## Verification

- 263 backend tests passed, including note ownership, conflicts, retries, clear
  semantics, hole replacement, and migrations on fresh and existing databases.
- 236 frontend tests passed across 49 files. Coverage includes offline reloads,
  account/source separation, meters, stale GPS, insufficient data, in-flight edits,
  stale editors, conflict confirmation, quota failures and update protection.
- Production TypeScript/Vite build and lint passed. Existing Fast Refresh warnings,
  the AuthContext test `act` warning, and backend deprecation warnings remain.
- Connected Brave review used synthetic data in the isolated `/tmp` database.
  At 390×844, scoring controls remained visible together with the new Plan tab.
- With the server stopped, a 150-yard target produced the saved 7-iron/8-iron
  comparisons. A personal note saved locally, survived reload, and synchronized
  after reconnect. A read-only SQL check confirmed the server text and revision 1.
- The current production build downloaded a course, then started another round
  with the server stopped. The original personal note appeared in that new round.
  Reconnecting synchronized the new synthetic round successfully.
- The installed PWA updated to build `2026-09-28T02:55:34.107Z` through App updates.

Physical-phone GPS, background/lock-screen behavior, battery use and a full field
round remain unverified. Richer course geometry and durable shot replay are the next
separate product increments.
