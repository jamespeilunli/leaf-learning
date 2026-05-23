from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.routers import chat, graph, session
from app.storage import ensure_sessions_dir

ensure_sessions_dir()

app = FastAPI(title="Learning Roadmap API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(session.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
