from __future__ import annotations

from collections import deque

from fastapi import HTTPException

from app.ai import expand_phase2_node
from app.graph_utils import add_phase2_child
from app.models import GraphNode, Resource, Session


MAX_PHASE2_LEVELS = 6


async def precompute_phase2_roadmap(session: Session, focus_node_id: str) -> None:
    focus = session.nodes.get(focus_node_id)
    if not focus:
        raise HTTPException(status_code=404, detail=f"Node {focus_node_id} not found")

    focus.phase = "2"
    focus.node_state = "expanded"
    queue = deque([(focus.id, 0)])
    queued_ids = {focus.id}
    expanded_ids: set[str] = set()

    while queue:
        node_id, level = queue.popleft()
        node = session.nodes.get(node_id)
        if not node or node_id in expanded_ids:
            continue

        expanded_ids.add(node_id)
        node.phase = "2"
        node.node_state = "expanded"

        async for event in expand_phase2_node(
            node.label,
            session.known_topics,
            focus.label,
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
                continue

            if event_name == "node_added":
                child = GraphNode.model_validate(data)
                linked_child, _, created = add_phase2_child(session, node, child)
                if not linked_child:
                    continue
                if level + 1 < MAX_PHASE2_LEVELS and linked_child.id not in queued_ids:
                    queue.append((linked_child.id, level + 1))
                    queued_ids.add(linked_child.id)
                continue

            if event_name == "stream_error":
                raise HTTPException(status_code=502, detail=data.get("message", "Roadmap generation failed."))

    for current in session.nodes.values():
        if current.phase != "2":
            continue
        if not current.sources and current.resource is not None:
            current.sources = [current.resource]
        if current.id != focus.id and not current.child_ids:
            current.node_state = "grayed"
