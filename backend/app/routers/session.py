from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.ai import generate_phase1_children
from app.models import GraphNode, Session
from app.openai_key import request_openai_api_key, require_openai_api_key


router = APIRouter()


class CreateSessionRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)


class GeneratePhase1ChildrenRequest(BaseModel):
    session: Session
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

    async for event in generate_phase1_children(topic, [], openai_api_key=openai_api_key):
        if event["event"] == "node_added":
            child = GraphNode.model_validate(event["data"])
            child.parent_id = root_node.id
            child.depth = 1
            session.nodes[child.id] = child
            root_node.child_ids.append(child.id)
        elif event["event"] == "stream_error":
            raise HTTPException(status_code=502, detail=event["data"]["message"])

    return {"session_id": session.id, "session": session.model_dump(by_alias=True)}


@router.post("/phase1/children")
async def generate_phase1_node_children(
    payload: GeneratePhase1ChildrenRequest,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> dict:
    session = payload.session
    selected = _get_node(session, payload.node_id)
    if selected.phase != "1":
        raise HTTPException(status_code=400, detail="Only Phase 1 nodes can be expanded here.")
    if selected.child_ids:
        return {"children": []}

    openai_api_key = require_openai_api_key(openai_api_key)
    children: list[dict] = []
    async for event in generate_phase1_children(
        selected.label,
        _ancestor_labels(session, selected),
        openai_api_key=openai_api_key,
    ):
        if event["event"] == "node_added":
            child = GraphNode.model_validate(event["data"])
            child.parent_id = payload.node_id
            child.depth = selected.depth + 1
            children.append(child.model_dump(by_alias=True))
        elif event["event"] == "stream_error":
            raise HTTPException(status_code=502, detail=event["data"]["message"])

    return {"children": children}
