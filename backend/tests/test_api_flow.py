from __future__ import annotations

import unittest
from collections.abc import AsyncIterator
from unittest.mock import patch

from app.ai import using_mock_ai
from app.models import ChatMessage, GraphEdge, GraphNode, Resource
from app.phase2_prefetch import PHASE2_ABSOLUTE_MAX_DEPTH

from tests.helpers import isolated_sessions_dir, parse_sse, test_client


def deep_dive_locally(session: dict, node_id: str) -> dict:
    node = session["nodes"][node_id]
    session = {
        **session,
        "phase": "2",
        "focus_node_id": node_id,
        "nodes": {
            **session["nodes"],
            node_id: {
                **node,
                "phase": "2",
                "node_state": "expanded",
                "is_visible": True,
                "child_ids": [
                    child_id
                    for child_id in node["child_ids"]
                    if session["nodes"][child_id]["phase"] == "2"
                ],
            },
        },
    }
    return session


class ApiFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dir_context = isolated_sessions_dir()
        self.sessions_dir = self.dir_context.__enter__()
        self.client = test_client()

    def tearDown(self) -> None:
        self.dir_context.__exit__(None, None, None)

    def create_machine_learning_session(self) -> tuple[str, dict]:
        response = self.client.post("/api/session", json={"topic": " machine learning "})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        return payload["session_id"], payload["session"]

    def test_test_client_forces_mock_ai_mode(self) -> None:
        session_id, session = self.create_machine_learning_session()

        root_id = session["current_phase1_node_id"]
        self.assertEqual(session["root_topic"], "machine learning")
        self.assertGreaterEqual(len(session["nodes"][root_id]["child_ids"]), 4)
        self.assertIsInstance(session_id, str)
        self.assertTrue(using_mock_ai())

    def test_session_creation_does_not_write_backend_session_files(self) -> None:
        session_id, _ = self.create_machine_learning_session()

        self.assertEqual(list(self.sessions_dir.glob("*.json")), [])
        self.assertEqual(self.client.get(f"/api/session/{session_id}").status_code, 404)
        self.assertEqual(self.client.get("/api/sessions").status_code, 404)
        self.assertEqual(self.client.delete("/api/sessions").status_code, 404)

    def test_phase1_children_are_generated_from_supplied_session_snapshot(self) -> None:
        _, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        session["nodes"][child_id]["child_ids"] = []

        response = self.client.post(
            "/api/phase1/children",
            json={"session": session, "node_id": child_id},
        )

        self.assertEqual(response.status_code, 200)
        children = response.json()["children"]
        self.assertGreater(len(children), 0)
        self.assertEqual(children[0]["parent_id"], child_id)
        self.assertEqual(children[0]["depth"], session["nodes"][child_id]["depth"] + 1)
        self.assertEqual(list(self.sessions_dir.glob("*.json")), [])

    def test_phase2_expand_streams_nodes_without_persisting_session(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        session = deep_dive_locally(session, child_id)

        with self.assertLogs("app.routers.graph", level="INFO") as logs:
            response = self.client.post(
                f"/api/session/{session_id}/node/{child_id}/expand",
                json={"session": session},
            )
        events = parse_sse(response.text)
        event_names = [name for name, _ in events]

        self.assertEqual(response.status_code, 200)
        self.assertIn("node_updated", event_names)
        self.assertGreaterEqual(event_names.count("node_added"), 2)
        self.assertIn("edge_added", event_names)
        self.assertTrue(any("mode=on-demand" in message for message in logs.output))
        self.assertEqual(list(self.sessions_dir.glob("*.json")), [])

    def test_phase2_expand_accepts_stale_optimistic_expanded_snapshot(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        session = deep_dive_locally(session, child_id)
        stale_node = GraphNode(
            label="Optimistic stale node",
            description="Frontend marked this expanded before generation finished.",
            phase="2",
            node_state="expanded",
            parent_id=child_id,
            depth=session["nodes"][child_id]["depth"] + 1,
            is_visible=True,
        ).model_dump(by_alias=True)
        session["nodes"][stale_node["id"]] = stale_node
        session["nodes"][child_id]["child_ids"].append(stale_node["id"])
        session["edges"].append(GraphEdge(from_id=child_id, to_id=stale_node["id"], label="requires").model_dump(by_alias=True))

        response = self.client.post(
            f"/api/session/{session_id}/node/{stale_node['id']}/expand",
            json={"session": session},
        )

        events = parse_sse(response.text)
        self.assertEqual(response.status_code, 200)
        self.assertIn("stream_done", [name for name, _ in events])

    def test_prefetch_returns_hidden_nodes_for_client_owned_merge(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        session = deep_dive_locally(session, child_id)

        expand_response = self.client.post(
            f"/api/session/{session_id}/node/{child_id}/expand",
            json={"session": session},
        )
        events = parse_sse(expand_response.text)
        for name, data in events:
            if name == "node_added":
                session["nodes"][data["id"]] = data
                session["nodes"][child_id]["child_ids"].append(data["id"])
            if name == "edge_added":
                session["edges"].append(data)
        start_ids = [data["id"] for name, data in events if name == "node_added"]

        response = self.client.post(
            f"/api/session/{session_id}/phase2/prefetch",
            json={"session": session, "start_node_ids": start_ids[:1]},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertGreater(len(payload["nodes"]), 0)
        self.assertTrue(all(not node["is_visible"] for node in payload["nodes"]))
        self.assertEqual(list(self.sessions_dir.glob("*.json")), [])

    def test_depth_six_expand_generates_resource_without_children(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        session = deep_dive_locally(session, child_id)
        focus = session["nodes"][child_id]
        leaf = GraphNode(
            label="Depth Six Leaf",
            description="A max-depth prerequisite.",
            phase="2",
            node_state="grayed",
            parent_id=child_id,
            depth=PHASE2_ABSOLUTE_MAX_DEPTH,
            is_visible=True,
        ).model_dump(by_alias=True)
        session["nodes"][leaf["id"]] = leaf
        focus["child_ids"].append(leaf["id"])
        session["edges"].append(GraphEdge(from_id=child_id, to_id=leaf["id"], label="requires").model_dump(by_alias=True))

        resource = Resource(
            url="https://example.com/depth-six",
            title="Depth Six Resource",
            description="A resource for the max-depth leaf.",
        )

        async def fake_expand_phase2_node(*args, **kwargs) -> AsyncIterator[dict]:
            blocked_child = GraphNode(label="Depth Seven Child", description="Should not be added.", phase="2")
            yield {"event": "node_updated", "data": {"resource": resource.model_dump()}}
            yield {"event": "node_added", "data": blocked_child.model_dump(by_alias=True)}
            yield {"event": "stream_done", "data": {}}

        with patch("app.routers.graph.expand_phase2_node", side_effect=fake_expand_phase2_node):
            response = self.client.post(
                f"/api/session/{session_id}/node/{leaf['id']}/expand",
                json={"session": session},
            )

        events = parse_sse(response.text)
        self.assertEqual(response.status_code, 200)
        self.assertIn("node_updated", [name for name, _ in events])
        self.assertNotIn("node_added", [name for name, _ in events])

    def test_explain_suggest_and_chat_are_stateless(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        session = deep_dive_locally(session, child_id)

        expand_response = self.client.post(
            f"/api/session/{session_id}/node/{child_id}/expand",
            json={"session": session},
        )
        events = parse_sse(expand_response.text)
        for name, data in events:
            if name == "node_added":
                session["nodes"][data["id"]] = data
                session["nodes"][child_id]["child_ids"].append(data["id"])
            if name == "edge_added":
                session["edges"].append(data)
        first_prereq_id = next(data["id"] for name, data in events if name == "node_added")

        explained = self.client.post(
            f"/api/session/{session_id}/node/{first_prereq_id}/explain",
            json={"session": session},
        )
        self.assertEqual(explained.status_code, 200)
        self.assertIn(session["nodes"][first_prereq_id]["label"], explained.json()["explain_more_text"])

        suggested = self.client.post(
            f"/api/session/{session_id}/node/{child_id}/suggest-prerequisite",
            json={"session": session, "message": "I am missing one more concept."},
        )
        self.assertEqual(suggested.status_code, 200)
        self.assertEqual(suggested.json()["edge"]["from"], child_id)

        chat_response = self.client.post(
            f"/api/session/{session_id}/node/{child_id}/chat",
            json={
                "session": session,
                "message": "How should I start?",
                "history": [ChatMessage(role="user", content="Earlier question").model_dump()],
            },
        )
        chat_events = parse_sse(chat_response.text)
        self.assertEqual(chat_events[-1][0], "stream_done")
        self.assertTrue(any(name == "token" for name, _ in chat_events))
        self.assertEqual(list(self.sessions_dir.glob("*.json")), [])


if __name__ == "__main__":
    unittest.main()
