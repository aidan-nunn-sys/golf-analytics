# Play advice and personal hole notebook

Status: implementation authorized by the user's acceptance of the recommended next increment on 2026-09-27.

Add a Plan tab to Play without moving the quick scoring controls. Reuse the existing
offline bag profile and nearest-median recommendation function. Allow a fresh GPS
green-center target or a manual target, carry/total selection, source filtering,
sample ranges/counts and profile freshness. Missing GPS or insufficient data must
remain explicit. This increment does not add hazard geometry or predictive advice.

Personal strategy notes belong to a user, course and hole number, independently of
rounds and tee selections. Existing green notes remain round-specific observations.
Use a new additive table with revisioned updates. Empty notes retain their revision
so stale devices cannot resurrect cleared text. GET/PUT endpoints require sign-in;
all reads and writes are scoped to the current user. Conflicting edits require review.

Cache personal notes by account/course/hole. Keep editor drafts on the device and
save explicitly into a pending-sync record. Save/reload and later rounds work without
a server. Fetch the whole course notebook during preparation; synchronize pending
notes on opening Play, reconnect, focus and explicit retry. Never overwrite pending
local edits during refresh. Preserve edits made during an in-flight request. Check
the auth token before storing responses. Export the notebook including pending work.
Block app updates while personal notes or drafts need synchronization/recovery.

Acceptance: advice works with a saved profile and no server; manual meters convert
correctly; stale GPS cannot generate a target; saved notes reappear in another round
on the same course and remain isolated by account/course/hole; conflicting devices
can choose either reviewed version; retry does not duplicate revisions; scoring,
shot tracking and round-specific notes keep working. Test migrations on fresh and
existing databases, server ownership/concurrency, device merge/drafts, component
flows and mobile production UI.

Decision log — 2026-09-27: user approved implementation of the first recommended
increment. Course geometry, shot replay and strokes gained remain later milestones.

Implementation completed and verified on 2026-09-27. Notebook recovery export is
separate from existing round backups; automated notebook import is deferred. Drafts
are durable locally, while explicit Save queues synchronization and permits review
of stale edits. See [usage and verification](../../play-plan-notebook.md).
