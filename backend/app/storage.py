from pathlib import Path

from fastapi import HTTPException

from app.models import Session


SESSIONS_DIR = Path(__file__).parent.parent / "sessions"


def ensure_sessions_dir() -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


def session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def save_session(session: Session) -> None:
    session_path(session.id).write_text(session.model_dump_json(indent=2, by_alias=True))


def load_session(session_id: str) -> Session:
    path = session_path(session_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return Session.model_validate_json(path.read_text())


def list_sessions() -> list[dict]:
    result: list[dict] = []
    for file_path in SESSIONS_DIR.glob("*.json"):
        try:
            session = Session.model_validate_json(file_path.read_text())
        except Exception:
            continue

        result.append(
            {
                "id": session.id,
                "root_topic": session.root_topic,
                "created_at": session.created_at,
                "phase": session.phase,
            }
        )

    return sorted(result, key=lambda item: item["created_at"], reverse=True)
