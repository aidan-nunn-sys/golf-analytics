# Golf Analytics

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

Roadmap: launch-monitor import; GPS-measured range shots; scores/handicap/round
stats; learning profile.

## License

MIT — see [LICENSE](LICENSE).
