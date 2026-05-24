from __future__ import annotations

import logging
import os
from collections import deque
from collections.abc import Callable

from app.ai import expand_phase2_node
from app.models import GraphEdge, GraphNode, Resource, Session


PHASE2_INITIAL_PREFETCH_LAYERS = 2
PHASE2_INCREMENTAL_PREFETCH_LAYERS = 1
PHASE2_MAX_DEPTH_FROM_FOCUS = PHASE2_INITIAL_PREFETCH_LAYERS
PHASE2_ABSOLUTE_MAX_DEPTH = 6
PHASE2_MAX_DEPTH_ENV = "ALPHAG3N_PHASE2_MAX_DEPTH"
logger = logging.getLogger(__name__)


def normalized_label(label: str) -> str:
    return " ".join(label.lower().strip().split())


def phase2_max_depth_from_focus() -> int:
    value = os.getenv(PHASE2_MAX_DEPTH_ENV, "").strip()
    if not value:
        return PHASE2_MAX_DEPTH_FROM_FOCUS

    try:
        return max(0, int(value))
    except ValueError:
        return PHASE2_MAX_DEPTH_FROM_FOCUS


def phase2_max_depth(session: Session) -> int:
    if not session.focus_node_id or session.focus_node_id not in session.nodes:
        return phase2_max_depth_from_focus()
    return session.nodes[session.focus_node_id].depth + phase2_max_depth_from_focus()


def can_add_phase2_children(node: GraphNode) -> bool:
    return node.depth < PHASE2_ABSOLUTE_MAX_DEPTH


def _ancestor_labels(session: Session, node: GraphNode) -> set[str]:
    labels: set[str] = set()
    current: GraphNode | None = node
    while current:
        labels.add(normalized_label(current.label))
        current = session.nodes.get(current.parent_id) if current.parent_id else None
    return labels


def _existing_child_labels(session: Session, node: GraphNode) -> set[str]:
    labels: set[str] = set()
    for child_id in node.child_ids:
        child = session.nodes.get(child_id)
        if child:
            labels.add(normalized_label(child.label))
    return labels


def _set_subtree_depths(session: Session, node_id: str, depth: int) -> None:
    node = session.nodes.get(node_id)
    if not node:
        return

    node.depth = depth
    for child_id in node.child_ids:
        _set_subtree_depths(session, child_id, depth + 1)


def adopt_prefetched_children_by_label(session: Session, node: GraphNode) -> bool:
    if node.child_ids:
        return False

    node_label = normalized_label(node.label)
    candidates = [
        candidate
        for candidate in session.nodes.values()
        if candidate.id != node.id
        and candidate.phase == "2"
        and normalized_label(candidate.label) == node_label
        and candidate.child_ids
    ]
    if not candidates:
        return False

    candidate = sorted(candidates, key=lambda item: (item.is_visible, item.depth))[0]
    adopted_child_ids = list(candidate.child_ids)
    existing_labels = _existing_child_labels(session, node)

    for child_id in adopted_child_ids:
        child = session.nodes.get(child_id)
        if not child:
            continue
        child_label = normalized_label(child.label)
        if child_label in existing_labels:
            continue

        child.parent_id = node.id
        _set_subtree_depths(session, child.id, node.depth + 1)
        node.child_ids.append(child.id)
        if child.id in candidate.child_ids:
            candidate.child_ids.remove(child.id)
        if not any(edge.from_id == node.id and edge.to_id == child.id for edge in session.edges):
            session.edges.append(GraphEdge(from_id=node.id, to_id=child.id, label="requires"))
        existing_labels.add(child_label)

    session.edges = [
        edge
        for edge in session.edges
        if not (edge.from_id == candidate.id and edge.to_id in set(adopted_child_ids))
    ]

    adopted = bool(node.child_ids)
    if adopted:
        logger.info(
            "Reused preemptive phase2 children session_id=%s source_parent_id=%s target_parent_id=%s parent_label=%r child_count=%s",
            session.id,
            candidate.id,
            node.id,
            node.label,
            len(node.child_ids),
        )
    return adopted


async def prefetch_phase2_tree(
    session: Session,
    start_node: GraphNode,
    goal_label: str,
    on_progress: Callable[[Session], None] | None = None,
    max_layers_from_start: int | None = None,
) -> None:
    """Generate hidden Phase 2 descendants breadth-first within a start-relative layer budget."""
    layer_budget = phase2_max_depth_from_focus() if max_layers_from_start is None else max_layers_from_start
    max_depth = min(PHASE2_ABSOLUTE_MAX_DEPTH, start_node.depth + max(0, layer_budget))
    queue: deque[str] = deque([start_node.id])
    visited: set[str] = set()

    while queue:
        node_id = queue.popleft()
        if node_id in visited:
            continue
        visited.add(node_id)

        node = session.nodes.get(node_id)
        if not node or node.phase != "2" or node.depth > max_depth:
            continue

        if not node.child_ids:
            await generate_direct_phase2_children(session, node, goal_label, max_child_depth=max_depth)
            if on_progress:
                on_progress(session)

        for child_id in node.child_ids:
            child = session.nodes.get(child_id)
            if child and child.depth <= max_depth:
                queue.append(child_id)


async def generate_direct_phase2_children(
    session: Session,
    node: GraphNode,
    goal_label: str,
    max_child_depth: int = PHASE2_ABSOLUTE_MAX_DEPTH,
) -> None:
    blocked_labels = _ancestor_labels(session, node) | _existing_child_labels(session, node)
    known_topics = sorted(set(session.known_topics) | blocked_labels)

    async for event in expand_phase2_node(node.label, known_topics, goal_label):
        event_name = event["event"]
        data = event["data"]

        if event_name == "stream_error":
            message = (
                data.get("message", "Phase 2 generation failed.")
                if isinstance(data, dict)
                else str(data)
            )
            raise RuntimeError(message)

        if event_name == "node_updated":
            if data.get("sources"):
                node.sources = [Resource.model_validate(item) for item in data["sources"]]
            if data.get("resource"):
                node.resource = Resource.model_validate(data["resource"])
                if not node.sources:
                    node.sources = [node.resource]
            continue

        if event_name != "node_added":
            continue

        child = GraphNode.model_validate(data)
        child_label = normalized_label(child.label)
        if child_label in blocked_labels:
            continue

        child.parent_id = node.id
        child.depth = node.depth + 1
        if child.depth > max_child_depth:
            continue
        child.phase = "2"
        child.node_state = "grayed"
        child.is_visible = False
        logger.info(
            "Generated phase2 node mode=preemptive session_id=%s parent_id=%s parent_label=%r node_id=%s node_label=%r depth=%s",
            session.id,
            node.id,
            node.label,
            child.id,
            child.label,
            child.depth,
        )

        session.nodes[child.id] = child
        node.child_ids.append(child.id)
        session.edges.append(GraphEdge(from_id=node.id, to_id=child.id, label="requires"))
        blocked_labels.add(child_label)


async def prefetch_child_layers(
    session: Session,
    node: GraphNode,
    goal_label: str,
    on_progress: Callable[[Session], None] | None = None,
) -> None:
    max_depth = min(PHASE2_ABSOLUTE_MAX_DEPTH, node.depth + PHASE2_INCREMENTAL_PREFETCH_LAYERS)

    for child_id in node.child_ids:
        child = session.nodes.get(child_id)
        if not child or child.phase != "2" or child.depth > max_depth or child.child_ids:
            continue
        await generate_direct_phase2_children(session, child, goal_label, max_child_depth=max_depth)
        if on_progress:
            on_progress(session)


def reveal_direct_phase2_children(session: Session, node: GraphNode) -> tuple[list[GraphNode], list[GraphEdge]]:
    node.phase = "2"
    node.node_state = "expanded"
    node.is_visible = True

    revealed_nodes: list[GraphNode] = []
    revealed_edges: list[GraphEdge] = []
    child_ids = set(node.child_ids)

    for child_id in node.child_ids:
        child = session.nodes.get(child_id)
        if not child:
            continue
        child.is_visible = True
        revealed_nodes.append(child)

    for edge in session.edges:
        if edge.from_id == node.id and edge.to_id in child_ids:
            revealed_edges.append(edge)

    return revealed_nodes, revealed_edges
