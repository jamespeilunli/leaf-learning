from __future__ import annotations

import json
from collections.abc import Iterable

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.ai import expand_phase2_node, explain_prerequisite
from app.models import GraphEdge, GraphNode, Resource, Session
from app.storage import load_session, save_session


router = APIRouter()


class UpdateNodeStateRequest(BaseModel):
    node_state: str


def _sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _get_node(session: Session, node_id: str) -> GraphNode:
    node = session.nodes.get(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return node


def _normalized(label: str) -> str:
    return " ".join(label.lower().strip().split())


def _collect_descendants(session: Session, node_id: str) -> set[str]:
    collected = {node_id}
    stack = [node_id]
    while stack:
        current_id = stack.pop()
        current = session.nodes.get(current_id)
        if not current:
            continue
        for child_id in current.child_ids:
            if child_id not in collected:
                collected.add(child_id)
                stack.append(child_id)
    return collected


@router.post("/session/{session_id}/node/{node_id}/expand")
async def expand_node(session_id: str, node_id: str) -> StreamingResponse:
    session = load_session(session_id)
    node = _get_node(session, node_id)
    if not session.focus_node_id:
        raise HTTPException(status_code=400, detail="Phase 2 focus node is not set.")
    if node.node_state != "grayed" and node.id != session.focus_node_id:
        raise HTTPException(status_code=400, detail="Node is not expandable.")
    if not session.resolution:
        raise HTTPException(status_code=400, detail="Resolution must be selected first.")

    node.node_state = "expanded"
    save_session(session)
    goal_label = _get_node(session, session.focus_node_id).label

    async def event_stream() -> Iterable[str]:
        async for event in expand_phase2_node(
            node.label,
            session.resolution,
            session.known_topics,
            goal_label,
        ):
            event_name = event["event"]
            data = event["data"]

            if event_name == "node_updated":
                if data.get("resource"):
                    node.resource = Resource.model_validate(data["resource"])
                node.intuition_score = data.get("intuition_score")
                save_session(session)
                payload = {"id": node.id, **data}
                yield _sse("node_updated", payload)
                continue

            if event_name == "node_added":
                child = GraphNode.model_validate(data)
                child.parent_id = node.id
                child.depth = node.depth + 1
                child.phase = "2"
                child.node_state = "grayed"
                session.nodes[child.id] = child
                if child.id not in node.child_ids:
                    node.child_ids.append(child.id)
                save_session(session)
                yield _sse("node_added", child.model_dump(by_alias=True))
                continue

            if event_name == "edge_added":
                edge = GraphEdge.model_validate(data)
                edge.from_id = node.id
                session.edges.append(edge)
                save_session(session)
                yield _sse("edge_added", edge.model_dump(by_alias=True))
                continue

            save_session(session)
            yield _sse(event_name, data)
            if event_name in {"stream_done", "stream_error"}:
                return

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/session/{session_id}/node/{node_id}/explain")
async def explain_node(session_id: str, node_id: str) -> dict:
    session = load_session(session_id)
    node = _get_node(session, node_id)
    if node.node_state != "grayed":
        raise HTTPException(status_code=400, detail="Only grayed nodes can be explained.")
    if not node.parent_id:
        raise HTTPException(status_code=400, detail="Node has no parent context.")
    if not session.resolution:
        raise HTTPException(status_code=400, detail="Resolution must be selected first.")

    parent = _get_node(session, node.parent_id)
    text = await explain_prerequisite(
        node.label,
        parent.label,
        parent.description or "",
        session.resolution,
    )
    node.explain_more_text = text
    save_session(session)
    return {"explain_more_text": text}


@router.delete("/session/{session_id}/node/{node_id}")
def delete_node(session_id: str, node_id: str) -> dict:
    session = load_session(session_id)
    node = _get_node(session, node_id)
    removed_node_ids = _collect_descendants(session, node_id)

    if node.parent_id and node.parent_id in session.nodes:
        parent = session.nodes[node.parent_id]
        parent.child_ids = [child_id for child_id in parent.child_ids if child_id != node_id]

    for removed_id in removed_node_ids:
        session.nodes.pop(removed_id, None)

    session.edges = [
        edge
        for edge in session.edges
        if edge.from_id not in removed_node_ids and edge.to_id not in removed_node_ids
    ]

    save_session(session)
    return {"removed_node_ids": sorted(removed_node_ids)}


@router.patch("/session/{session_id}/node/{node_id}/status")
def update_node_status(session_id: str, node_id: str, payload: UpdateNodeStateRequest) -> dict:
    if payload.node_state not in {"learned", "grayed"}:
        raise HTTPException(status_code=400, detail="Invalid node_state.")

    session = load_session(session_id)
    node = _get_node(session, node_id)
    node.node_state = payload.node_state

    if payload.node_state == "learned":
        normalized = _normalized(node.label)
        if normalized not in session.known_topics:
            session.known_topics.append(normalized)
        for other in session.nodes.values():
            if other.node_state == "grayed" and _normalized(other.label) == normalized:
                other.explain_more_text = "__known__"
    else:
        normalized = _normalized(node.label)
        if normalized in session.known_topics:
            session.known_topics = [topic for topic in session.known_topics if topic != normalized]
        for other in session.nodes.values():
            if other.explain_more_text == "__known__" and _normalized(other.label) == normalized:
                other.explain_more_text = None

    save_session(session)
    return session.model_dump(by_alias=True)
