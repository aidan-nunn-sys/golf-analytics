from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm.exc import StaleDataError
from fastapi.staticfiles import StaticFiles

from app.database import SessionLocal, run_migrations
from app.routers import hole_notes
from app.routers import shot_history
from app.routers import course_library, offline, scorecards, admin, auth, clubs, courses, rounds, sessions, shots, stats, tees
from app.seed import bootstrap_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    db = SessionLocal()
    try:
        bootstrap_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Golf Analytics API", lifespan=lifespan)

api = FastAPI(title="Golf Analytics API")
@api.exception_handler(StaleDataError)
async def concurrent_edit(request, exc):
    return JSONResponse(status_code=409, content={"detail": "This round changed while saving. Refresh and review your changes."})


api.include_router(course_library.router)
api.include_router(hole_notes.router)
api.include_router(shot_history.router)
api.include_router(offline.router)
api.include_router(auth.router)
api.include_router(admin.router)
api.include_router(clubs.router)
api.include_router(courses.router)
api.include_router(rounds.router)
api.include_router(sessions.router)
api.include_router(shots.router)
api.include_router(stats.router)
api.include_router(tees.router)
api.include_router(scorecards.router)


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.mount("/api", api)

# Serve the built SPA if present (production image). In dev the frontend runs
# under Vite and proxies /api here, so this block is simply skipped.
_STATIC = Path(__file__).resolve().parent / "static"
if _STATIC.is_dir():
    app.mount("/assets", StaticFiles(directory=_STATIC / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str) -> FileResponse:
        # Serve real files if they exist (favicon, etc.); otherwise index.html
        # so client-side routes like /sessions resolve on hard refresh.
        # full_path is attacker-controlled, so resolve it and confirm it's
        # still inside _STATIC before serving (blocks ../ path traversal).
        candidate = (_STATIC / full_path).resolve()
        if full_path and candidate.is_relative_to(_STATIC) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC / "index.html")
