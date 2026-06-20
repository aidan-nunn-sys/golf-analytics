from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import SessionLocal, create_db_and_tables
from app.routers import admin, auth, clubs, sessions, shots, stats
from app.seed import bootstrap_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    db = SessionLocal()
    try:
        bootstrap_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Golf Analytics API", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(clubs.router)
app.include_router(sessions.router)
app.include_router(shots.router)
app.include_router(stats.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
