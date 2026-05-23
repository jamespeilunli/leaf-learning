from __future__ import annotations

import re
from collections import deque

from app.models import GraphEdge, GraphNode, Session


def normalize_topic_label(label: str) -> str:
    normalized = label.casefold()
    normalized = re.sub(r"\([^)]*\)", " ", normalized)
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    normalized = re.sub(r"\b(an|and|for|in|of|on|the|to|with)\b", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _edge_key(edge: GraphEdge) -> tuple[str, str, str | None]:
    return (edge.from_id, edge.to_id, edge.label)


def _dedupe_edges(edges: list[GraphEdge]) -> list[GraphEdge]:
    seen: set[tuple[str, str, str | None]] = set()
    deduped: list[GraphEdge] = []
    for edge in edges:
        if edge.from_id == edge.to_id:
            continue
        key = _edge_key(edge)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(edge)
    return deduped


def _build_incoming_edges(session: Session) -> dict[str, list[str]]:
    incoming: dict[str, list[str]] = {}
    for edge in session.edges:
        incoming.setdefault(edge.to_id, []).append(edge.from_id)
    return incoming


def _build_outgoing_edges(session: Session) -> dict[str, list[str]]:
    outgoing: dict[str, list[str]] = {}
    for edge in session.edges:
        outgoing.setdefault(edge.from_id, []).append(edge.to_id)
    return outgoing


def _node_order(session: Session) -> dict[str, int]:
    return {node_id: index for index, node_id in enumerate(session.nodes.keys())}


def _merge_node_data(canonical: GraphNode, duplicate: GraphNode) -> None:
    if canonical.description is None or (
        duplicate.description and len(duplicate.description) > len(canonical.description or "")
    ):
        canonical.description = duplicate.description
    if canonical.why_interesting is None and duplicate.why_interesting is not None:
        canonical.why_interesting = duplicate.why_interesting
    if canonical.resource is None and duplicate.resource is not None:
        canonical.resource = duplicate.resource
    if canonical.explain_more_text in {None, "__known__"} and duplicate.explain_more_text is not None:
        canonical.explain_more_text = duplicate.explain_more_text
    if not canonical.chat_history and duplicate.chat_history:
        canonical.chat_history = duplicate.chat_history
    if duplicate.node_state == "learned":
        canonical.node_state = "learned"
    elif duplicate.node_state == "expanded" and canonical.node_state == "grayed":
        canonical.node_state = "expanded"


def recompute_phase2_depths(session: Session) -> None:
    if not session.focus_node_id or session.focus_node_id not in session.nodes:
        return

    outgoing = _build_outgoing_edges(session)
    distances: dict[str, int] = {session.focus_node_id: 0}
    queue: deque[str] = deque([session.focus_node_id])

    while queue:
        current_id = queue.popleft()
        next_depth = distances[current_id] + 1
        for child_id in outgoing.get(current_id, []):
            child = session.nodes.get(child_id)
            if not child or child.phase != "2":
                continue
            if child_id not in distances or next_depth < distances[child_id]:
                distances[child_id] = next_depth
                queue.append(child_id)

    for node_id, node in session.nodes.items():
        if node.phase != "2":
            continue
        if node_id in distances:
            node.depth = distances[node_id]


def normalize_phase2_graph(session: Session) -> None:
    phase2_nodes = [node for node in session.nodes.values() if node.phase == "2"]
    if not phase2_nodes:
        return

    node_order = _node_order(session)
    grouped: dict[str, list[str]] = {}
    for node in phase2_nodes:
        key = normalize_topic_label(node.label)
        if key:
            grouped.setdefault(key, []).append(node.id)

    for node_ids in grouped.values():
        if len(node_ids) < 2:
            continue

        def priority(node_id: str) -> tuple[int, int, int]:
            node = session.nodes[node_id]
            return (
                0 if node.id == session.focus_node_id else 1,
                node.depth,
                node_order.get(node_id, 10**9),
            )

        canonical_id = min(node_ids, key=priority)
        canonical = session.nodes[canonical_id]

        for duplicate_id in node_ids:
            if duplicate_id == canonical_id or duplicate_id not in session.nodes:
                continue
            duplicate = session.nodes[duplicate_id]
            _merge_node_data(canonical, duplicate)

            for edge in session.edges:
                if edge.from_id == duplicate_id:
                    edge.from_id = canonical_id
                if edge.to_id == duplicate_id:
                    edge.to_id = canonical_id

            for node in session.nodes.values():
                node.child_ids = [
                    canonical_id if child_id == duplicate_id else child_id for child_id in node.child_ids
                ]

            if canonical.parent_id is None and duplicate.parent_id is not None:
                canonical.parent_id = duplicate.parent_id
            if session.focus_node_id == duplicate_id:
                session.focus_node_id = canonical_id
            session.nodes.pop(duplicate_id, None)

    session.edges = _dedupe_edges(session.edges)
    node_order = _node_order(session)
    filtered_edges: list[GraphEdge] = []
    chosen_parent_by_child: dict[str, str] = {}

    for edge in session.edges:
        parent = session.nodes.get(edge.from_id)
        child = session.nodes.get(edge.to_id)
        if parent is None or child is None:
            continue
        if parent.phase != "2" or child.phase != "2":
            continue
        if edge.to_id == session.focus_node_id:
            continue

        previous_parent_id = chosen_parent_by_child.get(edge.to_id)
        if previous_parent_id is None:
            chosen_parent_by_child[edge.to_id] = edge.from_id
            filtered_edges.append(edge)
            continue

        previous_parent = session.nodes[previous_parent_id]
        current_rank = (parent.depth, node_order.get(parent.id, 10**9), parent.label)
        previous_rank = (
            previous_parent.depth,
            node_order.get(previous_parent.id, 10**9),
            previous_parent.label,
        )
        if current_rank < previous_rank:
            chosen_parent_by_child[edge.to_id] = edge.from_id
            filtered_edges = [
                existing
                for existing in filtered_edges
                if not (existing.to_id == edge.to_id and existing.from_id == previous_parent_id)
            ]
            filtered_edges.append(edge)

    session.edges = filtered_edges
    outgoing = _build_outgoing_edges(session)
    incoming = _build_incoming_edges(session)

    if session.focus_node_id and session.focus_node_id in session.nodes:
        reachable = {session.focus_node_id}
        queue: deque[str] = deque([session.focus_node_id])
        while queue:
            current_id = queue.popleft()
            for child_id in outgoing.get(current_id, []):
                if child_id in reachable:
                    continue
                reachable.add(child_id)
                queue.append(child_id)

        session.edges = [
            edge
            for edge in session.edges
            if edge.from_id in reachable and edge.to_id in reachable
        ]
        outgoing = _build_outgoing_edges(session)
        incoming = _build_incoming_edges(session)

    for node in session.nodes.values():
        if node.phase != "2":
            continue
        node.child_ids = list(dict.fromkeys(outgoing.get(node.id, [])))
        if node.id == session.focus_node_id:
            node.parent_id = None
        else:
            parents = [parent_id for parent_id in incoming.get(node.id, []) if parent_id in session.nodes]
            node.parent_id = parents[0] if parents else None

    recompute_phase2_depths(session)


def find_phase2_node_by_label(session: Session, label: str) -> GraphNode | None:
    target_key = normalize_topic_label(label)
    if not target_key:
        return None

    node_order = _node_order(session)
    best_match: GraphNode | None = None
    for node in session.nodes.values():
        if node.phase != "2":
            continue
        if normalize_topic_label(node.label) != target_key:
            continue
        if best_match is None:
            best_match = node
            continue

        current_rank = (
            0 if node.id == session.focus_node_id else 1,
            node.depth,
            node_order.get(node.id, 10**9),
        )
        best_rank = (
            0 if best_match.id == session.focus_node_id else 1,
            best_match.depth,
            node_order.get(best_match.id, 10**9),
        )
        if current_rank < best_rank:
            best_match = node
    return best_match


def would_create_cycle(session: Session, from_id: str, to_id: str) -> bool:
    if from_id == to_id:
        return True

    outgoing = _build_outgoing_edges(session)
    queue: deque[str] = deque([to_id])
    seen: set[str] = set()

    while queue:
        current_id = queue.popleft()
        if current_id == from_id:
            return True
        if current_id in seen:
            continue
        seen.add(current_id)
        queue.extend(outgoing.get(current_id, []))

    return False


def upsert_phase2_edge(session: Session, from_id: str, to_id: str, label: str | None = None) -> GraphEdge | None:
    if would_create_cycle(session, from_id, to_id):
        return None

    for edge in session.edges:
        if edge.from_id == from_id and edge.to_id == to_id and edge.label == label:
            return edge

    edge = GraphEdge(from_id=from_id, to_id=to_id, label=label)
    session.edges.append(edge)
    return edge


def collect_exclusive_descendants(session: Session, node_id: str) -> set[str]:
    outgoing = _build_outgoing_edges(session)
    incoming = _build_incoming_edges(session)
    removed = {node_id}
    queue: deque[str] = deque([node_id])

    while queue:
        current_id = queue.popleft()
        for child_id in outgoing.get(current_id, []):
            if child_id in removed:
                continue
            remaining_parents = [parent_id for parent_id in incoming.get(child_id, []) if parent_id not in removed]
            if remaining_parents:
                continue
            removed.add(child_id)
            queue.append(child_id)

    return removed
