from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.ai import generate_phase1_children
from app.models import GraphNode, Session
from app.openai_key import request_openai_api_key, require_openai_api_key
from app.storage import delete_all_sessions, list_sessions, load_session, save_session


router = APIRouter()


class CreateSessionRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)


class SelectTopicRequest(BaseModel):
    node_id: str


class DeepDiveRequest(BaseModel):
    node_id: str


def _get_node(session: Session, node_id: str) -> GraphNode:
    node = session.nodes.get(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return node


def _ancestor_labels(session: Session, node: GraphNode) -> list[str]:
    labels: list[str] = []
    current: GraphNode | None = node
    while current:
        labels.append(current.label)
        current = session.nodes.get(current.parent_id) if current.parent_id else None
    return list(reversed(labels))


@router.post("/session")
async def create_session(
    payload: CreateSessionRequest,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> dict:
    openai_api_key = require_openai_api_key(openai_api_key)
    topic = payload.topic.strip()
    root_node = GraphNode(
        label=topic,
        description="Starting topic",
        phase="1",
        node_state="expanded",
        depth=0,
    )
    session = Session(
        root_topic=topic,
        current_phase1_node_id=root_node.id,
        nodes={root_node.id: root_node},
    )
    save_session(session)

    async for event in generate_phase1_children(topic, [], openai_api_key=openai_api_key):
        if event["event"] == "node_added":
            child = GraphNode.model_validate(event["data"])
            child.parent_id = root_node.id
            child.depth = 1
            session.nodes[child.id] = child
            root_node.child_ids.append(child.id)
        elif event["event"] == "stream_error":
            raise HTTPException(status_code=502, detail=event["data"]["message"])

    save_session(session)
    return {"session_id": session.id, "session": session.model_dump(by_alias=True)}


@router.get("/session/{session_id}")
def get_session(session_id: str) -> dict:
    return load_session(session_id).model_dump(by_alias=True)


@router.get("/sessions")
def get_sessions() -> list[dict]:
    return list_sessions()


@router.delete("/sessions")
def clear_sessions() -> dict:
    return {"deleted_count": delete_all_sessions()}


@router.post("/session/{session_id}/select-topic")
async def select_topic(
    session_id: str,
    payload: SelectTopicRequest,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> dict:
    session = load_session(session_id)
    current_id = session.current_phase1_node_id
    if current_id is None:
        raise HTTPException(status_code=400, detail="No current Phase 1 node.")
    selected = _get_node(session, payload.node_id)

    session.selection_history.append(current_id)
    session.current_phase1_node_id = payload.node_id

    if selected.child_ids:
        save_session(session)
        return session.model_dump(by_alias=True)

    openai_api_key = require_openai_api_key(openai_api_key)
    async for event in generate_phase1_children(
        selected.label,
        _ancestor_labels(session, selected),
        openai_api_key=openai_api_key,
    ):
        if event["event"] == "node_added":
            child = GraphNode.model_validate(event["data"])
            child.parent_id = payload.node_id
            child.depth = selected.depth + 1
            session.nodes[child.id] = child
            selected.child_ids.append(child.id)
        elif event["event"] == "stream_error":
            raise HTTPException(status_code=502, detail=event["data"]["message"])

    save_session(session)
    return session.model_dump(by_alias=True)


@router.post("/session/{session_id}/phase1-expand")
async def expand_phase1_topic(
    session_id: str,
    payload: SelectTopicRequest,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> dict:
    session = load_session(session_id)
    selected = _get_node(session, payload.node_id)

    if selected.phase != "1":
        raise HTTPException(status_code=400, detail="Only Phase 1 nodes can be expanded here.")

    if selected.child_ids:
        save_session(session)
        return session.model_dump(by_alias=True)

    openai_api_key = require_openai_api_key(openai_api_key)
    async for event in generate_phase1_children(
        selected.label,
        _ancestor_labels(session, selected),
        openai_api_key=openai_api_key,
    ):
        if event["event"] == "node_added":
            child = GraphNode.model_validate(event["data"])
            child.parent_id = payload.node_id
            child.depth = selected.depth + 1
            session.nodes[child.id] = child
            selected.child_ids.append(child.id)
        elif event["event"] == "stream_error":
            raise HTTPException(status_code=502, detail=event["data"]["message"])

    save_session(session)
    return session.model_dump(by_alias=True)


@router.post("/session/{session_id}/back")
def back(session_id: str) -> dict:
    session = load_session(session_id)
    if not session.selection_history:
        raise HTTPException(status_code=400, detail="Already at root.")
    session.current_phase1_node_id = session.selection_history.pop()
    save_session(session)
    return session.model_dump(by_alias=True)


@router.post("/session/{session_id}/resolution")
def set_resolution(session_id: str) -> dict:
    session = load_session(session_id)
    session.resolution = "technical"
    save_session(session)
    return session.model_dump(by_alias=True)


@router.post("/session/{session_id}/deep-dive")
async def deep_dive(session_id: str, payload: DeepDiveRequest) -> dict:
    session = load_session(session_id)
    node = _get_node(session, payload.node_id)
    session.focus_node_id = payload.node_id
    session.phase = "2"
    node.phase = "2"
    node.node_state = "expanded"
    node.is_visible = True
    node.child_ids = [
        child_id
        for child_id in node.child_ids
        if child_id in session.nodes and session.nodes[child_id].phase == "2"
    ]
    save_session(session)
    return {"session": session.model_dump(by_alias=True)}
