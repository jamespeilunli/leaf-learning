from __future__ import annotations

from app.ai import topics_are_same_or_similar
from app.graph_utils import normalized_label, sort_key
from app.models import GraphNode, Session


async def find_duplicate_node(
    session: Session,
    candidate_label: str,
    *,
    phase: str,
    goal_label: str | None = None,
    parent_label: str | None = None,
) -> GraphNode | None:
    candidate_key = normalized_label(candidate_label)
    phase_nodes = sorted(
        (node for node in session.nodes.values() if node.phase == phase),
        key=sort_key,
    )

    for node in phase_nodes:
        if normalized_label(node.label) == candidate_key:
            return node

    for node in phase_nodes:
        if await topics_are_same_or_similar(
            candidate_label,
            node.label,
            phase=phase,
            goal_label=goal_label,
            parent_label=parent_label,
        ):
            return node

    return None
