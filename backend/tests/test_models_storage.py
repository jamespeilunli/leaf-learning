from __future__ import annotations

import unittest

from fastapi import HTTPException

from app.models import ChatMessage, GraphEdge, GraphNode, Session
from app.storage import list_sessions, load_session, save_session

from tests.helpers import isolated_sessions_dir


class ModelAndStorageTests(unittest.TestCase):
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

    def test_save_load_and_list_sessions_round_trip_json_files(self) -> None:
        with isolated_sessions_dir() as directory:
            old = Session(root_topic="old")
            new = Session(root_topic="new")
            save_session(old)
            save_session(new)
            (directory / "broken.json").write_text("{not json")

            loaded = load_session(old.id)
            rows = list_sessions()

        self.assertEqual(loaded.root_topic, "old")
        self.assertEqual([row["id"] for row in rows], [new.id, old.id])
        self.assertEqual(rows[0]["phase"], "1")

    def test_load_missing_session_returns_404(self) -> None:
        with isolated_sessions_dir():
            with self.assertRaises(HTTPException) as raised:
                load_session("missing")

        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
