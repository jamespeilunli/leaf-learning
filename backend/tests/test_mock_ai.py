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

    def test_phase2_generation_respects_known_topics(self) -> None:
        events = asyncio.run(
            collect(expand_phase2_node("Representation Learning", ["loss functions"], "Representation Learning"))
        )
        update = next(event for event in events if event["event"] == "node_updated")
        labels = [event["data"]["label"] for event in events if event["event"] == "node_added"]

        self.assertEqual(len(update["data"]["sources"]), 1)
        self.assertIn("Vector Spaces", labels)
        self.assertNotIn("Loss Functions", labels)

    def test_localization_deep_dive_uses_actionable_solver_routes(self) -> None:
        events = asyncio.run(collect(expand_phase2_node("Localization", [], "Localization")))
        update = next(event for event in events if event["event"] == "node_updated")
        labels = [event["data"]["label"] for event in events if event["event"] == "node_added"]
        hints = [event["data"]["description"] for event in events if event["event"] == "node_added"]

        self.assertEqual(len(update["data"]["sources"]), 1)
        self.assertIn("non-paywalled", update["data"]["sources"][0]["description"])
        self.assertIn("Analytical Localization Solve", labels)
        self.assertIn("Iterative Localization Solve", labels)
        self.assertTrue(any("because" in hint and "localization" in hint.lower() for hint in hints))
        self.assertNotIn("Image Recognition", labels)
        self.assertNotIn("Image Analysis", labels)

    def test_iterative_localization_expansion_surfaces_specific_mechanics(self) -> None:
        events = asyncio.run(
            collect(expand_phase2_node("Iterative Localization Solve", [], "Localization"))
        )
        update = next(event for event in events if event["event"] == "node_updated")
        labels = [event["data"]["label"] for event in events if event["event"] == "node_added"]

        self.assertEqual(len(update["data"]["sources"]), 1)
        self.assertIn("Taking e to the Power of a Matrix", labels)
        self.assertIn("Jacobian Linearization", labels)

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
