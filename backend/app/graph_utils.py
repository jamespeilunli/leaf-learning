from __future__ import annotations

import re
from collections import defaultdict, deque

from app.models import GraphEdge, GraphNode, Resource, Session


STATE_PRIORITY = {"grayed": 0, "expanded": 1, "learned": 2}


def normalized_label(label: str) -> str:
    cleaned = re.sub(r"[_/]+", " ", label.lower().strip())
    cleaned = re.sub(r"[^a-z0-9+\-\s]", " ", cleaned)
    cleaned = cleaned.replace("-", " ")
    return " ".join(cleaned.split())


def sort_key(node: GraphNode) -> tuple[int, str, str]:
    return (node.depth, normalized_label(node.label), node.id)


def dedupe_resources(resources: list[Resource]) -> list[Resource]:
    seen: set[tuple[str, str, str]] = set()
    deduped: list[Resource] = []
    for resource in resources:
        key = (resource.url, resource.title, resource.description)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(resource)
    return deduped


def dedupe_chat_history(node: GraphNode) -> None:
    seen: set[tuple[str, str, str]] = set()
    deduped = []
    for item in sorted(node.chat_history, key=lambda message: message.created_at):
        key = (item.role, item.content, item.created_at)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    node.chat_history = deduped


def has_ancestor_with_label(session: Session, node_id: str, label: str) -> bool:
    target = normalized_label(label)
    current = session.nodes.get(node_id)
    while current:
        if normalized_label(current.label) == target:
            return True
        current = session.nodes.get(current.parent_id) if current.parent_id else None
    return False


def is_ancestor(session: Session, ancestor_id: str, node_id: str) -> bool:
    current = session.nodes.get(node_id)
    while current and current.parent_id:
        if current.parent_id == ancestor_id:
            return True
        current = session.nodes.get(current.parent_id)
    return False


def find_node_by_label(session: Session, label: str, *, phase: str | None = None) -> GraphNode | None:
    target = normalized_label(label)
    matches = [
        node
        for node in session.nodes.values()
        if normalized_label(node.label) == target and (phase is None or node.phase == phase)
    ]
    if not matches:
        return None
    return min(matches, key=sort_key)


def ensure_parent_child_link(session: Session, parent_id: str, child_id: str) -> None:
    parent = session.nodes.get(parent_id)
    child = session.nodes.get(child_id)
    if not parent or not child or parent_id == child_id:
        return

    if child_id not in parent.child_ids:
        parent.child_ids.append(child_id)
    parent.child_ids = sorted(set(parent.child_ids), key=lambda node_id: sort_key(session.nodes[node_id]))
    child.parent_id = parent_id
    child.parent_ids = [parent_id]


def detach_child(session: Session, parent_id: str | None, child_id: str) -> None:
    if not parent_id:
        return
    parent = session.nodes.get(parent_id)
    if not parent:
        return
    parent.child_ids = [current_child_id for current_child_id in parent.child_ids if current_child_id != child_id]
    child = session.nodes.get(child_id)
    if not child:
        return
    if child.parent_id == parent_id:
        child.parent_id = None
    child.parent_ids = []


def ensure_edge(session: Session, parent_id: str, child_id: str, label: str = "requires") -> GraphEdge | None:
    if parent_id == child_id:
        return None
    for edge in session.edges:
        if edge.from_id == parent_id and edge.to_id == child_id:
            if not edge.label:
                edge.label = label
            return edge
    edge = GraphEdge(from_id=parent_id, to_id=child_id, label=label)
    session.edges.append(edge)
    return edge


def add_phase2_child(session: Session, parent: GraphNode, child: GraphNode) -> tuple[GraphNode | None, GraphEdge | None, bool]:
    if has_ancestor_with_label(session, parent.id, child.label):
        return None, None, False

    existing = find_node_by_label(session, child.label, phase="2")
    if existing:
        if existing.id == parent.id:
            return None, None, False
        if is_ancestor(session, existing.id, parent.id):
            return None, None, False
        if not existing.description and child.description:
            existing.description = child.description
        return None, None, False

    child.parent_id = parent.id
    child.parent_ids = [parent.id]
    child.depth = parent.depth + 1
    child.phase = "2"
    child.node_state = "grayed"
    session.nodes[child.id] = child
    ensure_parent_child_link(session, parent.id, child.id)
    edge = ensure_edge(session, parent.id, child.id)
    return child, edge, True


def repair_session_graph(session: Session) -> Session:
    canonical_by_key: dict[tuple[str, str], str] = {}
    remap: dict[str, str] = {}

    for node in sorted(session.nodes.values(), key=sort_key):
        key = (node.phase, normalized_label(node.label))
        canonical_id = canonical_by_key.get(key)
        if canonical_id is None:
            canonical_by_key[key] = node.id
            remap[node.id] = node.id
            continue
        remap[node.id] = canonical_id

    canonical_nodes: dict[str, GraphNode] = {
        node_id: session.nodes[node_id].model_copy(deep=True)
        for node_id, mapped_id in remap.items()
        if node_id == mapped_id
    }

    for original_id, canonical_id in remap.items():
        if original_id == canonical_id:
            continue
        source = session.nodes[original_id]
        target = canonical_nodes[canonical_id]
        if not target.description and source.description:
            target.description = source.description
        if not target.why_interesting and source.why_interesting:
            target.why_interesting = source.why_interesting
        if STATE_PRIORITY[source.node_state] > STATE_PRIORITY[target.node_state]:
            target.node_state = source.node_state
        if not target.resource and source.resource:
            target.resource = source.resource
        target.sources = dedupe_resources(target.sources + source.sources)
        if not target.explain_more_text and source.explain_more_text:
            target.explain_more_text = source.explain_more_text
        target.chat_history.extend(source.chat_history)

    for node in canonical_nodes.values():
        if node.resource and not node.sources:
            node.sources = [node.resource]
        node.sources = dedupe_resources(node.sources)
        dedupe_chat_history(node)
        node.child_ids = []
        node.parent_id = None
        node.parent_ids = []

    incoming_candidates: dict[str, set[str]] = defaultdict(set)

    def register_link(parent_id: str | None, child_id: str | None) -> None:
        if not parent_id or not child_id:
            return
        mapped_parent = remap.get(parent_id)
        mapped_child = remap.get(child_id)
        if not mapped_parent or not mapped_child or mapped_parent == mapped_child:
            return
        if mapped_parent not in canonical_nodes or mapped_child not in canonical_nodes:
            return
        incoming_candidates[mapped_child].add(mapped_parent)

    for node in session.nodes.values():
        register_link(node.parent_id, node.id)
        for parent_id in node.parent_ids:
            register_link(parent_id, node.id)
        for child_id in node.child_ids:
            register_link(node.id, child_id)

    for edge in session.edges:
        register_link(edge.from_id, edge.to_id)

    assigned_parent: dict[str, str] = {}
    parent_children: dict[str, list[str]] = defaultdict(list)

    def creates_cycle(parent_id: str, child_id: str) -> bool:
        stack = [child_id]
        visited: set[str] = set()
        while stack:
            current_id = stack.pop()
            if current_id == parent_id:
                return True
            if current_id in visited:
                continue
            visited.add(current_id)
            stack.extend(parent_children.get(current_id, []))
        return False

    for child_id, parent_ids in sorted(incoming_candidates.items()):
        child = canonical_nodes[child_id]
        ordered_parents = sorted(
            parent_ids,
            key=lambda parent_id: (
                canonical_nodes[parent_id].depth,
                normalized_label(canonical_nodes[parent_id].label),
                parent_id,
            ),
        )
        for parent_id in ordered_parents:
            if normalized_label(canonical_nodes[parent_id].label) == normalized_label(child.label):
                continue
            if creates_cycle(parent_id, child_id):
                continue
            assigned_parent[child_id] = parent_id
            parent_children[parent_id].append(child_id)
            break

    for child_id, parent_id in assigned_parent.items():
        canonical_nodes[child_id].parent_id = parent_id
        canonical_nodes[child_id].parent_ids = [parent_id]

    for parent_id, child_ids in parent_children.items():
        unique_child_ids = sorted(
            set(child_ids),
            key=lambda node_id: (
                normalized_label(canonical_nodes[node_id].label),
                node_id,
            ),
        )
        canonical_nodes[parent_id].child_ids = unique_child_ids

    roots = [node.id for node in canonical_nodes.values() if node.parent_id is None]
    roots = sorted(roots, key=lambda node_id: (canonical_nodes[node_id].phase, normalized_label(canonical_nodes[node_id].label), node_id))
    queue = deque((root_id, 0) for root_id in roots)
    depth_by_id: dict[str, int] = {}
    while queue:
        node_id, depth = queue.popleft()
        if node_id in depth_by_id and depth_by_id[node_id] <= depth:
            continue
        depth_by_id[node_id] = depth
        node = canonical_nodes[node_id]
        node.depth = depth
        ordered_children = sorted(node.child_ids, key=lambda child_id: (normalized_label(canonical_nodes[child_id].label), child_id))
        node.child_ids = ordered_children
        for child_id in ordered_children:
            queue.append((child_id, depth + 1))

    session.nodes = canonical_nodes
    session.edges = []
    for parent_id, child_ids in parent_children.items():
        for child_id in sorted(set(child_ids), key=lambda node_id: sort_key(canonical_nodes[node_id])):
            ensure_edge(session, parent_id, child_id)

    unique_known_topics = []
    seen_topics: set[str] = set()
    for topic in session.known_topics:
        normalized = normalized_label(topic)
        if normalized in seen_topics:
            continue
        seen_topics.add(normalized)
        unique_known_topics.append(normalized)
    session.known_topics = unique_known_topics

    if session.current_phase1_node_id:
        session.current_phase1_node_id = remap.get(session.current_phase1_node_id, session.current_phase1_node_id)
        if session.current_phase1_node_id not in session.nodes:
            session.current_phase1_node_id = None
    if session.focus_node_id:
        session.focus_node_id = remap.get(session.focus_node_id, session.focus_node_id)
        if session.focus_node_id not in session.nodes:
            session.focus_node_id = None
    session.selection_history = [
        mapped_id
        for node_id in session.selection_history
        if (mapped_id := remap.get(node_id, node_id)) in session.nodes
    ]

    return session
