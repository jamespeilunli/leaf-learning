from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.models import ChatMessage, GraphEdge, GraphNode, Session
from app.phase2_prefetch import PHASE2_MAX_DEPTH_ENV, phase2_max_depth_from_focus
from app.storage import list_sessions, load_session, merge_save_session, save_session

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

    def test_phase2_max_depth_defaults_to_two_and_can_be_overridden(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(phase2_max_depth_from_focus(), 2)

        with patch.dict("os.environ", {PHASE2_MAX_DEPTH_ENV: "5"}):
            self.assertEqual(phase2_max_depth_from_focus(), 5)

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

    def test_merge_save_preserves_nodes_from_concurrent_session_writers(self) -> None:
        with isolated_sessions_dir():
            parent = GraphNode(label="Parent", phase="2", node_state="expanded", is_visible=True)
            session = Session(root_topic="topic", nodes={parent.id: parent}, focus_node_id=parent.id, phase="2")
            save_session(session)

            foreground = load_session(session.id)
            visible = GraphNode(
                label="Visible child",
                phase="2",
                node_state="grayed",
                parent_id=parent.id,
                depth=1,
                is_visible=True,
            )
            foreground.nodes[visible.id] = visible
            foreground.nodes[parent.id].child_ids.append(visible.id)
            foreground.edges.append(GraphEdge(from_id=parent.id, to_id=visible.id, label="requires"))
            merge_save_session(foreground)

            background = load_session(session.id)
            background.nodes[parent.id].child_ids = [child_id for child_id in background.nodes[parent.id].child_ids if child_id != visible.id]
            hidden = GraphNode(
                label="Hidden child",
                phase="2",
                node_state="grayed",
                parent_id=parent.id,
                depth=1,
                is_visible=False,
            )
            background.nodes[hidden.id] = hidden
            background.nodes[parent.id].child_ids.append(hidden.id)
            background.edges.append(GraphEdge(from_id=parent.id, to_id=hidden.id, label="requires"))
            merge_save_session(background)

            merged = load_session(session.id)

        self.assertIn(visible.id, merged.nodes)
        self.assertIn(hidden.id, merged.nodes)
        self.assertIn(visible.id, merged.nodes[parent.id].child_ids)
        self.assertIn(hidden.id, merged.nodes[parent.id].child_ids)
        self.assertTrue(merged.nodes[visible.id].is_visible)
        self.assertFalse(merged.nodes[hidden.id].is_visible)

    def test_load_missing_session_returns_404(self) -> None:
        with isolated_sessions_dir():
            with self.assertRaises(HTTPException) as raised:
                load_session("missing")

        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
