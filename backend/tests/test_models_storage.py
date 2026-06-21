from __future__ import annotations

import unittest
from unittest.mock import patch

from app.models import ChatMessage, GraphEdge, GraphNode, Session
from app.phase2_prefetch import PHASE2_MAX_DEPTH_ENV, phase2_max_depth_from_focus


class ModelTests(unittest.TestCase):
    def test_model_defaults_and_aliases_match_design_shape(self) -> None:
        node = GraphNode(label="Vector Spaces", phase="2")
        edge = GraphEdge(from_id="parent", to_id="child", label="requires")
        message = ChatMessage(role="user", content="Why?")
        session = Session(root_topic="machine learning", nodes={node.id: node}, edges=[edge])

        self.assertEqual(node.node_state, "grayed")
        self.assertEqual(node.child_ids, [])
        self.assertEqual(node.chat_history, [])
        self.assertTrue(node.is_visible)
        self.assertIsNotNone(message.created_at)
        self.assertEqual(session.phase, "1")
        self.assertIn("from", edge.model_dump(by_alias=True))
        self.assertEqual(edge.model_dump(by_alias=True)["to"], "child")

    def test_phase2_max_depth_defaults_to_two_and_can_be_overridden(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(phase2_max_depth_from_focus(), 2)

        with patch.dict("os.environ", {PHASE2_MAX_DEPTH_ENV: "5"}):
            self.assertEqual(phase2_max_depth_from_focus(), 5)


if __name__ == "__main__":
    unittest.main()
