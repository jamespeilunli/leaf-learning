from __future__ import annotations

import unittest
from unittest.mock import patch

from app.ai import using_mock_ai
from app.models import GraphNode
from app.storage import load_session, save_session

from tests.helpers import isolated_sessions_dir, parse_sse, test_client


class ApiFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dir_context = isolated_sessions_dir()
        self.dir_context.__enter__()
        self.client = test_client()

    def tearDown(self) -> None:
        self.dir_context.__exit__(None, None, None)

    def create_machine_learning_session(self) -> tuple[str, dict]:
        response = self.client.post("/api/session", json={"topic": " machine learning "})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        return payload["session_id"], payload["session"]

    def test_test_client_forces_mock_ai_mode(self) -> None:
        with patch.dict("os.environ", {"ALPHAG3N_AI_MODE": "openai"}):
            self.client = test_client()
            session_id, session = self.create_machine_learning_session()

        root_id = session["current_phase1_node_id"]
        self.assertEqual(session["root_topic"], "machine learning")
        self.assertGreaterEqual(len(session["nodes"][root_id]["child_ids"]), 4)
        self.assertIsInstance(session_id, str)
        self.assertTrue(using_mock_ai())

    def test_test_client_stays_mock_when_real_ai_tests_are_enabled(self) -> None:
        with patch.dict(
            "os.environ",
            {"ALPHAG3N_AI_MODE": "openai", "ALPHAG3N_TEST_ALLOW_REAL_AI": "1"},
        ):
            self.client = test_client()
            session_id, session = self.create_machine_learning_session()

        root_id = session["current_phase1_node_id"]
        self.assertEqual(session["root_topic"], "machine learning")
        self.assertGreaterEqual(len(session["nodes"][root_id]["child_ids"]), 4)
        self.assertIsInstance(session_id, str)
        self.assertTrue(using_mock_ai())

    def test_session_creation_listing_selection_back_resolution_and_deep_dive(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]

        listed = self.client.get("/api/sessions").json()
        self.assertEqual(listed[0]["id"], session_id)
        self.assertEqual(session["root_topic"], "machine learning")
        self.assertGreaterEqual(len(session["nodes"][root_id]["child_ids"]), 4)

        selected = self.client.post(f"/api/session/{session_id}/select-topic", json={"node_id": child_id}).json()
        self.assertEqual(selected["current_phase1_node_id"], child_id)
        self.assertEqual(selected["selection_history"], [root_id])
        self.assertGreater(len(selected["nodes"][child_id]["child_ids"]), 0)

        backed = self.client.post(f"/api/session/{session_id}/back").json()
        self.assertEqual(backed["current_phase1_node_id"], root_id)
        self.assertEqual(backed["selection_history"], [])
        self.assertEqual(self.client.post(f"/api/session/{session_id}/back").status_code, 400)

        resolved = self.client.post(f"/api/session/{session_id}/resolution").json()
        self.assertEqual(resolved["resolution"], "technical")

        dived = self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id}).json()["session"]
        self.assertEqual(dived["phase"], "2")
        self.assertEqual(dived["focus_node_id"], child_id)
        self.assertEqual(dived["nodes"][child_id]["phase"], "2")

    def test_phase2_precomputes_roadmap_then_explain_learned_dedupe_and_prune(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        dived = self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id}).json()["session"]

        child = dived["nodes"][child_id]
        self.assertEqual(child["node_state"], "expanded")
        self.assertGreaterEqual(len(child["sources"]), 1)
        grayed_ids = [
            node_id
            for node_id, node in dived["nodes"].items()
            if node["node_state"] == "grayed" and node.get("parent_id")
        ]
        first_prereq_id = grayed_ids[0]

        explained = self.client.post(f"/api/session/{session_id}/node/{first_prereq_id}/explain").json()
        self.assertIn(dived["nodes"][first_prereq_id]["label"], explained["explain_more_text"])

        duplicate = GraphNode(
            label=f"  {dived['nodes'][first_prereq_id]['label'].upper()}  ",
            description="Duplicate prerequisite",
            phase="2",
            node_state="grayed",
            parent_id=child_id,
            depth=2,
        )
        stored = load_session(session_id)
        stored.nodes[duplicate.id] = duplicate
        stored.nodes[child_id].child_ids.append(duplicate.id)
        save_session(stored)

        learned = self.client.patch(
            f"/api/session/{session_id}/node/{first_prereq_id}/status",
            json={"node_state": "learned"},
        ).json()
        self.assertIn(dived["nodes"][first_prereq_id]["label"].lower(), learned["known_topics"])
        self.assertEqual(learned["nodes"][duplicate.id]["explain_more_text"], "__known__")

        pruned = self.client.delete(f"/api/session/{session_id}/node/{first_prereq_id}").json()
        self.assertEqual(pruned["removed_node_ids"], [first_prereq_id])
        after_prune = self.client.get(f"/api/session/{session_id}").json()
        self.assertNotIn(first_prereq_id, after_prune["nodes"])
        self.assertNotIn(first_prereq_id, after_prune["nodes"][child_id]["child_ids"])

        repeated_prune = self.client.delete(f"/api/session/{session_id}/node/{first_prereq_id}")
        self.assertEqual(repeated_prune.status_code, 200)
        self.assertEqual(repeated_prune.json()["removed_node_ids"], [first_prereq_id])

    def test_phase2_guards_reject_invalid_expand_and_explain(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]

        self.assertEqual(self.client.post(f"/api/session/{session_id}/node/{child_id}/expand").status_code, 400)
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})
        self.assertEqual(self.client.post(f"/api/session/{session_id}/node/{child_id}/expand").status_code, 400)
        self.client.post(f"/api/session/{session_id}/resolution")
        self.assertEqual(self.client.post(f"/api/session/{session_id}/node/{child_id}/explain").status_code, 400)

    def test_chat_streams_tokens_and_persists_bounded_history(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/resolution")
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})

        response = self.client.post(
            f"/api/session/{session_id}/node/{child_id}/chat",
            json={"message": "How should I start?"},
        )
        events = parse_sse(response.text)
        self.assertEqual(events[-1][0], "stream_done")
        self.assertTrue(any(name == "token" for name, _ in events))

        stored = self.client.get(f"/api/session/{session_id}").json()
        history = stored["nodes"][child_id]["chat_history"]
        self.assertEqual(history[-2]["role"], "user")
        self.assertEqual(history[-2]["content"], "How should I start?")
        self.assertEqual(history[-1]["role"], "assistant")

    def test_phase2_expand_merges_repeated_nodes_and_blocks_ancestor_cycles(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        dived = self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id}).json()["session"]

        parent_id = next(
            node_id
            for node_id in dived["nodes"][child_id]["child_ids"]
            if dived["nodes"][node_id]["label"] == "Vector Spaces"
        )
        stored = load_session(session_id)
        stored.nodes[parent_id].node_state = "grayed"
        stored.nodes[parent_id].child_ids = []
        stored.edges = [edge for edge in stored.edges if edge.from_id != parent_id and edge.to_id != parent_id]
        save_session(stored)

        repeated = GraphNode(
            id="repeated-loss",
            label="Loss Functions",
            description="Repeated prerequisite",
            phase="2",
            node_state="grayed",
        )
        cycle = GraphNode(
            id="cycle-node",
            label=dived["nodes"][child_id]["label"],
            description="Would create an ancestor cycle",
            phase="2",
            node_state="grayed",
        )

        with patch("app.routers.graph.expand_phase2_node") as mocked_expand:
            async def fake_expand_phase2_node(node_label: str, known_topics: list[str], goal_label: str):
                yield {"event": "node_added", "data": repeated.model_dump()}
                yield {"event": "edge_added", "data": {"from": node_label, "to": repeated.id, "label": "requires"}}
                yield {"event": "node_added", "data": cycle.model_dump()}
                yield {"event": "edge_added", "data": {"from": node_label, "to": cycle.id, "label": "requires"}}
                yield {"event": "stream_done", "data": {}}

            mocked_expand.side_effect = fake_expand_phase2_node
            response = self.client.post(f"/api/session/{session_id}/node/{parent_id}/expand")

        events = parse_sse(response.text)
        added_nodes = [data for name, data in events if name == "node_added"]
        self.assertEqual([node["label"] for node in added_nodes], ["Loss Functions"])

        stored = self.client.get(f"/api/session/{session_id}").json()
        self.assertEqual(
            [stored["nodes"][node_id]["label"] for node_id in stored["nodes"][parent_id]["child_ids"]],
            ["Loss Functions"],
        )
        self.assertEqual(len(stored["edges"]), len({edge["id"] for edge in stored["edges"]}))


if __name__ == "__main__":
    unittest.main()
