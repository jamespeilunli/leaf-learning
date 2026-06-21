Learning Roadmap App — Design Document
Problem Statement
When you start learning something new, you don't know what you don't know. You can't search for what you haven't heard of. You don't know where to start, and you don't know where your starting point leads. This app solves two sequential problems:
Phase 1 — What do I actually want to learn? You have a vague interest. The app helps you narrow it to a specific, committed goal through a guided selection drill.
Phase 2 — How do I get there, and what do I need first? Given a specific goal, the app generates a prerequisite roadmap with curated resources. As you examine each resource, the app surfaces what that resource assumes you already know — as grayed-out nodes. You decide which gaps to expand and which to dismiss.

Phase 1 — Topic Narrowing
Entry
The user is shown a single prompt: "What do you want to learn?" They type anything — a concept, a field, a question. This is the seed.
The Narrowing Loop
The app generates a tree rooted at the seed topic, with 4–6 subtopic children. The user receives a notification that the tree has been updated and is invited to examine the options.
The user selects one subtopic. That subtopic becomes the new root. A new set of children is generated for it. The previous tree is still accessible for backtracking — the user can step back up the selection history at any time.
This loop repeats: select a subtopic, re-root, generate children, repeat. Each iteration drills one level deeper in specificity. The user continues until they reach a topic specific enough to commit to learning seriously.
When ready, the user presses Deep Dive on the current root node. This ends Phase 1 and begins Phase 2 with that node as the learning goal.
Resolution Selection
At some point before or during Phase 1 (exact placement is flexible — a sensible default is to prompt for it when Deep Dive is pressed), the user chooses their preferred depth:
Intuitive — conceptual understanding, metaphors, the "why." Example: understanding that exp curves a function onto a rotational manifold, without working through the equations.
Technical — formal definitions, derivations, the "how." Example: understanding exp as arising from x' = Ax, so the solution must be e^(At).
This preference is stored and passed to every AI call in Phase 2. It affects resource selection, how prerequisites are framed, and the tone of inline chat responses.
Backtracking
The selection history is maintained as a stack. A "back" button steps the user up one level, restoring the previous root and its children. The user can navigate this history freely before pressing Deep Dive.

Phase 2 — Prerequisite Roadmap
Initial Generation
Phase 2 begins with the chosen goal node at the top of a tree. The AI searches for the best resource explaining this topic at the user's resolution level, reads it, and generates a fully expanded node: a resource link, a description of what the resource covers, an intuition score, and a set of grayed-out prerequisite nodes representing topics the resource assumes the reader knows.
Node States
Every node in Phase 2 is in one of three states:
Fully expanded — the node has been generated. It shows:
A title and 2-sentence description of the topic
A link to a curated resource that genuinely explains the topic (not an introduction)
A brief description of what the resource covers, so the user can judge its relevance without clicking
An intuition score (0 = purely conceptual, 1 = highly technical) as a visible badge, letting the user decide whether to engage deeply or accept the concept at face value
An inline chat toggle (see below)
A "Learned" button
Grayed-out — the node exists as a named prerequisite detected from a parent node's resource, but has not been expanded yet. It shows only a title and a one-sentence hint about what it represents. The user has two options:
"Explain more" — triggers an AI explanation of what this prerequisite actually is, in plain language, so the user can self-assess whether they know it. This does not expand the node — it just helps the user decide.
"Don't know" — fully expands the node: finds a resource, generates a description, scores it, and creates its own set of grayed-out prerequisite children.
Silently ignoring a grayed-out node (not acting on it) is the implicit "I know this" action. Grayed nodes that are never expanded are treated as known.
Learned — the user has pressed "Learned" on a fully expanded node. The node gets a checkmark. Its normalized label is added to the session's known_topics set. Any other node in the tree whose label matches a known topic is automatically grayed out further (visually distinct from a regular grayed-out prerequisite — use a checkmark or strikethrough to differentiate). Future AI calls will not suggest topics in known_topics as prerequisites.
Prerequisite Detection
Every time a node is fully expanded, the AI reads the resource and identifies topics that are directly used or assumed in it — not general background knowledge, but things that would block understanding if missing. Each of these becomes a grayed-out child node.
The AI is given the current known_topics list and must not surface topics the user has already marked as learned.
Deduplication
When a node is marked Learned, the app scans the entire tree for other nodes with matching normalized labels (case-insensitive, whitespace-normalized). Any matches that are currently grayed-out are marked as implicitly known and receive a distinct visual treatment (e.g., a small checkmark overlay on the grayed node). Any matches that are fully expanded but not yet learned are highlighted as "you already learned this elsewhere."
"Explain More" Flow
When the user presses "Explain more" on a grayed node, the app calls the AI with the node's label, its parent node's topic context, and the user's resolution preference. The AI returns a plain-language explanation of what this prerequisite is and why the parent resource uses it. This explanation appears inline below the grayed node as an expandable panel. The node remains grayed-out — the user then decides to expand it ("Don't know") or leave it ("I know this enough").
Inline Chat
Every fully expanded node has a chat toggle. Opening it reveals a streaming chat panel scoped to that node. The system context includes the node's label, description, resource summary, the user's resolution preference, and the path from the root goal down to this node. The user can ask questions and get tutor-style responses without leaving the graph.
Chat history per node is persisted in the session.
Pruning
The user can prune any subtree they're not interested in. This removes the node and all its descendants from the graph and saves the change to the session.

Graph Layout and Navigation
Phase 1
The Phase 1 view is not a traditional graph — it is a focused selection interface. The current root is prominently displayed at the top. Its children are displayed as selectable option cards below it. A breadcrumb or back-stack is shown above the root so the user can see and navigate their selection history.
When the user selects a child, that child becomes the new root, slides to the top position, and new children are generated below it. The old root and its siblings slide into the history stack.
This is not rendered with React Flow. It is a custom list/card UI — simpler and clearer for the selection task.
Phase 2
Phase 2 is rendered as a top-down tree using React Flow with a dagre layout. The goal node is at the top. Prerequisites branch downward. The tree grows as nodes are expanded.
Fully expanded nodes are visually prominent. Grayed-out nodes are visually subdued — lower opacity, dashed border. Learned nodes have a checkmark overlay. Nodes currently loading (being expanded) show a shimmer state.
Edges are labeled "requires" and point from the goal downward toward prerequisites.
A minimap is shown in Phase 2 for navigating large graphs.

Data Model
Session
id: UUID
created_at: ISO timestamp
phase: "1" | "2"
resolution: "intuitive" | "technical" | null
root_topic: string
selection_history: string[] (stack of node IDs from Phase 1 selections)
current_phase1_node_id: string | null
focus_node_id: string | null (the Phase 2 goal, set at Deep Dive)
known_topics: string[] (normalized labels of all Learned nodes)
nodes: map of node_id → Node
edges: Edge[]

Node
id: string
label: string
description: string | null (null if grayed-out and not yet explained)
phase: "1" | "2"
node_state: "expanded" | "grayed" | "learned"
intuition_score: float | null (0.0–1.0, Phase 2 expanded nodes only)
resource: Resource | null (null if grayed-out)
parent_id: string | null
child_ids: string[]
depth: int (Phase 2, 0 = goal)
chat_history: ChatMessage[]
explain_more_text: string | null (populated by "Explain more" action)

Resource
url: string
title: string
description: string (1–2 sentences on what this resource covers)

Edge
id: string
from: node_id (parent)
to: node_id (child / prerequisite)
label: string | null

ChatMessage
role: "user" | "assistant"
content: string
created_at: ISO timestamp

Storage
All state is stored as flat JSON files in backend/sessions/. One file per session, named <session_id>.json. The backend reads the file at request start and writes it on any mutation. No database, no migrations. The sessions/ directory is created by the backend on startup and is gitignored.
The frontend stores the active session_id in localStorage. On app load, if a session ID is found, it fetches the full session from the backend and restores state.

AI Behavior Summary
Phase 1 — Child Generation
No web search. The prompt includes the current root node label and all ancestor labels (the selection path so far). Returns 4–6 subtopics as structured JSON: id, label, description (2 sentences), why_interesting (1 sentence), and 1–2 resource URLs. Subtopics must be meaningfully distinct from each other and from any ancestor.
Phase 2 — Node Expansion
Web search enabled. Given a node label, resolution preference, known_topics list, and the goal label. Returns: a resource (URL, title, description), an intuition score (0.0–1.0), and a list of prerequisite topics detected from the resource (each with a label and a 1-sentence hint). The known_topics list must be passed so already-known prerequisites are excluded.
Explain More
No web search. Given a grayed node's label, its parent node's label and description, and the resolution preference. Returns a plain-language explanation of what the prerequisite is and why it matters in the context of the parent topic. Approximately 3–5 sentences.
Inline Chat
No web search. System context: node label, description, resource description, resolution preference, path from goal to this node. Streaming. Responds in tutor style at the specified resolution level.

Out of Scope (v1)
User accounts or authentication
Multiple simultaneous users
Export / sharing
Embedding-based deduplication (exact label match is sufficient)
Undo/redo
Mobile layout
Offline support

Learning Roadmap App — Implementation Document
Read DESIGN.md first. This document specifies every file, API contract, data structure, and behavior. It is written for a coding agent with no prior context.

Repository Layout (Target State)
./
├── backend/
│ ├── app/
│ │ ├── **init**.py
│ │ ├── main.py
│ │ ├── models.py
│ │ ├── storage.py
│ │ ├── ai.py
│ │ └── routers/
│ │ ├── **init**.py
│ │ ├── session.py
│ │ ├── graph.py
│ │ └── chat.py
│ ├── sessions/ ← gitignored, created at runtime
│ ├── .env ← gitignored, contains backend runtime flags
│ ├── requirements.txt
│ └── README.md
├── frontend/
│ ├── public/
│ │ ├── favicon.svg
│ │ └── icons.svg
│ ├── src/
│ │ ├── assets/
│ │ ├── components/
│ │ │ ├── StartScreen.tsx
│ │ │ ├── Phase1View.tsx
│ │ │ ├── Phase1OptionCard.tsx
│ │ │ ├── GraphCanvas.tsx
│ │ │ ├── Phase2Node.tsx
│ │ │ ├── GrayedNode.tsx
│ │ │ ├── NodeChatPanel.tsx
│ │ │ ├── ResolutionPicker.tsx
│ │ │ └── DeepDiveButton.tsx
│ │ ├── store/
│ │ │ └── useSessionStore.ts
│ │ ├── hooks/
│ │ │ └── useSSE.ts
│ │ ├── lib/
│ │ │ └── api.ts
│ │ ├── types.ts
│ │ ├── App.tsx
│ │ ├── index.css
│ │ └── main.tsx
│ ├── index.html
│ ├── package.json
│ ├── tsconfig.json
│ ├── tsconfig.app.json
│ ├── tsconfig.node.json
│ ├── vite.config.ts
│ └── eslint.config.js
└── README.md

Backend
backend/requirements.txt
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
openai>=1.30.0
pydantic>=2.7.0
python-dotenv>=1.0.0
sse-starlette>=1.8.0

Environment
OpenAI mode is controlled by ALPHAG3N_USE_OPENAI. User API keys are entered in the frontend and sent to the backend per AI request.

backend/app/models.py
from **future** import annotations
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict
import uuid
from datetime import datetime, timezone

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
description: str # 1–2 sentences on what this resource covers

class ChatMessage(BaseModel):
role: Literal["user", "assistant"]
content: str
created_at: str = Field(default_factory=now_iso)

class GraphNode(BaseModel):
id: str = Field(default_factory=new_id)
label: str
description: str | None = None
why_interesting: str | None = None # Phase 1 only
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
selection_history: list[str] = Field(default_factory=list) # stack of node IDs
current_phase1_node_id: str | None = None
focus_node_id: str | None = None
known_topics: list[str] = Field(default_factory=list)
nodes: dict[str, GraphNode] = Field(default_factory=dict)
edges: list[GraphEdge] = Field(default_factory=list)

Important: GraphEdge uses from_id as the Python attribute and "from" as the JSON key via alias. Always serialize edges with by_alias=True.

backend/app/storage.py
from pathlib import Path
from fastapi import HTTPException
from app.models import Session

SESSIONS_DIR = Path(**file**).parent.parent / "sessions"

def ensure_sessions_dir() -> None:
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

def session_path(session_id: str) -> Path:
return SESSIONS_DIR / f"{session_id}.json"

def save_session(session: Session) -> None:
path = session_path(session.id)
path.write_text(session.model_dump_json(indent=2, by_alias=True))

def load_session(session_id: str) -> Session:
path = session_path(session_id)
if not path.exists():
raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
return Session.model_validate_json(path.read_text())

def list_sessions() -> list[dict]:
result = []
for f in SESSIONS_DIR.glob("\*.json"):
try:
s = Session.model_validate_json(f.read_text())
result.append({
"id": s.id,
"root_topic": s.root_topic,
"created_at": s.created_at,
"phase": s.phase,
})
except Exception:
pass
return result

backend/app/ai.py
All OpenAI calls live here. Build AsyncOpenAI(api_key=...) from the request-scoped frontend key. All functions that produce graph events are async generators yielding dicts. The routers convert these dicts to SSE format.
Use client.responses.create(...) for all calls (Responses API, not Chat Completions). This is required for web_search_preview support and is used consistently for all calls.
The model for all calls is "gpt-4o".

generate_phase1_children(current_label: str, ancestor_labels: list[str]) -> AsyncGenerator[dict, None]
No tools. System prompt instructs the model to return only a JSON object, no prose, no fences:
You generate a learning topic exploration tree.
Return ONLY a JSON object with this exact shape:
{
"nodes": [
{
"label": "string",
"description": "string (exactly 2 sentences describing the subtopic)",
"why_interesting": "string (exactly 1 sentence on why someone learning would care)"
}
]
}
Generate 4 to 6 subtopics of "{current_label}".
The user's selection path so far (most general to most specific): {ancestor_labels}.
Each subtopic must be meaningfully distinct from the others and from any ancestor in the path.
Do not repeat or rephrase topics already in the selection path.

Parse the response JSON. For each node in the response, create a GraphNode with phase="1", node_state="expanded", and yield:
{"event": "node_added", "data": node.model_dump(by_alias=True)}

Then yield {"event": "stream_done", "data": {}}.
On any exception, yield {"event": "stream_error", "data": {"message": str(e)}}.

expand_phase2_node(node_label: str, resolution: str, known_topics: list[str], goal_label: str) -> AsyncGenerator[dict, None]
Uses web_search_preview tool:
tools=[{"type": "web_search_preview"}]

System prompt:
You are a learning roadmap assistant. The user's goal is to understand "{goal_label}".
They prefer a {resolution} level of understanding
(intuitive = conceptual/metaphorical, technical = formal/precise/equation-level).

Search for and read the best resource that genuinely explains "{node_label}" at this level.
The resource must explain the topic in depth, not just introduce it.

Return ONLY a JSON object with this exact shape:
{
"resource": {
"url": "string",
"title": "string",
"description": "string (1–2 sentences on exactly what this resource covers and why it's the right one)"
},
"intuition_score": 0.0,
"prerequisites": [
{
"label": "string",
"hint": "string (1 sentence: what this prerequisite is and why the resource uses it)"
}
]
}

intuition_score must be a float from 0.0 (purely conceptual) to 1.0 (highly technical/formal).
prerequisites must be topics directly used or assumed by the resource — not general background.
Do NOT include any of these topics as prerequisites, the user already knows them: {known_topics}
Return ONLY the JSON object. No prose, no markdown fences.

Parse the response. Yield:
{"event": "node_updated", "data": {"resource": resource_dict, "intuition_score": float}} — updates the current node with its resource and score.
For each prerequisite: create a GraphNode with phase="2", node_state="grayed", description=hint. Yield {"event": "node_added", "data": node_dict}.
For each prerequisite node: create a GraphEdge from the current node to the prerequisite. Yield {"event": "edge_added", "data": edge_dict}.
{"event": "stream_done", "data": {}}.

explain_prerequisite(node_label: str, parent_label: str, parent_description: str, resolution: str) -> str
Not a generator. Returns a plain string. No tools.
System prompt:
You are a tutor explaining prerequisite concepts.
The user is studying "{parent_label}" ({parent_description}).
They encountered a prerequisite called "{node_label}" and want to understand what it is
before deciding whether they already know it.
Explain what "{node_label}" is and why it appears as a prerequisite for understanding
"{parent_label}". Use a {resolution} explanation style.
Write 3 to 5 sentences. Do not assume they know the term — explain it plainly.

Call client.responses.create(...) without streaming, return response.output_text.

chat_with_node(node_label: str, node_description: str, resource_description: str, resolution: str, goal_path: list[str], history: list[ChatMessage], user_message: str) -> AsyncGenerator[str, None]
Streaming. No tools.
System prompt:
You are a focused tutor helping the user understand "{node_label}".
Their overall learning goal is: {goal_path[0]}
They reached this topic via: {" → ".join(goal_path)}
Their preferred depth: {resolution} (intuitive = conceptual, technical = formal/precise)
About this topic: {node_description}
The primary resource covers: {resource_description}

Answer questions about this specific topic at the {resolution} level.
Be concise. Stay on topic.

Messages array: history as role/content pairs, then append {"role": "user", "content": user_message}.
Use stream=True. Yield each text chunk as a plain string as it arrives. The router wraps chunks in SSE format.
Trim history to the last 20 messages before building the messages array if it exceeds that length.

backend/app/routers/session.py
All routes registered on a router = APIRouter(). Prefix /api is added in main.py.

POST /session
Request body: { "topic": string }
This is a non-streaming endpoint. It awaits the full AI response before returning.
Create a root GraphNode: phase="1", node_state="expanded", label=topic, description="Starting topic", depth=0.
Create a Session with root_topic=topic, current_phase1_node_id=root_node.id, nodes={root_node.id: root_node}.
Save to disk.
Collect all events from generate_phase1_children(topic, []):
For each node_added event: create a GraphNode from the data, set parent_id=root_node.id, depth=1. Add to session.nodes. Add the node's id to root_node.child_ids.
For each edge event: skip (edges between Phase 1 children and root are implicitly tracked via parent_id / child_ids).
Save session again.
Return {"session_id": session.id, "session": session.model_dump(by_alias=True)}.

GET /session/{session_id}
Load and return the full session as JSON.

GET /sessions
Return list_sessions().

POST /session/{session_id}/select-topic
Request body: { "node_id": string }
Phase 1 topic selection. The user has chosen a subtopic to drill into.
Load session.
Push session.current_phase1_node_id onto session.selection_history.
Set session.current_phase1_node_id = node_id.
Get the selected node's label and build ancestor_labels by walking up the parent_id chain, collecting labels from root to current (most general first).
Collect all events from generate_phase1_children(selected_node.label, ancestor_labels).
For each node_added: create node with parent_id=node_id, depth=selected_node.depth+1, add to session.nodes, add to selected_node.child_ids.
Save session.
Return updated session.
This is non-streaming. Await the full AI call before returning.

POST /session/{session_id}/back
No request body.
Phase 1 backtrack. Pops one level from the selection history.
Load session.
If selection_history is empty: return 400 "Already at root."
Pop the last ID from selection_history. Set current_phase1_node_id to that popped ID.
Save and return updated session.
Note: this does not delete the child nodes that were generated — they remain in session.nodes so re-selecting the same path doesn't regenerate. The frontend simply re-renders the children of the restored current node.

POST /session/{session_id}/resolution
Request body: { "resolution": "intuitive" | "technical" }
Update session.resolution, save, return updated session.

POST /session/{session_id}/deep-dive
Request body: { "node_id": string }
Load session.
Set session.focus_node_id = node_id.
Set session.phase = "2".
The focus node's node_state remains "expanded" but its Phase 2 resource has not been fetched yet — that happens via the expand endpoint.
Save and return {"session": session.model_dump(by_alias=True)}.

backend/app/routers/graph.py

POST /session/{session_id}/node/{node_id}/expand — SSE
Returns text/event-stream.
Handles both Phase 1 (if somehow called) and Phase 2 expansion. In practice this endpoint is used for Phase 2 — expanding a grayed node into a fully expanded node with resources and new grayed prerequisites.
Load session.
Find the node. It must exist and have node_state="grayed" (or be the focus node on first Phase 2 expansion).
Set the node's node_state = "expanded" in memory (the resource will arrive via node_updated).
Build goal_label = label of session.nodes[session.focus_node_id].
Build ancestor_labels = walk parent_id chain upward, collect labels.
Stream events from expand_phase2_node(node.label, session.resolution, session.known_topics, goal_label):
node_updated: apply resource and intuition_score to the current node in session. Save session. Forward event.
node_added: create new GraphNode from data, set parent_id=node_id, depth=node.depth+1, node_state="grayed". Add to session.nodes. Add to node.child_ids. Save session. Forward event.
edge_added: add edge to session.edges. Save session. Forward event.
stream_done: save session. Forward event. Close stream.
stream_error: save session. Forward event. Close stream.
SSE format for each event:
event: {event_name}\ndata: {json_string}\n\n

POST /session/{session_id}/node/{node_id}/explain — regular POST
Request body: none.
Calls explain_prerequisite(...) for a grayed node.
Load session. Find node (must be node_state="grayed").
Find parent node via node.parent_id.
Call explain_prerequisite(node.label, parent.label, parent.description or "", session.resolution).
Store result in node.explain_more_text.
Save session.
Return {"explain_more_text": text}.

DELETE /session/{session_id}/node/{node_id}
Recursively remove a node and all its descendants.
Load session.
Collect the node and all descendants by recursively following child_ids.
Remove all collected IDs from session.nodes.
Remove all edges where from_id or to_id is in the collected set.
Remove node_id from its parent's child_ids (if parent exists).
Save session.
Return {"removed_node_ids": list_of_ids}.

PATCH /session/{session_id}/node/{node_id}/status
Request body: { "node_state": "learned" | "grayed" }
Only "learned" and "grayed" are valid targets via this endpoint (clients use it to mark learned or to un-mark).
Load session. Find node.
Set node.node_state = node_state.
If node_state == "learned":
Normalize node.label: node.label.lower().strip().
Append to session.known_topics if not already present.
Scan all nodes: any node whose normalized label matches and whose node_state == "grayed" gets a special explain_more_text set to "**known**" (sentinel value the frontend uses to render the "already learned" overlay). Do not change their node_state — they remain grayed.
Save session. Return updated session.

backend/app/routers/chat.py

POST /session/{session_id}/node/{node_id}/chat — SSE
Request body: { "message": string }
Load session. Find node (must be node_state="expanded").
Build goal_path: walk from session.focus_node_id to this node via parent_id chain, collecting labels. If path-building fails, fall back to [session.root_topic, node.label].
Get resource_description = node.resource.description if node.resource else "".
Get node_description = node.description or "".
Stream from chat_with_node(...) with trimmed history and the new message.
Collect all streamed chunks into full_response.
After stream ends, append both messages to node.chat_history. Trim to last 20 if over limit. Save session.
Stream each chunk as:
event: token\ndata: {"text": "chunk_text"}\n\n
End with:
event: stream_done\ndata: {}\n\n

backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.storage import ensure_sessions_dir
from app.routers import session, graph, chat

load_dotenv()
ensure_sessions_dir()

app = FastAPI(title="Learning Roadmap API")

app.add_middleware(
CORSMiddleware,
allow_origins=["http://localhost:5173"],
allow_methods=["*"],
allow_headers=["*"],
)

app.include_router(session.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(chat.router, prefix="/api")

Run: uvicorn app.main:app --reload --port 8000 from the backend/ directory.

Frontend
Package additions to frontend/package.json
"dependencies": {
"reactflow": "^11.11.0",
"zustand": "^4.5.2",
"dagre": "^0.8.5",
"@tanstack/react-query": "^5.40.0",
"axios": "^1.7.2",
"clsx": "^2.1.1"
}

Tailwind CSS, TypeScript, and Vite are assumed already configured.

frontend/src/types.ts
export type NodeState = 'expanded' | 'grayed' | 'learned'
export type Phase = '1' | '2'
export type Resolution = 'intuitive' | 'technical'

export interface Resource {
url: string
title: string
description: string
}

export interface ChatMessage {
role: 'user' | 'assistant'
content: string
created_at: string
}

export interface GraphNode {
id: string
label: string
description: string | null
why_interesting: string | null
phase: Phase
node_state: NodeState
intuition_score: number | null
resource: Resource | null
parent_id: string | null
child_ids: string[]
depth: number
chat_history: ChatMessage[]
explain_more_text: string | null
}

export interface GraphEdge {
id: string
from: string
to: string
label: string | null
}

export interface Session {
id: string
created_at: string
phase: Phase
resolution: Resolution | null
root_topic: string
selection_history: string[]
current_phase1_node_id: string | null
focus_node_id: string | null
known_topics: string[]
nodes: Record<string, GraphNode>
edges: GraphEdge[]
}

frontend/src/lib/api.ts
Base URL: http://localhost:8000/api. All functions use axios. All responses are typed.
createSession(topic: string): Promise<{ session_id: string; session: Session }>
getSession(id: string): Promise<Session>
listSessions(): Promise<Array<{ id: string; root_topic: string; created_at: string; phase: Phase }>>
selectTopic(sessionId: string, nodeId: string): Promise<Session>
back(sessionId: string): Promise<Session>
setResolution(sessionId: string, resolution: Resolution): Promise<Session>
deepDive(sessionId: string, nodeId: string): Promise<{ session: Session }>
explainNode(sessionId: string, nodeId: string): Promise<{ explain_more_text: string }>
deleteNode(sessionId: string, nodeId: string): Promise<{ removed_node_ids: string[] }>
updateNodeState(sessionId: string, nodeId: string, node_state: 'learned' | 'grayed'): Promise<Session>

SSE endpoints (expand and chat) are called via the streamSSE utility, not axios.

SSE via fetch — shared utility in frontend/src/hooks/useSSE.ts
All SSE endpoints in this app require POST bodies, so EventSource cannot be used. Implement a single async generator that handles the SSE wire format over a fetch response body.
export async function\* streamSSE(
url: string,
body: object
): AsyncGenerator<{ event: string; data: unknown }> {
const response = await fetch(url, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(body),
})
if (!response.ok) throw new Error(`HTTP ${response.status}`)
const reader = response.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''
let currentEvent = 'message'

while (true) {
const { done, value } = await reader.read()
if (done) break
buffer += decoder.decode(value, { stream: true })
const lines = buffer.split('\n')
buffer = lines.pop()!
for (const line of lines) {
if (line.startsWith('event: ')) {
currentEvent = line.slice(7).trim()
} else if (line.startsWith('data: ')) {
const raw = line.slice(6)
try {
yield { event: currentEvent, data: JSON.parse(raw) }
} catch {
yield { event: currentEvent, data: raw }
}
currentEvent = 'message'
}
}
}
}

frontend/src/store/useSessionStore.ts
Zustand store. Single source of truth for all session state. All server mutations go through store actions, which update local state optimistically and save to backend.
interface SessionStore {
// State
sessionId: string | null
session: Session | null
isLoading: boolean
streamingNodeIds: Set<string>
chatOpenNodeId: string | null
error: string | null

// Phase 1 actions
initSession: (topic: string) => Promise<void>
loadSession: (id: string) => Promise<void>
selectTopic: (nodeId: string) => Promise<void>
back: () => Promise<void>
setResolution: (r: Resolution) => Promise<void>
deepDive: (nodeId: string) => Promise<void>

// Phase 2 actions
expandNode: (nodeId: string) => Promise<void>
explainNode: (nodeId: string) => Promise<void>
markLearned: (nodeId: string) => Promise<void>
deleteNode: (nodeId: string) => Promise<void>

// Chat actions
openChat: (nodeId: string) => void
closeChat: () => void

// Internal SSE applicators
\_applyNodeAdded: (node: GraphNode) => void
\_applyNodeUpdated: (patch: { id?: string; resource?: Resource; intuition_score?: number }) => void
\_applyEdgeAdded: (edge: GraphEdge) => void
}

Key implementation notes:
initSession: calls api.createSession, stores session_id in localStorage under key "roadmap_session_id", sets session and sessionId in store.
loadSession: calls api.getSession, sets store. On 404, clears localStorage.
selectTopic: calls api.selectTopic. The response is the full updated session — replace store.session entirely. The backend has already generated and stored the children; they are in the returned session's nodes map.
expandNode:
Add nodeId to streamingNodeIds.
Open SSE stream via streamSSE to POST /api/session/{id}/node/{nodeId}/expand.
Handle events:
node_updated: find the node in session.nodes, apply resource and intuition_score.
node_added: add the new grayed node to session.nodes. Also add its id to the parent node's child_ids.
edge_added: add the edge to session.edges.
stream_done: remove nodeId from streamingNodeIds.
stream_error: remove from streamingNodeIds, set error.
Each event should trigger a Zustand state update so React re-renders incrementally.
explainNode: calls api.explainNode. On success, set node.explain_more_text in the store.
markLearned:
Optimistically set node.node_state = "learned" and add normalized label to session.known_topics.
Scan all nodes: any grayed node whose normalized label is in known_topics and whose explain_more_text !== "**known**" — set explain_more_text = "**known**" locally.
Call api.updateNodeState(sessionId, nodeId, "learned") in background. Replace session with response.
deleteNode: calls api.deleteNode. Remove removed_node_ids from session.nodes. Remove associated edges.

frontend/src/App.tsx
Mount behavior:
Read localStorage.getItem("roadmap_session_id").
If present, call store.loadSession(id). Catch 404 and clear localStorage.
Render based on store.session:
null or loading: <StartScreen />
session.phase === "1": <Phase1View />
session.phase === "2": full-screen <GraphCanvas /> with <NodeChatPanel /> drawer if chatOpenNodeId is set

frontend/src/components/StartScreen.tsx
Centered layout.
Large text input labeled "What do you want to learn?"
Submit button. On submit: store.initSession(topic). Show loading state with text "Exploring [topic]...".
Below the input, if listSessions() returns results, show a "Continue a previous session" section with clickable rows (root_topic + date). Clicking calls store.loadSession(id).

frontend/src/components/Phase1View.tsx
This is NOT a graph. It is a vertical card-selection interface. Do not use React Flow here.
Layout:
Top: breadcrumb showing the selection path. Each crumb is clickable and calls store.back() repeatedly until that ancestor is the current node. (Simplification: call back once per click on the crumb, or implement a backTo(nodeId) that pops until correct.)
Middle: large card for the current node. Shows label, description, and a "Deep Dive" button if the topic is specific enough.
Below the current node card: a row or grid of option cards, one per child node of the current node. Each is a <Phase1OptionCard />.
Bottom persistent bar: <ResolutionPicker /> (compact inline version).
When store.isLoading is true (after selecting a topic, while waiting for children to generate), show a skeleton/shimmer in the option card area.

frontend/src/components/Phase1OptionCard.tsx
Receives node: GraphNode.
Displays:
Label (bold)
why_interesting in small muted text
Description text
Resource links if any (small external links)
On click: calls store.selectTopic(node.id).
Hover state: slightly elevated border.

frontend/src/components/DeepDiveButton.tsx
Rendered inside Phase1View on the current node card.
Label: "Deep Dive →"
On click:
If session.resolution === null: open <ResolutionPicker /> as a modal/overlay. Wait for selection.
Call store.deepDive(currentNode.id).
Immediately call store.expandNode(currentNode.id) to kick off Phase 2 generation for the goal node.

frontend/src/components/ResolutionPicker.tsx
Two large clickable cards:
Intuitive
Subtitle: "Concepts, metaphors, the why"
Example: "I want to know that exp curves a function onto a rotational manifold"
Technical
Subtitle: "Formal definitions, the how"
Example: "I want to derive exp from x' = Ax → x = e^(At)"
On selection: calls store.setResolution(r). The selected card gets a highlighted border.
Can be rendered as a bottom bar in Phase1View (compact: just the two toggle buttons) or as a modal (full card layout) when triggered by Deep Dive.

frontend/src/components/GraphCanvas.tsx
Used only in Phase 2. Full-screen React Flow canvas.
Setup:
Define nodeTypes as a stable object reference outside the component: const nodeTypes = { phase2Node: Phase2Node, grayedNode: GrayedNode }.
Convert session.nodes to React Flow nodes and session.edges to React Flow edges on each render (use useMemo).
Apply dagre layout whenever session.edges or Object.keys(session.nodes) changes (see layout section below).
Enable: pan, zoom, minimap, fitView on initial load.
Dagre layout:
import dagre from 'dagre'

function getLayoutedElements(nodes: RFNode[], edges: RFEdge[], nodeWidth = 280, nodeHeight = 140) {
const g = new dagre.graphlib.Graph()
g.setDefaultEdgeLabel(() => ({}))
g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 })

nodes.forEach(n => g.setNode(n.id, { width: nodeWidth, height: nodeHeight }))
edges.forEach(e => g.setEdge(e.source, e.target))
dagre.layout(g)

return nodes.map(n => {
const { x, y } = g.node(n.id)
return { ...n, position: { x: x - nodeWidth / 2, y: y - nodeHeight / 2 } }
})
}

Node conversion:
const rfNodes = Object.values(session.nodes).map(node => ({
id: node.id,
type: node.node_state === 'grayed' ? 'grayedNode' : 'phase2Node',
position: { x: 0, y: 0 }, // overwritten by dagre
data: { node },
}))

const rfEdges = session.edges.map(e => ({
id: e.id,
source: e.from,
target: e.to,
label: e.label ?? undefined,
style: { strokeWidth: 1, stroke: '#94a3b8' },
}))

frontend/src/components/Phase2Node.tsx
Custom React Flow node for node_state === "expanded" or "learned".
Layout (top to bottom inside a card):
Header row: node label (bold, 15px) + intuition score badge on the right.
Badge: 0.0–0.35 = "conceptual" with blue background, 0.35–0.65 = "mixed" with gray, 0.65–1.0 = "technical" with amber.
Description: 2 sentences in 13px muted text.
Resource block (if node.resource):
Resource title as an external link (opens new tab)
Resource description in small gray text below the link
Action row:
If node_state === "expanded": show "Mark as Learned" button + chat icon button.
If node_state === "learned": show a green checkmark and "Learned" text. No buttons except chat icon.
Shimmer state: if streamingNodeIds.has(node.id), show a pulsing skeleton over the resource block area.
On "Mark as Learned": store.markLearned(node.id). On chat icon: store.openChat(node.id).
Invisible React Flow handles: <Handle type="target" position={Position.Top} style={{ opacity: 0 }} /> and <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />.
Min-width: 260px. Max-width: 300px.

frontend/src/components/GrayedNode.tsx
Custom React Flow node for node_state === "grayed".
Appearance: lower opacity (0.5), dashed border, slightly smaller card (min-width 220px).
If node.explain_more_text === "**known**": show a small checkmark icon overlay in the corner and a "Already learned" label. No action buttons.
Otherwise:
Node label (bold)
node.description (the hint text, 1 sentence) in small muted text
If node.explain_more_text is set (and not "**known**"): show the explanation text in an expandable panel below the hint.
Action buttons:
"Explain more" — calls store.explainNode(node.id). While loading, shows a spinner on this button.
"Don't know" — calls store.expandNode(node.id). This is the button that fully generates the node.
Invisible handles same as Phase2Node.

frontend/src/components/NodeChatPanel.tsx
A right-side panel, width 360px. Rendered in App.tsx as a sibling to <GraphCanvas />, positioned with CSS to overlay on the right side.
Structure:
Header: node label + close button (store.closeChat()).
Scrollable message list: user messages right-aligned (light background), assistant messages left-aligned (white card). Auto-scroll to bottom on new content.
Input area: text input + send button.
On send:
Show user message immediately in the list.
Add an empty assistant message bubble with a cursor/spinner.
Open SSE stream via streamSSE to POST /api/session/{id}/node/{nodeId}/chat with { message }.
For each token event: append data.text to the assistant message bubble content.
On stream_done: finalize. The store's session will be updated server-side; refetch the session or update node.chat_history locally from the collected response.
Chat history from node.chat_history is pre-populated in the message list when the panel opens.

API Reference
Method
Path
Body
Description
POST
/api/session
{topic}
Create session + Phase 1 children
GET
/api/session/{id}
—
Load full session
GET
/api/sessions
—
List all sessions
POST
/api/session/{id}/select-topic
{node_id}
Select subtopic, generate its children
POST
/api/session/{id}/back
—
Pop selection stack
POST
/api/session/{id}/resolution
{resolution}
Set resolution preference
POST
/api/session/{id}/deep-dive
{node_id}
Transition to Phase 2
POST
/api/session/{id}/node/{node_id}/expand
—
Expand node into full resource + prereqs (SSE)
POST
/api/session/{id}/node/{node_id}/explain
—
Get "explain more" text for a grayed node
DELETE
/api/session/{id}/node/{node_id}
—
Delete node + subtree
PATCH
/api/session/{id}/node/{node_id}/status
{node_state}
Mark learned or un-mark
POST
/api/session/{id}/node/{node_id}/chat
{message}
Node chat (SSE)

SSE Event Reference
Expand endpoint events
Event
Data
node_updated
{ resource: Resource, intuition_score: number } — applied to the node being expanded
node_added
Full GraphNode object — a new grayed prerequisite
edge_added
Full GraphEdge object
stream_done
{}
stream_error
{ message: string }

Chat endpoint events
Event
Data
token
{ text: string }
stream_done
{}
stream_error
{ message: string }

Startup
Backend:
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
echo "ALPHAG3N_USE_OPENAI=true" > .env
uvicorn app.main:app --reload --port 8000

Frontend:
cd frontend
npm install
npm run dev

Frontend: http://localhost:5173. Backend: http://localhost:8000.

Critical Implementation Notes
from keyword conflict: GraphEdge uses from_id in Python with Field(alias="from"). Always serialize with by_alias=True or model_dump_json(by_alias=True). The frontend receives "from" in JSON and uses it as such in the GraphEdge TypeScript type.

client.responses.create for all AI calls: Use the Responses API, not Chat Completions. This is required for web_search_preview and is used consistently for simplicity. The web search tool is added only to the expand_phase2_node call; all other calls omit tools.

Phase 2 node begins as grayed: When the goal node transitions to Phase 2 via deep-dive, it exists in the session as an expanded Phase 1 node. The first expandNode call on it upgrades it with a resource. All newly detected prerequisites are created as grayed. The frontend should call store.expandNode(focus_node_id) immediately after store.deepDive() resolves.

Dagre re-runs on edge changes: The dagre layout must re-run whenever session.edges changes, not only when nodes are added. Edges determine rank positions in the top-down layout.

nodeTypes must be a stable reference: Define const nodeTypes = { phase2Node: Phase2Node, grayedNode: GrayedNode } outside the GraphCanvas component body. If defined inline, React Flow will remount all custom nodes on every render.

"**known**" sentinel: When markLearned causes deduplication, the backend and frontend use explain_more_text = "**known**" as a sentinel to distinguish "this was grayed out by deduplication" from "this was grayed out because it's an unexpanded prerequisite." GrayedNode checks for this sentinel and renders a different UI.

Phase 1 does not use React Flow: Phase1View is a plain React component with card lists. Only Phase 2 uses React Flow. Attempting to use React Flow for Phase 1 will produce a confusing UX — it is intentionally a sequential selection UI, not a graph explorer.

Session file is authoritative: The in-memory Zustand store is derived from the backend session. On any SSE event that mutates the graph, the backend saves the session file before forwarding the event. If the app is refreshed, the session loads cleanly from disk.

sessions/ must exist: ensure_sessions_dir() is called in main.py before the app starts. Do not assume the directory exists. On a fresh clone, no sessions/ directory will exist.

OpenAI response parsing: The Responses API with web_search_preview may include tool_use blocks interleaved with text. Extract only text content blocks when building the full response string: response.output is a list — filter for items where type == "text" and join their text fields.
