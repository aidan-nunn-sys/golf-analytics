# --- build the SPA ---
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- python runtime ---
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY backend/pyproject.toml ./
# alembic.ini and the migration scripts are required at runtime: the app's
# lifespan calls run_migrations(), which loads /app/alembic.ini on startup.
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app
RUN pip install --no-cache-dir .
COPY --from=web /web/dist ./app/static
RUN useradd --create-home appuser && mkdir -p /data && chown appuser:appuser /data
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
