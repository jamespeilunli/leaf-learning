from __future__ import annotations

from app.models import GraphEdge, GraphNode, Session


def _normalized(label: str) -> str:
    return " ".join(label.lower().strip().split())


def _is_ancestor(session: Session, ancestor_id: str, descendant_id: str) -> bool:
    current = session.nodes.get(descendant_id)
    while current and current.parent_id:
        if current.parent_id == ancestor_id:
            return True
        current = session.nodes.get(current.parent_id)
    return False


def _merge_node_details(existing: GraphNode, incoming: GraphNode, depth: int) -> None:
    existing.depth = min(existing.depth, depth)
    existing.phase = "2"
    if not existing.description and incoming.description:
        existing.description = incoming.description
    if not existing.why_interesting and incoming.why_interesting:
        existing.why_interesting = incoming.why_interesting
    if not existing.resource and incoming.resource:
        existing.resource = incoming.resource
    if incoming.sources:
        existing_sources = {source.url for source in existing.sources}
        for source in incoming.sources:
            if source.url not in existing_sources:
                existing.sources.append(source)
                existing_sources.add(source.url)


def add_phase2_child(
    session: Session,
    parent: GraphNode,
    child: GraphNode,
) -> tuple[GraphNode | None, GraphEdge | None, bool]:
    normalized = _normalized(child.label)
    if normalized == _normalized(parent.label):
        return None, None, False

    for existing in session.nodes.values():
        if existing.id == parent.id:
            continue
        if existing.phase != "2":
            continue
        if _normalized(existing.label) != normalized:
            continue
        if _is_ancestor(session, existing.id, parent.id):
            return None, None, False

        _merge_node_details(existing, child, parent.depth + 1)
        if existing.id not in parent.child_ids:
            parent.child_ids.append(existing.id)

        edge = next(
            (
                current
                for current in session.edges
                if current.from_id == parent.id and current.to_id == existing.id
            ),
            None,
        )
        if edge is None:
            edge = GraphEdge(from_id=parent.id, to_id=existing.id, label="requires")
            session.edges.append(edge)
        return existing, edge, False

    child.parent_id = parent.id
    child.depth = parent.depth + 1
    child.phase = "2"
    session.nodes[child.id] = child
    if child.id not in parent.child_ids:
        parent.child_ids.append(child.id)
    edge = GraphEdge(from_id=parent.id, to_id=child.id, label="requires")
    session.edges.append(edge)
    return child, edge, True
