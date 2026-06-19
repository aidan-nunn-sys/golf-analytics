from fastapi import FastAPI

app = FastAPI(title="Golf Analytics API", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
