from __future__ import annotations

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


router = APIRouter()
logger = logging.getLogger(__name__)


class SessionSnapshotRequest(BaseModel):
    session: Session


class SuggestPrerequisiteRequest(BaseModel):
    session: Session
    message: str


class PrefetchPhase2Request(BaseModel):
    session: Session
    start_node_ids: list[str]


def _sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _get_node(session: Session, node_id: str) -> GraphNode:
    node = session.nodes.get(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return node


def _normalize_session(session: Session) -> Session:
    return session.model_copy(deep=True)


def _new_graph_items(before: Session, after: Session) -> tuple[list[GraphNode], list[GraphEdge]]:
    before_node_ids = set(before.nodes)
    before_edge_ids = {edge.id for edge in before.edges}
    nodes = [node for node_id, node in after.nodes.items() if node_id not in before_node_ids]
    edges = [edge for edge in after.edges if edge.id not in before_edge_ids]
    return nodes, edges


@router.post("/session/{session_id}/node/{node_id}/expand")
async def expand_node(
    session_id: str,
    node_id: str,
    payload: SessionSnapshotRequest,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> StreamingResponse:
    del session_id
    openai_api_key = require_openai_api_key(openai_api_key)
    session = _normalize_session(payload.session)
    node = _get_node(session, node_id)
    if not session.focus_node_id:
        raise HTTPException(status_code=400, detail="Phase 2 focus node is not set.")
    if node.node_state not in {"grayed", "expanded"} and node.id != session.focus_node_id:
        raise HTTPException(status_code=400, detail="Node is not expandable.")
    node.node_state = "expanded"
    node.phase = "2"
    node.is_visible = True
    goal_label = _get_node(session, session.focus_node_id).label

    async def event_stream() -> Iterable[str]:
        children_allowed = can_add_phase2_children(node)
        phase2_child_ids = [
            child_id
            for child_id in node.child_ids
            if session.nodes.get(child_id) and session.nodes[child_id].phase == "2"
        ]

        if children_allowed and not phase2_child_ids and adopt_prefetched_children_by_label(session, node):
            phase2_child_ids = [
                child_id
                for child_id in node.child_ids
                if session.nodes.get(child_id) and session.nodes[child_id].phase == "2"
            ]
            yield _sse("node_updated", node.model_dump(by_alias=True))

        if children_allowed and phase2_child_ids:
            revealed_nodes, revealed_edges = reveal_direct_phase2_children(session, node)
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
                yield _sse("node_added", child.model_dump(by_alias=True))
                continue

            if event_name == "edge_added":
                if not can_add_phase2_children(node):
                    continue
                edge = GraphEdge.model_validate(data)
                edge.from_id = node.id
                session.edges.append(edge)
                yield _sse("edge_added", edge.model_dump(by_alias=True))
                continue

            yield _sse(event_name, data)
            if event_name in {"stream_done", "stream_error"}:
                return

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/session/{session_id}/phase2/prefetch")
async def prefetch_phase2(
    session_id: str,
    payload: PrefetchPhase2Request,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> dict:
    del session_id
    openai_api_key = require_openai_api_key(openai_api_key)
    before = _normalize_session(payload.session)
    session = _normalize_session(payload.session)
    if not session.focus_node_id:
        raise HTTPException(status_code=400, detail="Phase 2 focus node is not set.")
    goal_label = _get_node(session, session.focus_node_id).label

    for start_node_id in payload.start_node_ids:
        start_node = session.nodes.get(start_node_id)
        if not start_node:
            continue
        await prefetch_phase2_tree(
            session,
            start_node,
            goal_label,
            max_layers_from_start=PHASE2_INCREMENTAL_PREFETCH_LAYERS,
            openai_api_key=openai_api_key,
        )

    nodes, edges = _new_graph_items(before, session)
    return {
        "nodes": [node.model_dump(by_alias=True) for node in nodes],
        "edges": [edge.model_dump(by_alias=True) for edge in edges],
    }


@router.post("/session/{session_id}/node/{node_id}/suggest-prerequisite")
async def suggest_node_prerequisite(
    session_id: str,
    node_id: str,
    payload: SuggestPrerequisiteRequest,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> dict:
    del session_id
    session = _normalize_session(payload.session)
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
    return {
        "node": child.model_dump(by_alias=True),
        "edge": edge.model_dump(by_alias=True),
    }


@router.post("/session/{session_id}/node/{node_id}/explain")
async def explain_node(
    session_id: str,
    node_id: str,
    payload: SessionSnapshotRequest,
    openai_api_key: str | None = Depends(request_openai_api_key),
) -> dict:
    del session_id
    session = _normalize_session(payload.session)
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
    return {"explain_more_text": text}
