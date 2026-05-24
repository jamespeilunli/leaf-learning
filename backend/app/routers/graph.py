from __future__ import annotations

import json
from collections.abc import Iterable

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.ai import expand_phase2_node, explain_prerequisite, suggest_prerequisite
from app.graph_utils import add_phase2_child
from app.models import GraphEdge, GraphNode, Resource, Session
from app.storage import load_session, save_session


router = APIRouter()


class UpdateNodeStateRequest(BaseModel):
    node_state: str


class SuggestPrerequisiteRequest(BaseModel):
    message: str


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
    if node.node_state != "grayed":
        raise HTTPException(status_code=400, detail="Node is not expandable.")
    node.node_state = "expanded"
    save_session(session)
    goal_label = _get_node(session, session.focus_node_id).label
    child_id_map: dict[str, str] = {}
    skipped_child_ids: set[str] = set()

    async def event_stream() -> Iterable[str]:
        async for event in expand_phase2_node(
            node.label,
            session.known_topics,
            goal_label,
        ):
            event_name = event["event"]
            data = event["data"]

            if event_name == "node_updated":
                if data.get("sources"):
                    node.sources = [Resource.model_validate(item) for item in data["sources"]]
                if data.get("resource"):
                    node.resource = Resource.model_validate(data["resource"])
                    if not node.sources:
                        node.sources = [node.resource]
                save_session(session)
                payload = {"id": node.id, **data}
                yield _sse("node_updated", payload)
                continue

            if event_name == "node_added":
                child = GraphNode.model_validate(data)
                linked_child, _, _ = add_phase2_child(session, node, child)
                if not linked_child:
                    skipped_child_ids.add(child.id)
                    continue
                child_id_map[child.id] = linked_child.id
                save_session(session)
                yield _sse("node_added", linked_child.model_dump(by_alias=True))
                continue

            if event_name == "edge_added":
                edge = GraphEdge.model_validate(data)
                if edge.to_id in skipped_child_ids:
                    continue
                if edge.to_id in child_id_map:
                    edge.to_id = child_id_map[edge.to_id]
                existing = next(
                    (
                        current
                        for current in session.edges
                        if current.from_id == node.id and current.to_id == edge.to_id
                    ),
                    None,
                )
                if existing is None:
                    edge.from_id = node.id
                    session.edges.append(edge)
                    existing = edge
                save_session(session)
                yield _sse("edge_added", existing.model_dump(by_alias=True))
                continue

            save_session(session)
            yield _sse(event_name, data)
            if event_name in {"stream_done", "stream_error"}:
                return

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/session/{session_id}/node/{node_id}/suggest-prerequisite")
async def suggest_node_prerequisite(
    session_id: str,
    node_id: str,
    payload: SuggestPrerequisiteRequest,
) -> dict:
    session = load_session(session_id)
    parent = _get_node(session, node_id)
    if parent.node_state not in {"expanded", "learned"}:
        raise HTTPException(status_code=400, detail="Missing prerequisites can only be added to active nodes.")

    suggestion = await suggest_prerequisite(
        payload.message,
        parent.label,
        parent.description or "",
    )
    child = GraphNode(
        label=suggestion["label"],
        description=suggestion["description"],
        phase="2",
        node_state="grayed",
    )
    linked_child, edge, _ = add_phase2_child(session, parent, child)
    if not linked_child or edge is None:
        raise HTTPException(status_code=400, detail="Suggested prerequisite would repeat an ancestor path.")
    save_session(session)
    return {
        "node": linked_child.model_dump(by_alias=True),
        "edge": edge.model_dump(by_alias=True),
    }


@router.post("/session/{session_id}/node/{node_id}/explain")
async def explain_node(session_id: str, node_id: str) -> dict:
    session = load_session(session_id)
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
    node = session.nodes.get(node_id)
    if not node:
        return {"removed_node_ids": [node_id]}

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
