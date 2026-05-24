from __future__ import annotations

import unittest
from unittest.mock import patch

from app.models import GraphNode, Session
from app.roadmap_builder import precompute_phase2_roadmap


class RoadmapBuilderTests(unittest.IsolatedAsyncioTestCase):
    async def test_precompute_merges_duplicate_prerequisites_and_marks_leaves_grayed(self) -> None:
        focus = GraphNode(id="focus", label="Representation Learning", phase="2", node_state="expanded")
        session = Session(
            root_topic="machine learning",
            phase="2",
            focus_node_id=focus.id,
            nodes={focus.id: focus},
        )

        async def fake_expand_phase2_node(
            node_label: str,
            resolution: str,
            known_topics: list[str],
            goal_label: str,
        ):
            yield {
                "event": "node_updated",
                "data": {
                    "sources": [
                        {
                            "url": f"https://example.com/{node_label.lower().replace(' ', '-')}",
                            "title": f"Source for {node_label}",
                            "description": f"Verified source for {node_label}.",
                        }
                    ]
                },
            }
            if node_label == "Representation Learning":
                yield {"event": "node_added", "data": GraphNode(id="la", label="Linear Algebra", phase="2").model_dump()}
                yield {"event": "node_added", "data": GraphNode(id="vs-1", label="Vector Spaces", phase="2").model_dump()}
            elif node_label == "Linear Algebra":
                yield {"event": "node_added", "data": GraphNode(id="vs-2", label="  vector   spaces  ", phase="2").model_dump()}
            yield {"event": "stream_done", "data": {}}

        with patch("app.roadmap_builder.expand_phase2_node", fake_expand_phase2_node):
            await precompute_phase2_roadmap(session, focus.id)

        vector_nodes = [
            node
            for node in session.nodes.values()
            if " ".join(node.label.lower().split()) == "vector spaces"
        ]
        self.assertEqual(len(vector_nodes), 1)
        self.assertIn("la", session.nodes[focus.id].child_ids)
        self.assertIn(vector_nodes[0].id, session.nodes[focus.id].child_ids)
        self.assertEqual(vector_nodes[0].node_state, "grayed")
        self.assertGreaterEqual(len(vector_nodes[0].sources), 1)


if __name__ == "__main__":
    unittest.main()
