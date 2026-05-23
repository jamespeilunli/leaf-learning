from __future__ import annotations

import json
import os
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from app import mock_ai
from app.models import ChatMessage, GraphEdge, GraphNode, Resource


MODEL = "gpt-4o"
API_KEY_PLACEHOLDER = "sk-your-key-here"
_client: AsyncOpenAI | None = None


def using_mock_ai() -> bool:
    mode = os.getenv("ALPHAG3N_AI_MODE", "").strip().lower()
    if mode == "openai":
        return False
    return True


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
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


def _loads_json_object(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


async def generate_phase1_children(
    current_label: str, ancestor_labels: list[str]
) -> AsyncGenerator[dict, None]:
    if using_mock_ai():
        async for event in mock_ai.generate_phase1_children(current_label, ancestor_labels):
            yield event
        return

    instructions = f"""
You generate a learning topic exploration tree.
Return ONLY a JSON object with this exact shape:
{{
  "nodes": [
    {{
      "label": "string",
      "description": "string (exactly 2 sentences describing the subtopic)",
      "why_interesting": "string (exactly 1 sentence on why someone learning would care)"
    }}
  ]
}}
Generate 4 to 6 subtopics of "{current_label}".
The user's selection path so far (most general to most specific): {ancestor_labels}.
Each subtopic must be meaningfully distinct from the others and from any ancestor in the path.
Do not repeat or rephrase topics already in the selection path.
""".strip()

    try:
        response = await get_client().responses.create(
            model=MODEL,
            instructions=instructions,
            input=f"Generate subtopics for {current_label}.",
        )
        payload = _loads_json_object(_extract_response_text(response))

        for item in payload["nodes"]:
            node = GraphNode(
                label=item["label"],
                description=item["description"],
                why_interesting=item["why_interesting"],
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

Search for and read the best resource that genuinely explains "{node_label}" at this technical level.
The resource must explain the topic in depth, not just introduce it.

Return ONLY a JSON object with this exact shape:
{{
  "resource": {{
    "url": "string",
    "title": "string",
    "description": "string (1–2 sentences on exactly what this resource covers and why it's the right one)"
  }},
  "prerequisites": [
    {{
      "label": "string",
      "hint": "string (1 sentence: what this prerequisite is and why the resource uses it)"
    }}
  ]
}}

prerequisites must be topics directly used or assumed by the resource — not general background.
Use concise, canonical prerequisite titles so equivalent topics collapse to the same name.
Avoid duplicates, near-duplicates, plural/singular variants, and acronym/full-name variants in the same result.
Do NOT include any of these topics as prerequisites, the user already knows them: {known_topics}
Return ONLY the JSON object. No prose, no markdown fences.
""".strip()

    try:
        response = await get_client().responses.create(
            model=MODEL,
            instructions=instructions,
            input=f"Expand the learning node for {node_label}.",
            tools=[{"type": "web_search_preview"}],
        )
        payload = _loads_json_object(_extract_response_text(response))

        resource = Resource.model_validate(payload["resource"])
        yield {
            "event": "node_updated",
            "data": {
                "resource": resource.model_dump(),
            },
        }

        for item in payload["prerequisites"]:
            node = GraphNode(
                label=item["label"],
                description=item["hint"],
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
