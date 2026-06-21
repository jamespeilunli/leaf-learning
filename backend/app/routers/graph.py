from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Iterable

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.ai import expand_phase2_node, explain_prerequisite, suggest_prerequisite
from app.models import GraphEdge, GraphNode, Resource, Session
from app.openai_key import request_openai_api_key, require_openai_api_key
from app.phase2_prefetch import (
    PHASE2_INCREMENTAL_PREFETCH_LAYERS,
    adopt_prefetched_children_by_label,
    can_add_phase2_children,
    normalized_label,
    phase2_context_path,
    prefetch_phase2_tree,
    reveal_direct_phase2_children,
)
from app.storage import load_session, merge_save_session, save_session


router = APIRouter()
logger = logging.getLogger(__name__)


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


async def _prefetch_descendants(
    session_id: str,
    start_node_ids: list[str],
    goal_label: str,
    openai_api_key: str | None = None,
) -> None:
    try:
        session = load_session(session_id)
        for start_node_id in start_node_ids:
            start_node = session.nodes.get(start_node_id)
            if not start_node:
                continue
            await prefetch_phase2_tree(
                session,
                start_node,
                goal_label,
                on_progress=merge_save_session,
                max_layers_from_start=PHASE2_INCREMENTAL_PREFETCH_LAYERS,
                openai_api_key=openai_api_key,
            )
        merge_save_session(session)
    except Exception:
        return


@router.post("/session/{session_id}/node/{node_id}/expand")
async def expand_node(
    session_id: str,
    node_id: str,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> StreamingResponse:
    openai_api_key = require_openai_api_key(openai_api_key)
    session = load_session(session_id)
    node = _get_node(session, node_id)
    if not session.focus_node_id:
        raise HTTPException(status_code=400, detail="Phase 2 focus node is not set.")
    if node.node_state != "grayed" and node.id != session.focus_node_id:
        raise HTTPException(status_code=400, detail="Node is not expandable.")
    node.node_state = "expanded"
    node.phase = "2"
    node.is_visible = True
    session = merge_save_session(session)
    node = _get_node(session, node_id)
    goal_label = _get_node(session, session.focus_node_id).label

    async def event_stream() -> Iterable[str]:
        nonlocal session, node
        session = merge_save_session(session)
        node = _get_node(session, node_id)

        children_allowed = can_add_phase2_children(node)

        if children_allowed and not node.child_ids and adopt_prefetched_children_by_label(session, node):
            session = merge_save_session(session)
            node = _get_node(session, node_id)

        if children_allowed and node.child_ids:
            revealed_nodes, revealed_edges = reveal_direct_phase2_children(session, node)
            merge_save_session(session)
            asyncio.create_task(
                _prefetch_descendants(
                    session.id,
                    [child.id for child in revealed_nodes],
                    goal_label,
                    openai_api_key=openai_api_key,
                )
            )
            yield _sse("node_updated", node.model_dump(by_alias=True))
            for child in revealed_nodes:
                yield _sse("node_added", child.model_dump(by_alias=True))
            for edge in revealed_edges:
                yield _sse("edge_added", edge.model_dump(by_alias=True))
            yield _sse("stream_done", {})
            return

        if not children_allowed and (node.resource or node.sources):
            yield _sse("node_updated", node.model_dump(by_alias=True))
            yield _sse("stream_done", {})
            return

        context_path = phase2_context_path(session, node)
        blocked_labels = {normalized_label(label) for label in context_path}
        blocked_labels.update(
            normalized_label(session.nodes[child_id].label)
            for child_id in node.child_ids
            if child_id in session.nodes
        )
        known_topics = sorted(set(session.known_topics) | blocked_labels)

        revealed_node_ids: list[str] = []
        async for event in expand_phase2_node(
            node.label,
            known_topics,
            goal_label,
            context_path=context_path,
            openai_api_key=openai_api_key,
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
                merge_save_session(session)
                yield _sse("node_updated", {"id": node.id, **data})
                continue

            if event_name == "node_added":
                if not can_add_phase2_children(node):
                    continue
                child = GraphNode.model_validate(data)
                child.parent_id = node.id
                child.depth = node.depth + 1
                child.phase = "2"
                child.node_state = "grayed"
                child.is_visible = True
                logger.info(
                    "Generated phase2 node mode=on-demand session_id=%s parent_id=%s parent_label=%r node_id=%s node_label=%r depth=%s",
                    session.id,
                    node.id,
                    node.label,
                    child.id,
                    child.label,
                    child.depth,
                )
                session.nodes[child.id] = child
                if child.id not in node.child_ids:
                    node.child_ids.append(child.id)
                revealed_node_ids.append(child.id)
                merge_save_session(session)
                yield _sse("node_added", child.model_dump(by_alias=True))
                continue

            if event_name == "edge_added":
                if not can_add_phase2_children(node):
                    continue
                edge = GraphEdge.model_validate(data)
                edge.from_id = node.id
                session.edges.append(edge)
                merge_save_session(session)
                yield _sse("edge_added", edge.model_dump(by_alias=True))
                continue

            merge_save_session(session)
            yield _sse(event_name, data)
            if event_name in {"stream_done", "stream_error"}:
                if event_name == "stream_done" and revealed_node_ids:
                    asyncio.create_task(
                        _prefetch_descendants(
                            session.id,
                            revealed_node_ids,
                            goal_label,
                            openai_api_key=openai_api_key,
                        )
                    )
                return

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/session/{session_id}/node/{node_id}/suggest-prerequisite")
async def suggest_node_prerequisite(
    session_id: str,
    node_id: str,
    payload: SuggestPrerequisiteRequest,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> dict:
    session = load_session(session_id)
    parent = _get_node(session, node_id)
    if parent.node_state not in {"expanded", "learned"}:
        raise HTTPException(status_code=400, detail="Missing prerequisites can only be added to active nodes.")
    if not can_add_phase2_children(parent):
        raise HTTPException(status_code=400, detail="Maximum Phase 2 depth reached.")

    openai_api_key = require_openai_api_key(openai_api_key)
    suggestion = await suggest_prerequisite(
        payload.message,
        parent.label,
        parent.description or "",
        openai_api_key=openai_api_key,
    )
    child = GraphNode(
        label=suggestion["label"],
        description=suggestion["description"],
        phase="2",
        node_state="grayed",
        parent_id=parent.id,
        depth=parent.depth + 1,
    )
    edge = GraphEdge(from_id=parent.id, to_id=child.id, label="requires")
    session.nodes[child.id] = child
    parent.child_ids.append(child.id)
    session.edges.append(edge)
    save_session(session)
    return {
        "node": child.model_dump(by_alias=True),
        "edge": edge.model_dump(by_alias=True),
    }


@router.post("/session/{session_id}/node/{node_id}/explain")
async def explain_node(
    session_id: str,
    node_id: str,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> dict:
    session = load_session(session_id)
    node = _get_node(session, node_id)
    if node.node_state != "grayed":
        raise HTTPException(status_code=400, detail="Only grayed nodes can be explained.")
    if not node.parent_id:
        raise HTTPException(status_code=400, detail="Node has no parent context.")
    parent = _get_node(session, node.parent_id)
    openai_api_key = require_openai_api_key(openai_api_key)
    text = await explain_prerequisite(
        node.label,
        parent.label,
        parent.description or "",
        openai_api_key=openai_api_key,
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
