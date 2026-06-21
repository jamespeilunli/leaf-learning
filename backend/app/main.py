import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def configure_logging() -> None:
    level_name = os.getenv("ALPHAG3N_LOG_LEVEL", "INFO").strip().upper()
    level = getattr(logging, level_name, logging.INFO)
    app_logger = logging.getLogger("app")
    app_logger.setLevel(level)
    app_logger.propagate = False

    if app_logger.handlers:
        for handler in app_logger.handlers:
            handler.setLevel(level)
        return

    handler = logging.StreamHandler()
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
    app_logger.addHandler(handler)


configure_logging()

from app.routers import chat, graph, session
from app.cors import get_cors_origins

app = FastAPI(title="Learning Roadmap API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(session.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
