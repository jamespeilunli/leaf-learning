from __future__ import annotations

import json
from collections.abc import Iterable

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.ai import expand_phase2_node, explain_prerequisite
from app.graph_utils import (
    collect_exclusive_descendants,
    find_phase2_node_by_label,
    normalize_phase2_graph,
    normalize_topic_label,
    recompute_phase2_depths,
    upsert_phase2_edge,
)
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


@router.post("/session/{session_id}/node/{node_id}/expand")
async def expand_node(session_id: str, node_id: str) -> StreamingResponse:
    session = load_session(session_id)
    normalize_phase2_graph(session)
    node = _get_node(session, node_id)
    if not session.focus_node_id:
        raise HTTPException(status_code=400, detail="Phase 2 focus node is not set.")
    if node.node_state != "grayed" and node.id != session.focus_node_id:
        raise HTTPException(status_code=400, detail="Node is not expandable.")
    node.node_state = "expanded"
    save_session(session)
    goal_label = _get_node(session, session.focus_node_id).label
    merged_child_ids: dict[str, str] = {}

    async def event_stream() -> Iterable[str]:
        async for event in expand_phase2_node(
            node.label,
            session.known_topics,
            goal_label,
        ):
            event_name = event["event"]
            data = event["data"]

            if event_name == "node_updated":
                if data.get("resource"):
                    node.resource = Resource.model_validate(data["resource"])
                save_session(session)
                payload = {"id": node.id, **data}
                yield _sse("node_updated", payload)
                continue

            if event_name == "node_added":
                incoming_child = GraphNode.model_validate(data)
                existing = find_phase2_node_by_label(session, incoming_child.label)

                if existing is not None:
                    child = existing
                    merged_child_ids[incoming_child.id] = child.id
                    if child.description is None or (
                        incoming_child.description
                        and len(incoming_child.description) > len(child.description or "")
                    ):
                        child.description = incoming_child.description
                    normalize_phase2_graph(session)
                    save_session(session)
                    continue

                child = incoming_child
                child.parent_id = node.id
                child.depth = node.depth + 1
                child.phase = "2"
                child.node_state = "grayed"
                session.nodes[child.id] = child
                merged_child_ids[incoming_child.id] = child.id
                if child.id not in node.child_ids:
                    node.child_ids.append(child.id)
                normalize_phase2_graph(session)
                save_session(session)
                yield _sse("node_added", child.model_dump(by_alias=True))
                continue

            if event_name == "edge_added":
                raw_edge = GraphEdge.model_validate(data)
                child_id = merged_child_ids.get(raw_edge.to_id, raw_edge.to_id)
                child = session.nodes.get(child_id)
                if child is None:
                    continue
                if child.parent_id not in {None, node.id}:
                    normalize_phase2_graph(session)
                    save_session(session)
                    continue
                edge = upsert_phase2_edge(session, node.id, child.id, None)
                if edge is None:
                    normalize_phase2_graph(session)
                    save_session(session)
                    continue
                recompute_phase2_depths(session)
                normalize_phase2_graph(session)
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
    normalize_phase2_graph(session)
    node = _get_node(session, node_id)
    if node.node_state != "grayed":
        raise HTTPException(status_code=400, detail="Only grayed nodes can be explained.")
    if not node.parent_id:
        raise HTTPException(status_code=400, detail="Node has no parent context.")
    parent = _get_node(session, node.parent_id)
    text = await explain_prerequisite(
        node.label,
        parent.label,
        parent.description or "",
    )
    node.explain_more_text = text
    save_session(session)
    return {"explain_more_text": text}


@router.delete("/session/{session_id}/node/{node_id}")
def delete_node(session_id: str, node_id: str) -> dict:
    session = load_session(session_id)
    normalize_phase2_graph(session)
    node = _get_node(session, node_id)
    removed_node_ids = collect_exclusive_descendants(session, node_id)

    for removed_id in removed_node_ids:
        session.nodes.pop(removed_id, None)

    session.edges = [
        edge
        for edge in session.edges
        if edge.from_id not in removed_node_ids and edge.to_id not in removed_node_ids
    ]

    normalize_phase2_graph(session)

    save_session(session)
    return {"removed_node_ids": sorted(removed_node_ids)}


@router.patch("/session/{session_id}/node/{node_id}/status")
def update_node_status(session_id: str, node_id: str, payload: UpdateNodeStateRequest) -> dict:
    if payload.node_state not in {"learned", "grayed"}:
        raise HTTPException(status_code=400, detail="Invalid node_state.")

    session = load_session(session_id)
    normalize_phase2_graph(session)
    node = _get_node(session, node_id)
    node.node_state = payload.node_state

    if payload.node_state == "learned":
        normalized = normalize_topic_label(node.label)
        if normalized not in session.known_topics:
            session.known_topics.append(normalized)
        for other in session.nodes.values():
            if other.node_state == "grayed" and normalize_topic_label(other.label) == normalized:
                other.explain_more_text = "__known__"
    else:
        normalized = normalize_topic_label(node.label)
        if normalized in session.known_topics:
            session.known_topics = [topic for topic in session.known_topics if topic != normalized]
        for other in session.nodes.values():
            if other.explain_more_text == "__known__" and normalize_topic_label(other.label) == normalized:
                other.explain_more_text = None

    normalize_phase2_graph(session)
    save_session(session)
    return session.model_dump(by_alias=True)
