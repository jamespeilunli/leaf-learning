from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from typing import TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app import mock_ai
from app.models import ChatMessage, GraphEdge, GraphNode, Resource


MODEL = "gpt-5.4-mini"
API_KEY_PLACEHOLDER = "sk-your-key-here"
_client: AsyncOpenAI | None = None
ParsedResponseT = TypeVar("ParsedResponseT", bound=BaseModel)


class Phase1Child(BaseModel):
    label: str
    description: str
    why_interesting: str


class Phase1ChildrenResponse(BaseModel):
    nodes: list[Phase1Child] = Field(min_length=4, max_length=6)


class Phase2Prerequisite(BaseModel):
    label: str
    hint: str


class Phase2ExpansionResponse(BaseModel):
    prerequisites: list[Phase2Prerequisite]
    sources: list[Resource] = Field(min_length=2, max_length=4)


class SuggestedPrerequisiteResponse(BaseModel):
    label: str
    description: str


class _JsonArrayItemStream:
    def __init__(self, field_name: str, item_type: type[ParsedResponseT]) -> None:
        self.field_name = field_name
        self.item_type = item_type
        self.text = ""
        self.emitted_count = 0
        self.items: list[ParsedResponseT] = []

    def append(self, delta: str) -> list[ParsedResponseT]:
        self.text += delta
        return self.ready_items()

    def ready_items(self) -> list[ParsedResponseT]:
        raw_items = _completed_json_array_items(self.text, self.field_name)
        new_items = raw_items[self.emitted_count :]
        parsed: list[ParsedResponseT] = []
        for raw in new_items:
            parsed.append(self.item_type.model_validate_json(raw))
        self.emitted_count += len(parsed)
        self.items.extend(parsed)
        return parsed


def _completed_json_array_items(text: str, field_name: str) -> list[str]:
    key = f'"{field_name}"'
    key_index = text.find(key)
    if key_index < 0:
        return []

    colon_index = text.find(":", key_index + len(key))
    if colon_index < 0:
        return []

    array_start = text.find("[", colon_index + 1)
    if array_start < 0:
        return []

    items: list[str] = []
    object_start: int | None = None
    depth = 0
    in_string = False
    escaping = False

    for index in range(array_start + 1, len(text)):
        char = text[index]

        if in_string:
            if escaping:
                escaping = False
            elif char == "\\":
                escaping = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char == "]" and depth == 0:
            break

        if char == "{":
            if depth == 0:
                object_start = index
            depth += 1
            continue

        if char == "[" and depth > 0:
            depth += 1
            continue

        if char in "}]":
            if depth > 0:
                depth -= 1
            if depth == 0 and object_start is not None:
                items.append(text[object_start : index + 1])
                object_start = None

    return items


def _stream_text_delta(event: object) -> str:
    if getattr(event, "type", None) != "response.output_text.delta":
        return ""
    return getattr(event, "delta", "") or ""


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def using_mock_ai() -> bool:
    return not _env_flag("ALPHAG3N_USE_OPENAI", default=False)


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key or api_key == API_KEY_PLACEHOLDER:
            raise RuntimeError(
                "OpenAI usage is enabled, but OPENAI_API_KEY is missing or still set "
                "to the placeholder value."
            )
        _client = AsyncOpenAI()
    return _client


def _extract_response_text(response: object) -> str:
    output = getattr(response, "output", None)
    if not output:
        return getattr(response, "output_text", "") or ""

    chunks: list[str] = []
    for item in output:
        if getattr(item, "type", None) != "message":
            continue
        for content in getattr(item, "content", []):
            if getattr(content, "type", None) == "output_text":
                text = getattr(content, "text", "")
                if text:
                    chunks.append(text)

    return "".join(chunks).strip() or getattr(response, "output_text", "") or ""


def _require_output_parsed(response: object, expected_type: type[ParsedResponseT]) -> ParsedResponseT:
    output_parsed = getattr(response, "output_parsed", None)
    if output_parsed is None:
        raise RuntimeError("OpenAI returned no parsed structured output.")
    if not isinstance(output_parsed, expected_type):
        raise TypeError(f"OpenAI returned {type(output_parsed).__name__}; expected {expected_type.__name__}.")
    return output_parsed


async def generate_phase1_children(
    current_label: str, ancestor_labels: list[str]
) -> AsyncGenerator[dict, None]:
    if using_mock_ai():
        async for event in mock_ai.generate_phase1_children(current_label, ancestor_labels):
            yield event
        return

    instructions = f"""
You generate a learning topic exploration tree.
Generate 4 to 6 subtopics of "{current_label}".
The user's selection path so far (most general to most specific): {ancestor_labels}.
Each subtopic must be meaningfully distinct from the others and from any ancestor in the path.
Do not repeat or rephrase topics already in the selection path.
Each description must be exactly 2 sentences.
Each why_interesting value must be exactly 1 sentence on why someone learning would care.
""".strip()

    try:
        node_stream = _JsonArrayItemStream("nodes", Phase1Child)
        async with get_client().responses.stream(
            model=MODEL,
            instructions=instructions,
            input=f"Generate subtopics for {current_label}.",
            text_format=Phase1ChildrenResponse,
        ) as stream:
            async for event in stream:
                delta = _stream_text_delta(event)
                if not delta:
                    continue
                for item in node_stream.append(delta):
                    node = GraphNode(
                        label=item.label,
                        description=item.description,
                        why_interesting=item.why_interesting,
                        phase="1",
                        node_state="expanded",
                    )
                    yield {"event": "node_added", "data": node.model_dump(by_alias=True)}

            response = await stream.get_final_response()
            payload = _require_output_parsed(response, Phase1ChildrenResponse)
            for item in payload.nodes[node_stream.emitted_count :]:
                node = GraphNode(
                    label=item.label,
                    description=item.description,
                    why_interesting=item.why_interesting,
                    phase="1",
                    node_state="expanded",
                )
                yield {"event": "node_added", "data": node.model_dump(by_alias=True)}

        yield {"event": "stream_done", "data": {}}
    except Exception as exc:
        yield {"event": "stream_error", "data": {"message": str(exc)}}


async def expand_phase2_node(
    node_label: str, known_topics: list[str], goal_label: str
) -> AsyncGenerator[dict, None]:
    if using_mock_ai():
        async for event in mock_ai.expand_phase2_node(
            node_label,
            known_topics,
            goal_label,
        ):
            yield event
        return

    instructions = f"""
You are a learning roadmap assistant. The user's goal is to understand "{goal_label}".
Explain topics at a technical level with formal, precise, mechanism-focused detail.

Return prerequisites first so the UI can stream graph nodes immediately.
Then return sources.

prerequisites must contain 2 to 4 topics directly used or assumed by technical resources on this topic — not general background.
Choose prerequisites as the next lower layer in a six-level path from the goal down toward fundamentals.
For deeper prerequisite nodes, prefer more foundational concepts, so final leaf layers can be learned first and then used to climb back up to "{goal_label}".
Each prerequisite hint must be 1 sentence explaining what this prerequisite is and why the resources use it.
sources must contain 2 to 3 high-quality technical resources that explain "{node_label}" in depth.
Each source description must be exactly 1 sentence on what the resource covers and why it's useful.
Do NOT include any of these topics as prerequisites, the user already knows them: {known_topics}
""".strip()

    try:
        source_stream = _JsonArrayItemStream("sources", Resource)
        prerequisite_stream = _JsonArrayItemStream("prerequisites", Phase2Prerequisite)
        async with get_client().responses.stream(
            model=MODEL,
            instructions=instructions,
            input=f"Expand the learning node for {node_label}.",
            tools=[{"type": "web_search_preview"}],
            text_format=Phase2ExpansionResponse,
        ) as stream:
            async for event in stream:
                delta = _stream_text_delta(event)
                if not delta:
                    continue

                sources = source_stream.append(delta)
                if sources:
                    yield {
                        "event": "node_updated",
                        "data": {
                            "sources": [source.model_dump() for source in source_stream.items],
                        },
                    }

                for item in prerequisite_stream.append(delta):
                    node = GraphNode(
                        label=item.label,
                        description=item.hint,
                        phase="2",
                        node_state="grayed",
                    )
                    yield {"event": "node_added", "data": node.model_dump(by_alias=True)}
                    edge = GraphEdge(from_id=node_label, to_id=node.id, label="requires")
                    yield {"event": "edge_added", "data": edge.model_dump(by_alias=True)}

            response = await stream.get_final_response()
            payload = _require_output_parsed(response, Phase2ExpansionResponse)

            if source_stream.emitted_count < len(payload.sources):
                yield {
                    "event": "node_updated",
                    "data": {
                        "sources": [source.model_dump() for source in payload.sources],
                    },
                }

            for item in payload.prerequisites[prerequisite_stream.emitted_count :]:
                node = GraphNode(
                    label=item.label,
                    description=item.hint,
                    phase="2",
                    node_state="grayed",
                )
                yield {"event": "node_added", "data": node.model_dump(by_alias=True)}
                edge = GraphEdge(from_id=node_label, to_id=node.id, label="requires")
                yield {"event": "edge_added", "data": edge.model_dump(by_alias=True)}

        yield {"event": "stream_done", "data": {}}
    except Exception as exc:
        yield {"event": "stream_error", "data": {"message": str(exc)}}


async def explain_prerequisite(
    node_label: str, parent_label: str, parent_description: str
) -> str:
    if using_mock_ai():
        return await mock_ai.explain_prerequisite(
            node_label,
            parent_label,
            parent_description,
        )

    instructions = f"""
You are a tutor explaining prerequisite concepts.
The user is studying "{parent_label}" ({parent_description}).
They encountered a prerequisite called "{node_label}" and want to understand what it is
before deciding whether they already know it.
Explain what "{node_label}" is and why it appears as a prerequisite for understanding
"{parent_label}". Use a technical explanation style with precise mechanisms and terminology.
Write 3 to 5 sentences. Do not assume they know the term — explain it plainly.
""".strip()

    response = await get_client().responses.create(
        model=MODEL,
        instructions=instructions,
        input=f"Explain the prerequisite {node_label}.",
    )
    return _extract_response_text(response)


async def suggest_prerequisite(
    user_message: str,
    parent_label: str,
    parent_description: str,
) -> dict[str, str]:
    if using_mock_ai():
        return await mock_ai.suggest_prerequisite(user_message, parent_label, parent_description)

    instructions = f"""
You convert a user's note into a clean prerequisite node for a learning roadmap.
The parent topic is "{parent_label}" ({parent_description}).

The result should be a prerequisite or supporting concept, not a question.
The label should be a short technical concept name.
The description should be 1 sentence explaining what it is and why it supports the parent topic.
""".strip()

    response = await get_client().responses.parse(
        model=MODEL,
        instructions=instructions,
        input=user_message,
        text_format=SuggestedPrerequisiteResponse,
    )
    payload = _require_output_parsed(response, SuggestedPrerequisiteResponse)
    return {
        "label": payload.label.strip(),
        "description": payload.description.strip(),
    }


async def chat_with_node(
    node_label: str,
    node_description: str,
    resource_description: str,
    goal_path: list[str],
    history: list[ChatMessage],
    user_message: str,
) -> AsyncGenerator[str, None]:
    if using_mock_ai():
        async for chunk in mock_ai.chat_with_node(
            node_label,
            node_description,
            resource_description,
            goal_path,
            history,
            user_message,
        ):
            yield chunk
        return

    truncated_history = history[-20:]
    instructions = f"""
You are a focused tutor helping the user understand "{node_label}".
Their overall learning goal is: {goal_path[0]}
They reached this topic via: {" → ".join(goal_path)}
Preferred depth: technical, formal, and precise.
About this topic: {node_description}
The primary resource covers: {resource_description}

Answer questions about this specific topic at a technical level.
Be concise. Stay on topic.
""".strip()

    messages = [{"role": message.role, "content": message.content} for message in truncated_history]
    messages.append({"role": "user", "content": user_message})

    stream = await get_client().responses.create(
        model=MODEL,
        instructions=instructions,
        input=messages,
        stream=True,
    )

    async for event in stream:
        if getattr(event, "type", None) == "response.output_text.delta":
            text = getattr(event, "delta", "")
            if text:
                yield text
