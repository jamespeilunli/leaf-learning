from __future__ import annotations

import unittest
from collections.abc import AsyncIterator
from unittest.mock import patch

from app.ai import using_mock_ai
from app.models import GraphEdge, GraphNode, Resource
from app.phase2_prefetch import PHASE2_ABSOLUTE_MAX_DEPTH
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
        with patch.dict("os.environ", {"ALPHAG3N_AI_MODE": "openai", "ALPHAG3N_USE_OPENAI": "true"}):
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
            {
                "ALPHAG3N_AI_MODE": "openai",
                "ALPHAG3N_USE_OPENAI": "true",
                "ALPHAG3N_TEST_ALLOW_REAL_AI": "1",
            },
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

        resolved = self.client.post(f"/api/session/{session_id}/resolution", json={"resolution": "technical"}).json()
        self.assertEqual(resolved["resolution"], "technical")

        dived = self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id}).json()["session"]
        self.assertEqual(dived["phase"], "2")
        self.assertEqual(dived["focus_node_id"], child_id)
        self.assertEqual(dived["nodes"][child_id]["phase"], "2")
        self.assertTrue(dived["nodes"][child_id]["is_visible"])

    def test_clear_sessions_deletes_all_saved_topics_and_flowcharts(self) -> None:
        first_id, _ = self.create_machine_learning_session()
        second_id, _ = self.create_machine_learning_session()

        listed_before = self.client.get("/api/sessions")
        cleared = self.client.delete("/api/sessions")
        listed_after = self.client.get("/api/sessions")

        self.assertEqual(listed_before.status_code, 200)
        self.assertEqual(len(listed_before.json()), 2)
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(cleared.json()["deleted_count"], 2)
        self.assertEqual(listed_after.json(), [])
        self.assertEqual(self.client.get(f"/api/session/{first_id}").status_code, 404)
        self.assertEqual(self.client.get(f"/api/session/{second_id}").status_code, 404)

    def test_deep_dive_returns_immediately_and_expand_reveals_next_layer(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]

        dived = self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id}).json()["session"]
        focus = dived["nodes"][child_id]

        self.assertEqual(focus["child_ids"], [])
        self.assertTrue(focus["is_visible"])

        with self.assertLogs("app.routers.graph", level="INFO") as logs:
            expand_response = self.client.post(f"/api/session/{session_id}/node/{child_id}/expand")
        events = parse_sse(expand_response.text)
        revealed_ids = [data["id"] for name, data in events if name == "node_added"]
        event_names = [name for name, _ in events]

        self.assertIn("node_updated", event_names)
        self.assertGreaterEqual(len(revealed_ids), 2)
        self.assertTrue(any("mode=on-demand" in message for message in logs.output))

        expanded = self.client.get(f"/api/session/{session_id}").json()
        self.assertEqual(set(expanded["nodes"][child_id]["child_ids"]), set(revealed_ids))
        self.assertTrue(all(expanded["nodes"][node_id]["is_visible"] for node_id in revealed_ids))
        self.assertLessEqual(
            max(node["depth"] - focus["depth"] for node in expanded["nodes"].values() if node["phase"] == "2"),
            2,
        )

    def test_expanding_prefetched_node_reveals_without_ai_generation(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})

        stored = load_session(session_id)
        hidden = GraphNode(
            label="Prefetched Hidden Layer",
            description="Already generated before the user clicked.",
            phase="2",
            node_state="grayed",
            parent_id=child_id,
            depth=stored.nodes[child_id].depth + 1,
            is_visible=False,
        )
        stored.nodes[hidden.id] = hidden
        stored.nodes[child_id].child_ids.append(hidden.id)
        stored.edges.append(GraphEdge(from_id=child_id, to_id=hidden.id, label="requires"))
        save_session(stored)

        async def noop_prefetch(*args, **kwargs) -> None:
            return None

        with (
            patch("app.routers.graph._prefetch_descendants", side_effect=noop_prefetch),
            patch("app.phase2_prefetch.expand_phase2_node", side_effect=AssertionError("AI generation was called")),
        ):
            expand_response = self.client.post(f"/api/session/{session_id}/node/{child_id}/expand")

        events = parse_sse(expand_response.text)
        self.assertEqual(expand_response.status_code, 200)
        self.assertIn(("node_added", self.client.get(f"/api/session/{session_id}").json()["nodes"][hidden.id]), events)
        expanded = self.client.get(f"/api/session/{session_id}").json()
        self.assertTrue(expanded["nodes"][hidden.id]["is_visible"])

    def test_expanding_same_label_node_reuses_prefetched_children(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})

        stored = load_session(session_id)
        visible = stored.nodes[child_id]
        duplicate_parent = GraphNode(
            label=visible.label,
            description="Duplicate hidden topic generated earlier.",
            phase="2",
            node_state="grayed",
            depth=visible.depth,
            is_visible=False,
        )
        hidden_child = GraphNode(
            label="Reused Hidden Prerequisite",
            description="Generated under the duplicate parent.",
            phase="2",
            node_state="grayed",
            parent_id=duplicate_parent.id,
            depth=visible.depth + 1,
            is_visible=False,
        )
        duplicate_parent.child_ids.append(hidden_child.id)
        stored.nodes[duplicate_parent.id] = duplicate_parent
        stored.nodes[hidden_child.id] = hidden_child
        stored.edges.append(GraphEdge(from_id=duplicate_parent.id, to_id=hidden_child.id, label="requires"))
        save_session(stored)

        async def noop_prefetch(*args, **kwargs) -> None:
            return None

        with (
            patch("app.routers.graph._prefetch_descendants", side_effect=noop_prefetch),
            patch("app.phase2_prefetch.expand_phase2_node", side_effect=AssertionError("AI generation was called")),
        ):
            expand_response = self.client.post(f"/api/session/{session_id}/node/{child_id}/expand")

        self.assertEqual(expand_response.status_code, 200)
        expanded = self.client.get(f"/api/session/{session_id}").json()
        self.assertIn(hidden_child.id, expanded["nodes"][child_id]["child_ids"])
        self.assertEqual(expanded["nodes"][hidden_child.id]["parent_id"], child_id)
        self.assertTrue(expanded["nodes"][hidden_child.id]["is_visible"])
        self.assertEqual(expanded["nodes"][duplicate_parent.id]["child_ids"], [])

    def test_expand_reloads_merged_prefetched_children_before_on_demand_generation(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})

        stored = load_session(session_id)
        parent = stored.nodes[child_id]
        hidden = GraphNode(
            label="Merged Prefetched Child",
            description="Generated by a concurrent prefetch save.",
            phase="2",
            node_state="grayed",
            parent_id=parent.id,
            depth=parent.depth + 1,
            is_visible=False,
        )
        concurrent = stored.model_copy(deep=True)
        concurrent.nodes[hidden.id] = hidden
        concurrent.nodes[parent.id].child_ids.append(hidden.id)
        concurrent.edges.append(GraphEdge(from_id=parent.id, to_id=hidden.id, label="requires"))

        async def noop_prefetch(*args, **kwargs) -> None:
            return None

        with (
            patch("app.routers.graph.load_session", return_value=stored),
            patch("app.routers.graph.merge_save_session", side_effect=[concurrent, concurrent, concurrent]),
            patch("app.routers.graph._prefetch_descendants", side_effect=noop_prefetch),
            patch("app.routers.graph.expand_phase2_node", side_effect=AssertionError("AI generation was called")),
        ):
            expand_response = self.client.post(f"/api/session/{session_id}/node/{child_id}/expand")

        events = parse_sse(expand_response.text)
        self.assertEqual(expand_response.status_code, 200)
        self.assertIn(("node_added", hidden.model_copy(update={"is_visible": True}).model_dump(by_alias=True)), events)

    def test_preemptive_generation_logs_mode(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})
        stored = load_session(session_id)

        with self.assertLogs("app.phase2_prefetch", level="INFO") as logs:
            self.client.post(f"/api/session/{session_id}/node/{child_id}/expand")

        self.assertTrue(any("mode=preemptive" in message for message in logs.output))
        self.assertTrue(any(f"session_id={stored.id}" in message for message in logs.output))

    def test_deeper_phase2_nodes_expand_beyond_initial_prefetch_depth(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})

        stored = load_session(session_id)
        focus = stored.nodes[child_id]
        parent = focus
        for index in range(3):
            node = GraphNode(
                label=f"Deep branch {index}",
                description="Existing preemptive branch.",
                phase="2",
                node_state="expanded" if index < 2 else "grayed",
                parent_id=parent.id,
                depth=parent.depth + 1,
                is_visible=True,
            )
            stored.nodes[node.id] = node
            parent.child_ids.append(node.id)
            stored.edges.append(GraphEdge(from_id=parent.id, to_id=node.id, label="requires"))
            parent = node
        deep_node_id = parent.id
        save_session(stored)

        async def fake_expand_phase2_node(*args, **kwargs) -> AsyncIterator[dict]:
            child = GraphNode(
                label="Beyond Initial Depth",
                description="Generated after clicking a deeper branch.",
                phase="2",
            )
            yield {"event": "node_added", "data": child.model_dump(by_alias=True)}
            yield {
                "event": "edge_added",
                "data": GraphEdge(from_id=deep_node_id, to_id=child.id, label="requires").model_dump(by_alias=True),
            }
            yield {"event": "stream_done", "data": {}}

        async def noop_prefetch(*args, **kwargs) -> None:
            return None

        with (
            patch("app.routers.graph.expand_phase2_node", side_effect=fake_expand_phase2_node),
            patch("app.routers.graph._prefetch_descendants", side_effect=noop_prefetch),
        ):
            expand_response = self.client.post(f"/api/session/{session_id}/node/{deep_node_id}/expand")

        events = parse_sse(expand_response.text)
        self.assertEqual(expand_response.status_code, 200)
        self.assertIn("node_added", [name for name, _ in events])
        expanded = self.client.get(f"/api/session/{session_id}").json()
        self.assertGreater(max(node["depth"] for node in expanded["nodes"].values() if node["phase"] == "2"), 2)

    def test_phase2_expand_passes_root_to_node_context_path(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})

        stored = load_session(session_id)
        focus = stored.nodes[child_id]
        parent = GraphNode(
            label="Intermediate Topic",
            description="Branch context.",
            phase="2",
            node_state="expanded",
            parent_id=focus.id,
            depth=focus.depth + 1,
            is_visible=True,
        )
        leaf = GraphNode(
            label="Active Leaf",
            description="Node the user clicked.",
            phase="2",
            node_state="grayed",
            parent_id=parent.id,
            depth=parent.depth + 1,
            is_visible=True,
        )
        stored.nodes[parent.id] = parent
        stored.nodes[leaf.id] = leaf
        focus.child_ids.append(parent.id)
        parent.child_ids.append(leaf.id)
        stored.edges.append(GraphEdge(from_id=focus.id, to_id=parent.id, label="requires"))
        stored.edges.append(GraphEdge(from_id=parent.id, to_id=leaf.id, label="requires"))
        save_session(stored)

        calls: list[dict] = []

        async def recording_expand_phase2_node(*args, **kwargs) -> AsyncIterator[dict]:
            calls.append({"args": args, "kwargs": kwargs})
            yield {"event": "stream_done", "data": {}}

        with patch("app.routers.graph.expand_phase2_node", side_effect=recording_expand_phase2_node):
            expand_response = self.client.post(f"/api/session/{session_id}/node/{leaf.id}/expand")

        self.assertEqual(expand_response.status_code, 200)
        self.assertEqual(
            calls[0]["kwargs"]["context_path"],
            [focus.label, "Intermediate Topic", "Active Leaf"],
        )

    def test_depth_six_expand_generates_resource_without_children(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})

        stored = load_session(session_id)
        focus = stored.nodes[child_id]
        leaf = GraphNode(
            label="Depth Six Leaf",
            description="A max-depth prerequisite.",
            phase="2",
            node_state="grayed",
            parent_id=focus.id,
            depth=PHASE2_ABSOLUTE_MAX_DEPTH,
            is_visible=True,
        )
        stored.nodes[leaf.id] = leaf
        focus.child_ids.append(leaf.id)
        stored.edges.append(GraphEdge(from_id=focus.id, to_id=leaf.id, label="requires"))
        save_session(stored)

        resource = Resource(
            url="https://example.com/depth-six",
            title="Depth Six Resource",
            description="A resource for the max-depth leaf.",
        )

        async def fake_expand_phase2_node(*args, **kwargs) -> AsyncIterator[dict]:
            blocked_child = GraphNode(label="Depth Seven Child", description="Should not be added.", phase="2")
            yield {"event": "node_updated", "data": {"resource": resource.model_dump()}}
            yield {"event": "node_added", "data": blocked_child.model_dump(by_alias=True)}
            yield {
                "event": "edge_added",
                "data": GraphEdge(from_id=leaf.id, to_id=blocked_child.id, label="requires").model_dump(by_alias=True),
            }
            yield {"event": "stream_done", "data": {}}

        async def noop_prefetch(*args, **kwargs) -> None:
            return None

        with (
            patch("app.routers.graph.expand_phase2_node", side_effect=fake_expand_phase2_node),
            patch("app.routers.graph._prefetch_descendants", side_effect=noop_prefetch),
        ):
            expand_response = self.client.post(f"/api/session/{session_id}/node/{leaf.id}/expand")

        events = parse_sse(expand_response.text)
        self.assertEqual(expand_response.status_code, 200)
        self.assertIn("node_updated", [name for name, _ in events])
        self.assertNotIn("node_added", [name for name, _ in events])
        expanded = self.client.get(f"/api/session/{session_id}").json()
        self.assertEqual(expanded["nodes"][leaf.id]["resource"]["url"], resource.url)
        self.assertEqual(expanded["nodes"][leaf.id]["child_ids"], [])
        self.assertLessEqual(max(node["depth"] for node in expanded["nodes"].values()), PHASE2_ABSOLUTE_MAX_DEPTH)

    def test_suggest_prerequisite_rejects_depth_six_parent(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})

        stored = load_session(session_id)
        leaf = GraphNode(
            label="Depth Six Leaf",
            phase="2",
            node_state="expanded",
            depth=PHASE2_ABSOLUTE_MAX_DEPTH,
        )
        stored.nodes[leaf.id] = leaf
        save_session(stored)

        response = self.client.post(
            f"/api/session/{session_id}/node/{leaf.id}/suggest-prerequisite",
            json={"message": "I am missing one more concept."},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Maximum Phase 2 depth reached.")

    def test_phase2_expand_explain_learned_dedupe_and_prune(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/resolution", json={"resolution": "intuitive"})
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})

        expand_response = self.client.post(f"/api/session/{session_id}/node/{child_id}/expand")
        events = parse_sse(expand_response.text)
        event_names = [name for name, _ in events]
        self.assertIn("node_updated", event_names)
        self.assertGreaterEqual(event_names.count("node_added"), 2)
        self.assertIn("edge_added", event_names)

        expanded = self.client.get(f"/api/session/{session_id}").json()
        child = expanded["nodes"][child_id]
        grayed_ids = [node_id for node_id in child["child_ids"] if expanded["nodes"][node_id]["node_state"] == "grayed"]
        first_prereq_id = grayed_ids[0]

        explained = self.client.post(f"/api/session/{session_id}/node/{first_prereq_id}/explain").json()
        self.assertIn(expanded["nodes"][first_prereq_id]["label"], explained["explain_more_text"])

        duplicate = GraphNode(
            label=f"  {expanded['nodes'][first_prereq_id]['label'].upper()}  ",
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
        self.assertIn(expanded["nodes"][first_prereq_id]["label"].lower(), learned["known_topics"])
        self.assertEqual(learned["nodes"][duplicate.id]["explain_more_text"], "__known__")

        pruned = self.client.delete(f"/api/session/{session_id}/node/{first_prereq_id}").json()
        self.assertIn(first_prereq_id, pruned["removed_node_ids"])
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
        self.assertEqual(self.client.post(f"/api/session/{session_id}/node/{child_id}/expand").status_code, 200)
        self.client.post(f"/api/session/{session_id}/resolution", json={"resolution": "technical"})
        self.assertEqual(self.client.post(f"/api/session/{session_id}/node/{child_id}/explain").status_code, 400)

    def test_chat_streams_tokens_and_persists_bounded_history(self) -> None:
        session_id, session = self.create_machine_learning_session()
        root_id = session["current_phase1_node_id"]
        child_id = session["nodes"][root_id]["child_ids"][0]
        self.client.post(f"/api/session/{session_id}/resolution", json={"resolution": "technical"})
        self.client.post(f"/api/session/{session_id}/deep-dive", json={"node_id": child_id})
        self.client.post(f"/api/session/{session_id}/node/{child_id}/expand")

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


if __name__ == "__main__":
    unittest.main()
