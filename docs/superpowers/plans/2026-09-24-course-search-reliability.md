# Course search reliability repair — 2026-09-24

Repair of the existing course-search / round-start flow, following the Pillar 2 specification.

## Observed failure

- The default Overpass service returned HTTP 504 with a dispatcher timeout and “server is probably too busy” for a bounded Lonnie Poole hole query.
- Nominatim resolved Lonnie Poole Golf Course to way/430436305 and Raleigh Golf Association to relation/6406053. The bare abbreviation RGA instead resolved to an airport in Argentina.
- Search fetched hole geometry separately for every result before showing any courses. Import fetched those holes again.
- The course search screen did not expose the existing saved-course library, and submitting the same failed term did not explicitly refetch.

## Repair and checks

- [x] Return Nominatim golf-course matches directly; keep bounded Overpass lookup for other place matches.
- [x] Remove per-result hole downloads from search. Unknown hole counts are null, not zero; fetch geometry only on import.
- [x] Cache and space Nominatim requests, retain submitted searches rather than autocomplete, and display OpenStreetMap attribution. Cache/rate limiting is process-local; the current deployment runs one API worker.
- [x] Show saved courses and add Courses navigation, explicit retry, pending feedback, and full-name guidance.
- [x] Carry the course name into manual entry after an import failure; offer 9/18-hole templates without inventing pars or GPS coordinates. Explain the manual path for imports with no holes.
- [x] Regression tests for direct matches, no per-result downloads, rate limiting/cache, retry, saved courses during failures, and manual course → active round during an upstream outage.
- [x] Frontend targeted tests, production build/TypeScript, and lint (four existing warnings in AuthContext/TeeSetup).
- [x] Backend course, integration, and round tests outside the sandbox; sandbox TestClient stalls as previously documented.

## Limits

Automatic hole/GPS import still needs Overpass. No course/round records were added to the user's database. Browser smoke cannot be performed because no browser is connected to the automation tool. Manual entry uses the user's actual scorecard pars; test-only pars are synthetic.

## Final verification

- 2026-09-24: executed the repaired Python search route against live Nominatim for both full names; it returned Lonnie Poole way/430436305 and Raleigh Golf Association relation/6406053.
- Full frontend suite: 162 tests passed; subsequently added import-timeout fallback regression also passed in the 7-test CourseSearch suite. Final production build/TypeScript passed.
- Backend targeted suite (`test_nominatim`, `test_overpass`, `test_courses`, `test_rounds`) passed outside the sandbox. No production data was changed.
- Repair implementation and automated verification complete. Live browser round-start verification remains unavailable; automatic Overpass imports remain dependent on upstream availability.
