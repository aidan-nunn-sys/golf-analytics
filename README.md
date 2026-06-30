# Golf Analytics

Self-hosted, open-source golf analytics. v1: club & shot analysis (range engine) — log shots per club, get stock yardages, gapping, consistency, and dispersion.

## Run with Docker

```bash
cp backend/.env.example .env   # edit the values
docker compose up --build
```

API runs at http://localhost:8000 — interactive docs at `/docs`.
The first run creates an admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`; the admin creates other accounts (no open signup).

## Develop the backend

```bash
cd backend
pip install -e ".[dev]"
pytest
uvicorn app.main:app --reload
```

## Status

v1 backend: accounts, club bag, range sessions, manual shot logging, derived stats (club detail, gapping, dashboard).

Roadmap: React frontend; launch-monitor import; GPS-measured shots; on-course GPS + OpenStreetMap; scores/handicap/round stats; learning profile.

## License

MIT — see [LICENSE](LICENSE).
