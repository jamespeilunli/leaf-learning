from __future__ import annotations

import json
from collections.abc import Iterable

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.ai import chat_with_node
from app.models import ChatMessage, GraphNode, Session
from app.storage import load_session, save_session


router = APIRouter()


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)


def _sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _get_node(session: Session, node_id: str) -> GraphNode:
    node = session.nodes.get(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return node


def _goal_path(session: Session, node: GraphNode) -> list[str]:
    labels: list[str] = []
    current: GraphNode | None = node
    while current:
        labels.append(current.label)
        if current.id == session.focus_node_id:
            return list(reversed(labels))
        next_parent_id = current.parent_ids[0] if current.parent_ids else current.parent_id
        current = session.nodes.get(next_parent_id) if next_parent_id else None
    return [session.root_topic, node.label]


@router.post("/session/{session_id}/node/{node_id}/chat")
async def chat(session_id: str, node_id: str, payload: ChatRequest) -> StreamingResponse:
    session = load_session(session_id)
    node = _get_node(session, node_id)
    if node.node_state not in {"expanded", "learned"}:
        raise HTTPException(status_code=400, detail="Node chat is only available for expanded nodes.")
    goal_path = _goal_path(session, node)
    node_description = node.description or ""
    resource_description = node.sources[0].description if node.sources else node.resource.description if node.resource else ""

    async def event_stream() -> Iterable[str]:
        full_response = ""
        try:
            async for chunk in chat_with_node(
                node.label,
                node_description,
                resource_description,
                goal_path,
                node.chat_history[-20:],
                payload.message,
            ):
                full_response += chunk
                yield _sse("token", {"text": chunk})
        except Exception as exc:
            yield _sse("stream_error", {"message": str(exc)})
            return

        node.chat_history.extend(
            [
                ChatMessage(role="user", content=payload.message),
                ChatMessage(role="assistant", content=full_response),
            ]
        )
        node.chat_history = node.chat_history[-20:]
        save_session(session)
        yield _sse("stream_done", {})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
