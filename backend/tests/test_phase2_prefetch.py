from __future__ import annotations

import asyncio
import unittest
from collections.abc import AsyncIterator
from unittest.mock import patch

from app.models import GraphNode, Resource, Session
from app.phase2_prefetch import (
    PHASE2_ABSOLUTE_MAX_DEPTH,
    PHASE2_INCREMENTAL_PREFETCH_LAYERS,
    prefetch_phase2_tree,
)


def collect(coro) -> None:
    asyncio.run(coro)


async def fake_expand_phase2_node(
    node_label: str,
    known_topics: list[str],
    goal_label: str,
    context_path: list[str] | None = None,
) -> AsyncIterator[dict]:
    resource = Resource(
        url=f"https://example.com/{node_label.lower().replace(' ', '-')}",
        title=f"{node_label} Resource",
        description=f"A resource for {node_label}.",
    )
    child = GraphNode(
        label=f"{node_label} prerequisite",
        description=f"Generated for {goal_label}.",
        phase="2",
    )
    yield {"event": "node_updated", "data": {"resource": resource.model_dump()}}
    yield {"event": "node_added", "data": child.model_dump(by_alias=True)}
    yield {"event": "stream_done", "data": {}}


class Phase2PrefetchTests(unittest.TestCase):
    def test_initial_prefetch_generates_two_layers_from_start_node(self) -> None:
        focus = GraphNode(label="Goal", phase="2", node_state="expanded", depth=0)
        session = Session(
            root_topic="machine learning",
            phase="2",
            focus_node_id=focus.id,
            nodes={focus.id: focus},
        )

        with patch("app.phase2_prefetch.expand_phase2_node", side_effect=fake_expand_phase2_node):
            collect(prefetch_phase2_tree(session, focus, focus.label))

        phase2_nodes = [node for node in session.nodes.values() if node.phase == "2"]
        self.assertEqual(sorted(node.depth for node in phase2_nodes), [0, 1, 2])
        self.assertEqual(max(node.depth for node in phase2_nodes), 2)

    def test_incremental_prefetch_generates_one_layer_for_selected_branch(self) -> None:
        focus = GraphNode(label="Goal", phase="2", node_state="expanded", depth=0)
        branch = GraphNode(
            label="Selected Branch",
            phase="2",
            node_state="expanded",
            parent_id=focus.id,
            depth=2,
        )
        focus.child_ids.append(branch.id)
        session = Session(
            root_topic="machine learning",
            phase="2",
            focus_node_id=focus.id,
            nodes={focus.id: focus, branch.id: branch},
        )

        with patch("app.phase2_prefetch.expand_phase2_node", side_effect=fake_expand_phase2_node):
            collect(
                prefetch_phase2_tree(
                    session,
                    branch,
                    focus.label,
                    max_layers_from_start=PHASE2_INCREMENTAL_PREFETCH_LAYERS,
                )
            )

        self.assertEqual(len(branch.child_ids), 1)
        child = session.nodes[branch.child_ids[0]]
        self.assertEqual(child.depth, 3)
        self.assertEqual(child.child_ids, [])

    def test_prefetch_passes_root_to_node_context_path(self) -> None:
        calls: list[tuple[str, list[str] | None]] = []
        focus = GraphNode(label="Goal", phase="2", node_state="expanded", depth=0)
        branch = GraphNode(
            label="Selected Branch",
            phase="2",
            node_state="grayed",
            parent_id=focus.id,
            depth=1,
        )
        focus.child_ids.append(branch.id)
        session = Session(
            root_topic="machine learning",
            phase="2",
            focus_node_id=focus.id,
            nodes={focus.id: focus, branch.id: branch},
        )

        async def recording_expand_phase2_node(
            node_label: str,
            known_topics: list[str],
            goal_label: str,
            context_path: list[str] | None = None,
        ) -> AsyncIterator[dict]:
            calls.append((node_label, context_path))
            for event in ():
                yield event

        with patch("app.phase2_prefetch.expand_phase2_node", side_effect=recording_expand_phase2_node):
            collect(prefetch_phase2_tree(session, branch, focus.label, max_layers_from_start=0))

        self.assertEqual(calls, [("Selected Branch", ["Goal", "Selected Branch"])])

    def test_prefetch_stops_at_absolute_depth_limit(self) -> None:
        focus = GraphNode(label="Goal", phase="2", node_state="expanded", depth=0)
        branch = GraphNode(
            label="Depth Five Branch",
            phase="2",
            node_state="expanded",
            parent_id=focus.id,
            depth=PHASE2_ABSOLUTE_MAX_DEPTH - 1,
        )
        focus.child_ids.append(branch.id)
        session = Session(
            root_topic="machine learning",
            phase="2",
            focus_node_id=focus.id,
            nodes={focus.id: focus, branch.id: branch},
        )

        with patch("app.phase2_prefetch.expand_phase2_node", side_effect=fake_expand_phase2_node):
            collect(prefetch_phase2_tree(session, branch, focus.label, max_layers_from_start=3))

        self.assertEqual(len(branch.child_ids), 1)
        leaf = session.nodes[branch.child_ids[0]]
        self.assertEqual(leaf.depth, PHASE2_ABSOLUTE_MAX_DEPTH)
        self.assertIsNotNone(leaf.resource)
        self.assertEqual(leaf.resource.title, "Depth Five Branch prerequisite Resource")
        self.assertEqual(leaf.child_ids, [])
        self.assertLessEqual(max(node.depth for node in session.nodes.values()), PHASE2_ABSOLUTE_MAX_DEPTH)


if __name__ == "__main__":
    unittest.main()
