from pathlib import Path

from fastapi import HTTPException

from app.models import GraphNode, Session


SESSIONS_DIR = Path(__file__).parent.parent / "sessions"


def ensure_sessions_dir() -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


def session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def save_session(session: Session) -> None:
    session_path(session.id).write_text(session.model_dump_json(indent=2, by_alias=True))


def _merge_node(existing: GraphNode | None, incoming: GraphNode) -> GraphNode:
    if existing is None:
        return incoming

    merged = incoming.model_copy(deep=True)
    merged.child_ids = list(dict.fromkeys([*existing.child_ids, *incoming.child_ids]))
    merged.chat_history = incoming.chat_history or existing.chat_history
    merged.sources = incoming.sources or existing.sources
    merged.resource = incoming.resource or existing.resource
    merged.explain_more_text = incoming.explain_more_text or existing.explain_more_text
    merged.is_visible = existing.is_visible or incoming.is_visible

    state_rank = {"grayed": 0, "expanded": 1, "learned": 2}
    if state_rank[existing.node_state] > state_rank[incoming.node_state]:
        merged.node_state = existing.node_state

    return merged


def merge_save_session(session: Session) -> Session:
    path = session_path(session.id)
    if not path.exists():
        save_session(session)
        return session

    latest = Session.model_validate_json(path.read_text())
    merged = session.model_copy(deep=True)
    merged.known_topics = list(dict.fromkeys([*latest.known_topics, *session.known_topics]))
    merged.nodes = {
        node_id: _merge_node(latest.nodes.get(node_id), node)
        for node_id, node in session.nodes.items()
    }

    for node_id, node in latest.nodes.items():
        if node_id not in merged.nodes:
            merged.nodes[node_id] = node

    edges_by_id = {edge.id: edge for edge in latest.edges}
    for edge in session.edges:
        edges_by_id[edge.id] = edge
    merged.edges = list(edges_by_id.values())

    save_session(merged)
    return merged


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
