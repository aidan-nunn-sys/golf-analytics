# Play readiness and basic caddie implementation

Status: implementation complete; verified September 27, 2026. Implements the
approved September 27 design. Physical-phone field validation remains outstanding.

1. Compact Score-mode GPS and place Next beside essential score controls.
2. Add account-scoped resume and course preparation readiness.
3. Add production build identity, waiting-worker discovery, guarded update flow.
4. Test then implement bag distributions and scoped API.
5. Add offline profile cache, recommendation UI, navigation and focused tests.
6. Run full suites/build/lint and production browser smoke; record outcomes.

All six implementation steps are complete. Added 4 backend and 11 frontend tests:
254 backend tests and 218 frontend tests pass. Production build and lint pass
(two existing Fast Refresh warnings). Browser review confirmed phone-width scoring,
Home resume, offline score save/reload/reconnect, offline recommendations, update
discovery, pending-data blocking, multi-tab blocking and successful explicit update.
The SPA worker route-check bug found in browser review was fixed and tested.

See [usage and detailed verification](../../play-readiness-club-advice.md). No user
rounds were modified, no database migration was required, and prior working-tree
changes were preserved. An unattended cross-browser E2E suite and actual iPhone
GPS/background/battery testing are not claimed by this completion record.
