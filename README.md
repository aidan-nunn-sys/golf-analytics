# Golf Analytics

### September 27: faster play and club advice

Score mode now keeps GPS compact and puts Next beside strokes and putts. Home
offers round resume, course downloads show device readiness, and **More → Club
advice** compares your recorded carry/total distributions with a target distance,
including offline snapshots. **Settings → App updates** shows the installed build
and provides guarded updates. See [usage and verification](docs/play-readiness-club-advice.md).

Self-hosted, open-source golf analytics. v1: club & shot analysis (range engine) — log shots per club, get stock yardages, gapping, consistency, and dispersion.

## Run with Docker

```bash
cp backend/.env.example .env   # edit the values
docker compose up --build
```

`docker compose up --build` builds the React SPA and bundles it into the same
container as the API, so the whole app is served from one origin:
http://localhost:8000. The API lives under `/api/*` (interactive docs at
`/api/docs`); everything else is the SPA, with client-side routes falling
back to `index.html` on hard refresh.
The first run creates an admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`; the admin creates other accounts (no open signup).

## Develop the backend

```bash
cd backend
pip install -e ".[dev]"
pytest
uvicorn app.main:app --reload
```

The dev server serves the API at http://localhost:8000/api (docs at `/api/docs`).

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite serves the SPA at http://localhost:5173 and proxies `/api/*` requests to
the backend at `http://localhost:8000` — run the backend (above) alongside it.

```bash
cd frontend
npx vitest run       # unit/component tests
npx tsc -b --noEmit  # type-check
```

In production (`docker compose up --build`), there's no separate frontend
dev server: the SPA is built once at image build time and served by FastAPI
alongside the API on the same origin/port (see "Run with Docker" above).

## Status

v1 backend: accounts, club bag, range sessions, manual shot logging, derived stats (club detail, gapping, dashboard).
v1 web client: React/Vite SPA covering login, club bag, sessions, shot logging,
stats dashboards, and on-course GPS rounds (course search/import, live GPS shot
logging, scorecards) — served single-origin with the API via Docker.

The dashboard also shows recent scoring trends with separate 9- and 18-hole
comparisons, links to scorecards, and practice suggestions based on recorded
three-putts and penalties. Comparisons use fully scored rounds from the latest
20 finalized rounds; missing putt counts are called out explicitly.

Past rounds can be entered from Rounds → Enter a past round, with a date, course,
optional tee, and 9/18-hole score grid. Optional putts, fairways, and penalties
feed round statistics. Handicap shows the personal, unofficial Index, counting
scores, exclusions, caps, and history; the dashboard links to it.

Round management: open **Round details** from history, live scoring, or a
summary to correct the date, save notes, or move an accidental round to Trash.
**Rounds → Trash** restores its scorecard, shots, notes, and original status.
Deleted rounds are excluded from scoring trends, personal handicap, and club
statistics. Round history now includes status/date filters and score totals;
strokes can also be corrected or cleared on the summary. An additive Alembic
migration upgrades existing databases automatically at server startup.

Verification (2026-09-24): 227 backend tests and 182 frontend tests pass;
production build/TypeScript checks pass. Lint succeeds with the existing Fast
Refresh warning in AuthContext. Connected-browser checks at a 430px phone
viewport covered history, details, note saving/reload, and delete confirmation
using an isolated demo database. Real-iPhone/offline and rebuilt Docker smoke
checks remain pending.

### Official tee and scorecard import

Open a saved course and choose **Import tees & scorecard**. Currently supported:
**Raleigh Golf Association — Public 18** and **Lonnie Poole**. The backend reads
their official websites, previews tees/ratings and hole pars/stroke indexes, and
asks you to review changes to saved values before applying them. GPS geometry
and existing rounds are preserved. Repeating an import does not duplicate tees
or holes. Public RGA and its Stockholders course are different layouts.

RGA's published card does not identify rating gender/category or provide
nine-hole ratings; the preview calls this out. Lonnie Poole's men's/women's
ratings remain separate choices. Missing ratings/coordinates are never guessed.
Broader automatic course coverage is not implemented yet.

**PDF dependency:** RGA import requires the `pdftotext` executable from Poppler
(`poppler-utils` on Debian/Ubuntu, `poppler` on Arch). The Dockerfile installs it.
HTML-only Lonnie Poole import does not require the PDF executable.

The new Alembic migration records source provenance and snapshots stroke indexes
into historical round holes. New rounds require a complete, valid scorecard for
the selected 9/18-hole scope; a back-nine round starts on hole 10.

The responsive shell includes mobile navigation, larger touch controls,
course-readiness guidance, page-error recovery, and on-demand map loading. Live
scoring keeps unsaved input and unsuccessful shot measurements available for
retry. The unified Play screen saves scores locally first and supports offline green-center GPS and shot measurements.

See [the product roadmap](docs/product-roadmap.md) for the self-hosted product
direction and next priorities.

Roadmap: launch-monitor import; GPS-measured range shots; expanded learning profile.

## License

MIT — see [LICENSE](LICENSE).

### Course library and offline play

Courses now support CSV/JSON import with preview and duplicate checks, JSON
scorecard export, manual hole/GPS repairs, tee editing with per-hole yardages, and
archive/restore. Existing rounds retain their course/tee labels, ratings, pars,
stroke indexes, and downloaded tee yardages after course edits.

Download a course with your selected tees and holes, then start rounds from **Offline rounds** without a connection. Opening an existing round automatically saves it on the device. Device backup JSON can be previewed and restored from the Offline rounds page.
Use **More → Offline rounds** on your phone to score locally and sync later.
Conflicting server edits require review. Production builds include an installable
Home Screen app and offline shell; use HTTPS for phone installation. No paid
Apple developer account is needed. Fresh course downloads, map imagery, and server synchronization require connectivity. GPS calculations and shot measurement work from saved device data. See the [course and offline
play guide](docs/course-library-offline.md) for formats, setup, limitations, and
verification details.

### On-course Play

A unified mobile Play screen includes quick score presets, automatic device saves, undo, a full hole selector, green-center GPS, offline shot measurements, and a green notebook. See [on-course usage and limitations](docs/on-course-play.md).

### Yardages and round reports

Club detail, Home stock yardages, and Gapping now have separate **Carry / Total**
views. Carry uses flight-distance samples; total includes roll and GPS shots.
Their averages, sample counts, direction splits, and gaps are computed separately.
Putters are excluded from stock yardages and gapping. Existing records are preserved.

Round summaries now open with a report showing front/back-nine totals, scoring by
par 3/4/5, doubles or worse, recorded penalties, and putting patterns. Highlighted
holes link to the editable scorecard. Partial rounds and missing putts show their
coverage explicitly, and corrections update the report. See the [implementation
and verification record](docs/superpowers/plans/2026-09-26-yardages-round-report.md).

### Plan your shot and keep personal hole notes

Open **Play → Plan** for club advice using a fresh green-center GPS distance or a
manual target, with carry/total and source filters. Saved bag profiles work offline.
The personal notebook keeps private strategy by course/hole for future rounds;
round-specific observations remain in Green. Drafts save on the device, explicit
Save queues synchronization, and conflicting edits require review. Course downloads
also prepare the notebook. See [usage, migration and verification](docs/play-plan-notebook.md).

Shot history now preserves GPS endpoints, shot order, club and lie details, penalties,
and corrections across devices. The Shots tab includes offline hole replay, manual
entry, recoverable removal, and conflict review. See the [shot history guide](docs/shot-history-replay.md).
