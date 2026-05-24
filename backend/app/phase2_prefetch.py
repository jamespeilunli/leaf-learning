from __future__ import annotations

from collections import deque

from app.ai import expand_phase2_node
from app.models import GraphEdge, GraphNode, Resource, Session


PHASE2_MAX_DEPTH_FROM_FOCUS = 6


def normalized_label(label: str) -> str:
    return " ".join(label.lower().strip().split())


def phase2_max_depth(session: Session) -> int:
    if not session.focus_node_id or session.focus_node_id not in session.nodes:
        return PHASE2_MAX_DEPTH_FROM_FOCUS
    return session.nodes[session.focus_node_id].depth + PHASE2_MAX_DEPTH_FROM_FOCUS


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


async def prefetch_phase2_tree(
    session: Session,
    start_node: GraphNode,
    goal_label: str,
) -> None:
    """Generate hidden Phase 2 descendants breadth-first up to the focus-relative cap."""
    max_depth = phase2_max_depth(session)
    queue: deque[str] = deque([start_node.id])
    visited: set[str] = set()

    while queue:
        node_id = queue.popleft()
        if node_id in visited:
            continue
        visited.add(node_id)

        node = session.nodes.get(node_id)
        if not node or node.phase != "2" or node.depth >= max_depth:
            continue

        if not node.child_ids:
            await _generate_direct_children(session, node, goal_label)

        for child_id in node.child_ids:
            child = session.nodes.get(child_id)
            if child and child.depth < max_depth:
                queue.append(child_id)


async def _generate_direct_children(session: Session, node: GraphNode, goal_label: str) -> None:
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
        child.phase = "2"
        child.node_state = "grayed"
        child.is_visible = False

        session.nodes[child.id] = child
        node.child_ids.append(child.id)
        session.edges.append(GraphEdge(from_id=node.id, to_id=child.id, label="requires"))
        blocked_labels.add(child_label)


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
