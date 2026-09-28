# Round management

Scope for the next feature increment: correct a round's date, keep round notes,
correct scores from the summary, and move accidental rounds to recoverable Trash.
The user authorized continuing feature development on 2026-09-24. Mobile
distribution is deferred; this work has no paid Apple dependency.

Implementation:
- Add notes and a nullable deletion timestamp with an additive migration.
- Keep round status, scorecards, rating snapshots, and shots when deleting.
- Scope active and deleted lists to their owner; deleted rounds cannot be edited.
- Exclude deleted rounds from every aggregate and recompute after restoration.
- Provide an explicit delete confirmation, Trash restore actions, and date/status
  filters in a responsive round history. Preserve input on failed saves.
- Verify ownership, migration preservation, stats recalculation, validation,
  frontend actions/cache invalidation, and the production build.

Course/tee reassignment and offline synchronization are separate increments.
Changing historical course/tee snapshots needs its own reviewed correction flow.

## Validation

- Full backend suite: 227 tests pass, including migration upgrade/downgrade,
  ownership, deletion exclusions across five stats endpoints, and restoration.
- Full frontend suite: 182 tests pass; production build and TypeScript pass.
- Lint: existing AuthContext Fast Refresh warning only.
- Connected Chromium browser at 430 × 932: inspected history and details,
  saved/reloaded a note, and inspected the delete confirmation on demo data.
- Native iPhone, offline synchronization, and rebuilt Docker deployment were not
  exercised by this increment.
