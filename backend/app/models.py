from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


NodeState = Literal["expanded", "grayed", "learned"]
Phase = Literal["1", "2"]
Resolution = Literal["intuitive", "technical"]


class Resource(BaseModel):
    url: str
    title: str
    description: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: str = Field(default_factory=now_iso)


class GraphNode(BaseModel):
    id: str = Field(default_factory=new_id)
    label: str
    description: str | None = None
    why_interesting: str | None = None
    phase: Phase
    node_state: NodeState = "grayed"
    intuition_score: float | None = None
    resource: Resource | None = None
    parent_id: str | None = None
    child_ids: list[str] = Field(default_factory=list)
    depth: int = 0
    chat_history: list[ChatMessage] = Field(default_factory=list)
    explain_more_text: str | None = None


class GraphEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(default_factory=new_id)
    from_id: str = Field(alias="from")
    to_id: str = Field(alias="to")
    label: str | None = None


class Session(BaseModel):
    id: str = Field(default_factory=new_id)
    created_at: str = Field(default_factory=now_iso)
    phase: Phase = "1"
    resolution: Resolution | None = None
    root_topic: str
    selection_history: list[str] = Field(default_factory=list)
    current_phase1_node_id: str | None = None
    focus_node_id: str | None = None
    known_topics: list[str] = Field(default_factory=list)
    nodes: dict[str, GraphNode] = Field(default_factory=dict)
    edges: list[GraphEdge] = Field(default_factory=list)
