from __future__ import annotations

import asyncio
import unittest

from app.mock_ai import chat_with_node, expand_phase2_node, generate_phase1_children


async def collect(async_iterable):
    return [item async for item in async_iterable]


class MockAITests(unittest.TestCase):
    def test_phase1_generation_uses_fixtures_and_filters_ancestors(self) -> None:
        events = asyncio.run(collect(generate_phase1_children("machine learning", ["Generalization"])))
        labels = [event["data"]["label"] for event in events if event["event"] == "node_added"]

        self.assertIn("Representation Learning", labels)
        self.assertNotIn("Generalization", labels)
        self.assertEqual(events[-1]["event"], "stream_done")

    def test_phase2_generation_respects_resolution_and_known_topics(self) -> None:
        filtered = asyncio.run(
            collect(expand_phase2_node("Representation Learning", ["loss functions"], "Representation Learning"))
        )
        full = asyncio.run(
            collect(expand_phase2_node("Representation Learning", [], "Representation Learning"))
        )

        filtered_update = next(event for event in filtered if event["event"] == "node_updated")
        full_update = next(event for event in full if event["event"] == "node_updated")
        filtered_labels = [event["data"]["label"] for event in filtered if event["event"] == "node_added"]
        full_labels = [event["data"]["label"] for event in full if event["event"] == "node_added"]

        self.assertGreaterEqual(len(filtered_update["data"]["sources"]), 1)
        self.assertGreaterEqual(len(full_update["data"]["sources"]), 1)
        self.assertNotIn("Loss Functions", filtered_labels)
        self.assertIn("Loss Functions", full_labels)

    def test_chat_stream_is_deterministic_and_mentions_context(self) -> None:
        chunks = asyncio.run(
            collect(
                chat_with_node(
                    "Vector Spaces",
                    "description",
                    "resource",
                    ["Representation Learning", "Vector Spaces"],
                    [],
                    "What is a basis?",
                )
            )
        )

        text = "".join(chunks)
        self.assertIn("Vector Spaces", text)
        self.assertIn("Representation Learning > Vector Spaces", text)
        self.assertIn("What is a basis?", text)


if __name__ == "__main__":
    unittest.main()
