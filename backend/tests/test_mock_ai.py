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
        intuitive = asyncio.run(
            collect(expand_phase2_node("Representation Learning", "intuitive", ["loss functions"], "Representation Learning"))
        )
        technical = asyncio.run(
            collect(expand_phase2_node("Representation Learning", "technical", [], "Representation Learning"))
        )

        intuitive_update = next(event for event in intuitive if event["event"] == "node_updated")
        technical_update = next(event for event in technical if event["event"] == "node_updated")
        intuitive_labels = [event["data"]["label"] for event in intuitive if event["event"] == "node_added"]

        self.assertLessEqual(intuitive_update["data"]["intuition_score"], 0.45)
        self.assertGreaterEqual(technical_update["data"]["intuition_score"], 0.68)
        self.assertNotIn("Loss Functions", intuitive_labels)

    def test_chat_stream_is_deterministic_and_mentions_context(self) -> None:
        chunks = asyncio.run(
            collect(
                chat_with_node(
                    "Vector Spaces",
                    "description",
                    "resource",
                    "technical",
                    ["Representation Learning", "Vector Spaces"],
                    [],
                    "What is a basis?",
                )
            )
        )

        text = "".join(chunks)
        self.assertIn("Vector Spaces", text)
        self.assertIn("technical", text)
        self.assertIn("What is a basis?", text)


if __name__ == "__main__":
    unittest.main()
