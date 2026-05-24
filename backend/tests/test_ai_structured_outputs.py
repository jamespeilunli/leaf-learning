from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from app import ai
from app.models import Resource


async def collect(async_iterable):
    return [item async for item in async_iterable]


class FakeResponses:
    def __init__(self, parsed: object, events: list[object] | None = None) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []
        self.events = events or []

    async def parse(self, **kwargs: Any) -> object:
        self.calls.append(kwargs)
        return SimpleNamespace(output_parsed=self.parsed)

    def stream(self, **kwargs: Any) -> object:
        self.calls.append(kwargs)
        return FakeStream(self.parsed, self.events)


class FakeStream:
    def __init__(self, parsed: object, events: list[object]) -> None:
        self.parsed = parsed
        self.events = events

    async def __aenter__(self) -> "FakeStream":
        return self

    async def __aexit__(self, exc_type: object, exc: object, exc_tb: object) -> None:
        return None

    def __aiter__(self) -> "FakeStream":
        self.index = 0
        return self

    async def __anext__(self) -> object:
        if self.index >= len(self.events):
            raise StopAsyncIteration
        event = self.events[self.index]
        self.index += 1
        return event

    async def get_final_response(self) -> object:
        return SimpleNamespace(output_parsed=self.parsed)


def delta(text: str) -> object:
    return SimpleNamespace(type="response.output_text.delta", delta=text)


class StructuredOutputTests(unittest.TestCase):
    def test_phase1_generation_streams_structured_output_items(self) -> None:
        parsed = ai.Phase1ChildrenResponse(
            nodes=[
                ai.Phase1Child(
                    label=f"Topic {index}",
                    description="First sentence. Second sentence.",
                    why_interesting="It matters for learning.",
                )
                for index in range(4)
            ]
        )
        first_node = parsed.nodes[0].model_dump_json()
        remaining_nodes = ",".join(item.model_dump_json() for item in parsed.nodes[1:])
        responses = FakeResponses(
            parsed,
            [
                delta(f'{{"nodes":[{first_node}'),
                delta(f',{remaining_nodes}]}}'),
            ],
        )
        client = SimpleNamespace(responses=responses)

        with (
            patch("app.ai.using_mock_ai", return_value=False),
            patch("app.ai.get_client", return_value=client),
            patch("app.ai._extract_response_text", side_effect=AssertionError("old JSON path used")),
        ):
            events = asyncio.run(collect(ai.generate_phase1_children("machine learning", [])))

        self.assertEqual(responses.calls[0]["text_format"], ai.Phase1ChildrenResponse)
        self.assertNotIn("tools", responses.calls[0])
        self.assertEqual([event["event"] for event in events].count("node_added"), 4)
        self.assertEqual(events[0]["data"]["label"], "Topic 0")
        self.assertEqual(events[-1]["event"], "stream_done")

    def test_phase2_expansion_streams_prerequisite_nodes_with_web_search(self) -> None:
        parsed = ai.Phase2ExpansionResponse(
            sources=[
                Resource(
                    url="https://example.com/one",
                    title="Resource One",
                    description="A technical resource about the topic.",
                ),
                Resource(
                    url="https://example.com/two",
                    title="Resource Two",
                    description="Another technical resource about the topic.",
                ),
            ],
            prerequisites=[
                ai.Phase2Prerequisite(label="Linear Algebra", hint="It explains the vector notation."),
                ai.Phase2Prerequisite(label="Optimization", hint="It explains how parameters are fitted."),
            ],
        )
        first_source = parsed.sources[0].model_dump_json()
        second_source = parsed.sources[1].model_dump_json()
        first_prereq = parsed.prerequisites[0].model_dump_json()
        second_prereq = parsed.prerequisites[1].model_dump_json()
        responses = FakeResponses(
            parsed,
            [
                delta(f'{{"sources":[{first_source}'),
                delta(f',{second_source}],"prerequisites":[{first_prereq}'),
                delta(f',{second_prereq}]}}'),
            ],
        )
        client = SimpleNamespace(responses=responses)

        with (
            patch("app.ai.using_mock_ai", return_value=False),
            patch("app.ai.get_client", return_value=client),
            patch("app.ai._extract_response_text", side_effect=AssertionError("old JSON path used")),
        ):
            events = asyncio.run(collect(ai.expand_phase2_node("Representation Learning", [], "Machine Learning")))

        self.assertEqual(responses.calls[0]["text_format"], ai.Phase2ExpansionResponse)
        self.assertEqual(responses.calls[0]["tools"], [{"type": "web_search_preview"}])
        node_updates = [event for event in events if event["event"] == "node_updated"]
        self.assertEqual(len(node_updates[0]["data"]["sources"]), 1)
        self.assertEqual(len(node_updates[-1]["data"]["sources"]), 2)
        self.assertEqual([event["event"] for event in events].count("node_added"), 2)
        self.assertEqual([event["event"] for event in events].count("edge_added"), 2)
        first_node_index = [event["event"] for event in events].index("node_added")
        self.assertLess(first_node_index, len(events) - 1)
        self.assertEqual(events[-1]["event"], "stream_done")

    def test_completed_json_array_items_ignores_braces_inside_strings(self) -> None:
        text = '{"nodes":[{"label":"A {nested} topic","description":"Has ] text","why_interesting":"ok"}'

        self.assertEqual(ai._completed_json_array_items(text, "nodes"), [text.removeprefix('{"nodes":[')])

    def test_suggest_prerequisite_uses_responses_parse_text_format(self) -> None:
        parsed = ai.SuggestedPrerequisiteResponse(
            label="Vector Spaces",
            description="Vector spaces support the parent topic by defining the objects it manipulates.",
        )
        responses = FakeResponses(parsed)
        client = SimpleNamespace(responses=responses)

        with (
            patch("app.ai.using_mock_ai", return_value=False),
            patch("app.ai.get_client", return_value=client),
            patch("app.ai._extract_response_text", side_effect=AssertionError("old JSON path used")),
        ):
            result = asyncio.run(ai.suggest_prerequisite("I do not know vector spaces", "Embeddings", ""))

        self.assertEqual(responses.calls[0]["text_format"], ai.SuggestedPrerequisiteResponse)
        self.assertEqual(result["label"], "Vector Spaces")
        self.assertEqual(
            result["description"],
            "Vector spaces support the parent topic by defining the objects it manipulates.",
        )


if __name__ == "__main__":
    unittest.main()
