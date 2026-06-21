import os


DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://alphag3n-hackathon-2026-u87w.onrender.com",
)


def normalize_cors_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


def get_cors_origins(raw_origins: str | None = None) -> list[str]:
    configured_origins = os.getenv("ALPHAG3N_CORS_ORIGINS", "") if raw_origins is None else raw_origins
    parsed_origins = [
        normalized
        for origin in configured_origins.split(",")
        if (normalized := normalize_cors_origin(origin))
    ]

    return parsed_origins or list(DEFAULT_CORS_ORIGINS)
