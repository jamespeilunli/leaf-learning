# Learning Roadmap App — Implementation Document

Read DESIGN.md first. This document specifies every file, API contract, data structure, and behavior. It is written for a coding agent with no prior context.

---

## Repository Layout (Target State)

```
./
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── storage.py
│   │   ├── ai.py
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── session.py
│   │       ├── graph.py
│   │       └── chat.py
│   ├── sessions/               ← gitignored, created at runtime
│   ├── .env                    ← gitignored, contains OPENAI_API_KEY
│   ├── requirements.txt
│   └── README.md
├── frontend/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── StartScreen.tsx
│   │   │   ├── Phase1View.tsx
│   │   │   ├── Phase1OptionCard.tsx
│   │   │   ├── GraphCanvas.tsx
│   │   │   ├── Phase2Node.tsx
│   │   │   ├── GrayedNode.tsx
│   │   │   ├── NodeChatPanel.tsx
│   │   │   ├── ResolutionPicker.tsx
│   │   │   └── DeepDiveButton.tsx
│   │   ├── store/
│   │   │   └── useSessionStore.ts
│   │   ├── hooks/
│   │   │   └── useSSE.ts
│   │   ├── lib/
│   │   │   └── api.ts
│   │   ├── types.ts
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   └── eslint.config.js
└── README.md
```

---

## Backend

### `backend/requirements.txt`

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
openai>=1.30.0
pydantic>=2.7.0
python-dotenv>=1.0.0
sse-starlette>=1.8.0
```

### Environment

One required environment variable: `OPENAI_API_KEY`. Loaded via `python-dotenv` from `backend/.env` at startup. No other configuration.

---

### `backend/app/models.py`

```python
from __future__ import annotations
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
    description: str  # 1–2 sentences on what this resource covers


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: str = Field(default_factory=now_iso)


class GraphNode(BaseModel):
    id: str = Field(default_factory=new_id)
    label: str
    description: str | None = None
    why_interesting: str | None = None   # Phase 1 only
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
    selection_history: list[str] = Field(default_factory=list)  # stack of node IDs
    current_phase1_node_id: str | None = None
    focus_node_id: str | None = None
    known_topics: list[str] = Field(default_factory=list)
    nodes: dict[str, GraphNode] = Field(default_factory=dict)
    edges: list[GraphEdge] = Field(default_factory=list)
```

**Important:** `GraphEdge` uses `from_id` as the Python attribute and `"from"` as the JSON key via alias. Always serialize edges with `by_alias=True`.

---

### `backend/app/storage.py`

```python
from pathlib import Path
from fastapi import HTTPException
from app.models import Session

SESSIONS_DIR = Path(__file__).parent.parent / "sessions"


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
    for f in SESSIONS_DIR.glob("*.json"):
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
```

---

### `backend/app/ai.py`

All OpenAI calls live here. Use `AsyncOpenAI()` at module level (reads `OPENAI_API_KEY` from environment). All functions that produce graph events are async generators yielding dicts. The routers convert these dicts to SSE format.

Use `client.responses.create(...)` for all calls (Responses API, not Chat Completions). This is required for `web_search_preview` support and is used consistently for all calls.

The model for all calls is `"gpt-4o"`.

---

#### `generate_phase1_children(current_label: str, ancestor_labels: list[str]) -> AsyncGenerator[dict, None]`

No tools. System prompt instructs the model to return only a JSON object, no prose, no fences:

```
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
```

Parse the response JSON. For each node in the response, create a `GraphNode` with `phase="1"`, `node_state="expanded"`, and yield:
```python
{"event": "node_added", "data": node.model_dump(by_alias=True)}
```

Then yield `{"event": "stream_done", "data": {}}`.

On any exception, yield `{"event": "stream_error", "data": {"message": str(e)}}`.

---

#### `expand_phase2_node(node_label: str, resolution: str, known_topics: list[str], goal_label: str) -> AsyncGenerator[dict, None]`

Uses `web_search_preview` tool:
```python
tools=[{"type": "web_search_preview"}]
```

System prompt:
```
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
```

Parse the response. Yield:
1. `{"event": "node_updated", "data": {"resource": resource_dict, "intuition_score": float}}` — updates the current node with its resource and score.
2. For each prerequisite: create a `GraphNode` with `phase="2"`, `node_state="grayed"`, `description=hint`. Yield `{"event": "node_added", "data": node_dict}`.
3. For each prerequisite node: create a `GraphEdge` from the current node to the prerequisite. Yield `{"event": "edge_added", "data": edge_dict}`.
4. `{"event": "stream_done", "data": {}}`.

---

#### `explain_prerequisite(node_label: str, parent_label: str, parent_description: str, resolution: str) -> str`

Not a generator. Returns a plain string. No tools.

System prompt:
```
You are a tutor explaining prerequisite concepts.
The user is studying "{parent_label}" ({parent_description}).
They encountered a prerequisite called "{node_label}" and want to understand what it is
before deciding whether they already know it.
Explain what "{node_label}" is and why it appears as a prerequisite for understanding
"{parent_label}". Use a {resolution} explanation style.
Write 3 to 5 sentences. Do not assume they know the term — explain it plainly.
```

Call `client.responses.create(...)` without streaming, return `response.output_text`.

---

#### `chat_with_node(node_label: str, node_description: str, resource_description: str, resolution: str, goal_path: list[str], history: list[ChatMessage], user_message: str) -> AsyncGenerator[str, None]`

Streaming. No tools.

System prompt:
```
You are a focused tutor helping the user understand "{node_label}".
Their overall learning goal is: {goal_path[0]}
They reached this topic via: {" → ".join(goal_path)}
Their preferred depth: {resolution} (intuitive = conceptual, technical = formal/precise)
About this topic: {node_description}
The primary resource covers: {resource_description}

Answer questions about this specific topic at the {resolution} level.
Be concise. Stay on topic.
```

Messages array: history as role/content pairs, then append `{"role": "user", "content": user_message}`.

Use `stream=True`. Yield each text chunk as a plain string as it arrives. The router wraps chunks in SSE format.

Trim history to the last 20 messages before building the messages array if it exceeds that length.

---

### `backend/app/routers/session.py`

All routes registered on a `router = APIRouter()`. Prefix `/api` is added in `main.py`.

---

#### `POST /session`

Request body: `{ "topic": string }`

This is a non-streaming endpoint. It awaits the full AI response before returning.

1. Create a root `GraphNode`: `phase="1"`, `node_state="expanded"`, `label=topic`, `description="Starting topic"`, `depth=0`.
2. Create a `Session` with `root_topic=topic`, `current_phase1_node_id=root_node.id`, `nodes={root_node.id: root_node}`.
3. Save to disk.
4. Collect all events from `generate_phase1_children(topic, [])`:
   - For each `node_added` event: create a `GraphNode` from the data, set `parent_id=root_node.id`, `depth=1`. Add to `session.nodes`. Add the node's id to `root_node.child_ids`.
   - For each edge event: skip (edges between Phase 1 children and root are implicitly tracked via `parent_id` / `child_ids`).
5. Save session again.
6. Return `{"session_id": session.id, "session": session.model_dump(by_alias=True)}`.

---

#### `GET /session/{session_id}`

Load and return the full session as JSON.

---

#### `GET /sessions`

Return `list_sessions()`.

---

#### `POST /session/{session_id}/select-topic`

Request body: `{ "node_id": string }`

Phase 1 topic selection. The user has chosen a subtopic to drill into.

1. Load session.
2. Push `session.current_phase1_node_id` onto `session.selection_history`.
3. Set `session.current_phase1_node_id = node_id`.
4. Get the selected node's label and build `ancestor_labels` by walking up the `parent_id` chain, collecting labels from root to current (most general first).
5. Collect all events from `generate_phase1_children(selected_node.label, ancestor_labels)`.
6. For each `node_added`: create node with `parent_id=node_id`, `depth=selected_node.depth+1`, add to session.nodes, add to selected_node.child_ids.
7. Save session.
8. Return updated session.

This is non-streaming. Await the full AI call before returning.

---

#### `POST /session/{session_id}/back`

No request body.

Phase 1 backtrack. Pops one level from the selection history.

1. Load session.
2. If `selection_history` is empty: return 400 "Already at root."
3. Pop the last ID from `selection_history`. Set `current_phase1_node_id` to that popped ID.
4. Save and return updated session.

Note: this does not delete the child nodes that were generated — they remain in `session.nodes` so re-selecting the same path doesn't regenerate. The frontend simply re-renders the children of the restored current node.

---

#### `POST /session/{session_id}/resolution`

Request body: `{ "resolution": "intuitive" | "technical" }`

Update `session.resolution`, save, return updated session.

---

#### `POST /session/{session_id}/deep-dive`

Request body: `{ "node_id": string }`

1. Load session.
2. Set `session.focus_node_id = node_id`.
3. Set `session.phase = "2"`.
4. The focus node's `node_state` remains `"expanded"` but its Phase 2 resource has not been fetched yet — that happens via the expand endpoint.
5. Save and return `{"session": session.model_dump(by_alias=True)}`.

---

### `backend/app/routers/graph.py`

---

#### `POST /session/{session_id}/node/{node_id}/expand` — SSE

Returns `text/event-stream`.

Handles both Phase 1 (if somehow called) and Phase 2 expansion. In practice this endpoint is used for Phase 2 — expanding a grayed node into a fully expanded node with resources and new grayed prerequisites.

1. Load session.
2. Find the node. It must exist and have `node_state="grayed"` (or be the focus node on first Phase 2 expansion).
3. Set the node's `node_state = "expanded"` in memory (the resource will arrive via `node_updated`).
4. Build `goal_label` = label of `session.nodes[session.focus_node_id]`.
5. Build `ancestor_labels` = walk parent_id chain upward, collect labels.
6. Stream events from `expand_phase2_node(node.label, session.resolution, session.known_topics, goal_label)`:
   - `node_updated`: apply `resource` and `intuition_score` to the current node in session. Save session. Forward event.
   - `node_added`: create new `GraphNode` from data, set `parent_id=node_id`, `depth=node.depth+1`, `node_state="grayed"`. Add to session.nodes. Add to node.child_ids. Save session. Forward event.
   - `edge_added`: add edge to session.edges. Save session. Forward event.
   - `stream_done`: save session. Forward event. Close stream.
   - `stream_error`: save session. Forward event. Close stream.

SSE format for each event:
```
event: {event_name}\ndata: {json_string}\n\n
```

---

#### `POST /session/{session_id}/node/{node_id}/explain` — regular POST

Request body: none.

Calls `explain_prerequisite(...)` for a grayed node.

1. Load session. Find node (must be `node_state="grayed"`).
2. Find parent node via `node.parent_id`.
3. Call `explain_prerequisite(node.label, parent.label, parent.description or "", session.resolution)`.
4. Store result in `node.explain_more_text`.
5. Save session.
6. Return `{"explain_more_text": text}`.

---

#### `DELETE /session/{session_id}/node/{node_id}`

Recursively remove a node and all its descendants.

1. Load session.
2. Collect the node and all descendants by recursively following `child_ids`.
3. Remove all collected IDs from `session.nodes`.
4. Remove all edges where `from_id` or `to_id` is in the collected set.
5. Remove `node_id` from its parent's `child_ids` (if parent exists).
6. Save session.
7. Return `{"removed_node_ids": list_of_ids}`.

---

#### `PATCH /session/{session_id}/node/{node_id}/status`

Request body: `{ "node_state": "learned" | "grayed" }`

Only `"learned"` and `"grayed"` are valid targets via this endpoint (clients use it to mark learned or to un-mark).

1. Load session. Find node.
2. Set `node.node_state = node_state`.
3. If `node_state == "learned"`:
   - Normalize `node.label`: `node.label.lower().strip()`.
   - Append to `session.known_topics` if not already present.
   - Scan all nodes: any node whose normalized label matches and whose `node_state == "grayed"` gets a special `explain_more_text` set to `"__known__"` (sentinel value the frontend uses to render the "already learned" overlay). Do not change their `node_state` — they remain grayed.
4. Save session. Return updated session.

---

### `backend/app/routers/chat.py`

---

#### `POST /session/{session_id}/node/{node_id}/chat` — SSE

Request body: `{ "message": string }`

1. Load session. Find node (must be `node_state="expanded"`).
2. Build `goal_path`: walk from `session.focus_node_id` to this node via parent_id chain, collecting labels. If path-building fails, fall back to `[session.root_topic, node.label]`.
3. Get `resource_description` = `node.resource.description if node.resource else ""`.
4. Get `node_description` = `node.description or ""`.
5. Stream from `chat_with_node(...)` with trimmed history and the new message.
6. Collect all streamed chunks into `full_response`.
7. After stream ends, append both messages to `node.chat_history`. Trim to last 20 if over limit. Save session.
8. Stream each chunk as:
   ```
   event: token\ndata: {"text": "chunk_text"}\n\n
   ```
   End with:
   ```
   event: stream_done\ndata: {}\n\n
   ```

---

### `backend/app/main.py`

```python
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
```

Run: `uvicorn app.main:app --reload --port 8000` from the `backend/` directory.

---

## Frontend

### Package additions to `frontend/package.json`

```json
"dependencies": {
  "reactflow": "^11.11.0",
  "zustand": "^4.5.2",
  "dagre": "^0.8.5",
  "@tanstack/react-query": "^5.40.0",
  "axios": "^1.7.2",
  "clsx": "^2.1.1"
}
```

Tailwind CSS, TypeScript, and Vite are assumed already configured.

---

### `frontend/src/types.ts`

```typescript
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
```

---

### `frontend/src/lib/api.ts`

Base URL: `http://localhost:8000/api`. All functions use axios. All responses are typed.

```typescript
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
```

SSE endpoints (expand and chat) are called via the `streamSSE` utility, not axios.

---

### SSE via fetch — shared utility in `frontend/src/hooks/useSSE.ts`

All SSE endpoints in this app require POST bodies, so `EventSource` cannot be used. Implement a single async generator that handles the SSE wire format over a fetch response body.

```typescript
export async function* streamSSE(
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
```

---

### `frontend/src/store/useSessionStore.ts`

Zustand store. Single source of truth for all session state. All server mutations go through store actions, which update local state optimistically and save to backend.

```typescript
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
  _applyNodeAdded: (node: GraphNode) => void
  _applyNodeUpdated: (patch: { id?: string; resource?: Resource; intuition_score?: number }) => void
  _applyEdgeAdded: (edge: GraphEdge) => void
}
```

Key implementation notes:

**`initSession`**: calls `api.createSession`, stores session_id in `localStorage` under key `"roadmap_session_id"`, sets `session` and `sessionId` in store.

**`loadSession`**: calls `api.getSession`, sets store. On 404, clears localStorage.

**`selectTopic`**: calls `api.selectTopic`. The response is the full updated session — replace `store.session` entirely. The backend has already generated and stored the children; they are in the returned session's `nodes` map.

**`expandNode`**: 
1. Add `nodeId` to `streamingNodeIds`.
2. Open SSE stream via `streamSSE` to `POST /api/session/{id}/node/{nodeId}/expand`.
3. Handle events:
   - `node_updated`: find the node in `session.nodes`, apply `resource` and `intuition_score`.
   - `node_added`: add the new grayed node to `session.nodes`. Also add its id to the parent node's `child_ids`.
   - `edge_added`: add the edge to `session.edges`.
   - `stream_done`: remove `nodeId` from `streamingNodeIds`.
   - `stream_error`: remove from `streamingNodeIds`, set `error`.
4. Each event should trigger a Zustand state update so React re-renders incrementally.

**`explainNode`**: calls `api.explainNode`. On success, set `node.explain_more_text` in the store.

**`markLearned`**:
1. Optimistically set `node.node_state = "learned"` and add normalized label to `session.known_topics`.
2. Scan all nodes: any grayed node whose normalized label is in `known_topics` and whose `explain_more_text !== "__known__"` — set `explain_more_text = "__known__"` locally.
3. Call `api.updateNodeState(sessionId, nodeId, "learned")` in background. Replace session with response.

**`deleteNode`**: calls `api.deleteNode`. Remove `removed_node_ids` from `session.nodes`. Remove associated edges.

---

### `frontend/src/App.tsx`

Mount behavior:
1. Read `localStorage.getItem("roadmap_session_id")`.
2. If present, call `store.loadSession(id)`. Catch 404 and clear localStorage.
3. Render based on `store.session`:
   - `null` or loading: `<StartScreen />`
   - `session.phase === "1"`: `<Phase1View />`
   - `session.phase === "2"`: full-screen `<GraphCanvas />` with `<NodeChatPanel />` drawer if `chatOpenNodeId` is set

---

### `frontend/src/components/StartScreen.tsx`

Centered layout.

- Large text input labeled "What do you want to learn?"
- Submit button. On submit: `store.initSession(topic)`. Show loading state with text "Exploring [topic]...".
- Below the input, if `listSessions()` returns results, show a "Continue a previous session" section with clickable rows (root_topic + date). Clicking calls `store.loadSession(id)`.

---

### `frontend/src/components/Phase1View.tsx`

This is NOT a graph. It is a vertical card-selection interface. Do not use React Flow here.

Layout:
- Top: breadcrumb showing the selection path. Each crumb is clickable and calls `store.back()` repeatedly until that ancestor is the current node. (Simplification: call back once per click on the crumb, or implement a `backTo(nodeId)` that pops until correct.)
- Middle: large card for the current node. Shows label, description, and a "Deep Dive" button if the topic is specific enough.
- Below the current node card: a row or grid of option cards, one per child node of the current node. Each is a `<Phase1OptionCard />`.
- Bottom persistent bar: `<ResolutionPicker />` (compact inline version).

When `store.isLoading` is true (after selecting a topic, while waiting for children to generate), show a skeleton/shimmer in the option card area.

---

### `frontend/src/components/Phase1OptionCard.tsx`

Receives `node: GraphNode`.

Displays:
- Label (bold)
- `why_interesting` in small muted text
- Description text
- Resource links if any (small external links)

On click: calls `store.selectTopic(node.id)`.

Hover state: slightly elevated border.

---

### `frontend/src/components/DeepDiveButton.tsx`

Rendered inside `Phase1View` on the current node card.

- Label: "Deep Dive →"
- On click:
  1. If `session.resolution === null`: open `<ResolutionPicker />` as a modal/overlay. Wait for selection.
  2. Call `store.deepDive(currentNode.id)`.
  3. Immediately call `store.expandNode(currentNode.id)` to kick off Phase 2 generation for the goal node.

---

### `frontend/src/components/ResolutionPicker.tsx`

Two large clickable cards:

**Intuitive**
- Subtitle: "Concepts, metaphors, the why"
- Example: "I want to know that exp curves a function onto a rotational manifold"

**Technical**
- Subtitle: "Formal definitions, the how"
- Example: "I want to derive exp from x' = Ax → x = e^(At)"

On selection: calls `store.setResolution(r)`. The selected card gets a highlighted border.

Can be rendered as a bottom bar in Phase1View (compact: just the two toggle buttons) or as a modal (full card layout) when triggered by Deep Dive.

---

### `frontend/src/components/GraphCanvas.tsx`

Used only in Phase 2. Full-screen React Flow canvas.

**Setup:**
- Define `nodeTypes` as a stable object reference outside the component: `const nodeTypes = { phase2Node: Phase2Node, grayedNode: GrayedNode }`.
- Convert `session.nodes` to React Flow nodes and `session.edges` to React Flow edges on each render (use `useMemo`).
- Apply dagre layout whenever `session.edges` or `Object.keys(session.nodes)` changes (see layout section below).
- Enable: pan, zoom, minimap, `fitView` on initial load.

**Dagre layout:**
```typescript
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
```

**Node conversion:**
```typescript
const rfNodes = Object.values(session.nodes).map(node => ({
  id: node.id,
  type: node.node_state === 'grayed' ? 'grayedNode' : 'phase2Node',
  position: { x: 0, y: 0 },  // overwritten by dagre
  data: { node },
}))

const rfEdges = session.edges.map(e => ({
  id: e.id,
  source: e.from,
  target: e.to,
  label: e.label ?? undefined,
  style: { strokeWidth: 1, stroke: '#94a3b8' },
}))
```

---

### `frontend/src/components/Phase2Node.tsx`

Custom React Flow node for `node_state === "expanded"` or `"learned"`.

Layout (top to bottom inside a card):
- **Header row**: node label (bold, 15px) + intuition score badge on the right.
  - Badge: 0.0–0.35 = "conceptual" with blue background, 0.35–0.65 = "mixed" with gray, 0.65–1.0 = "technical" with amber.
- **Description**: 2 sentences in 13px muted text.
- **Resource block** (if `node.resource`):
  - Resource title as an external link (opens new tab)
  - Resource description in small gray text below the link
- **Action row**:
  - If `node_state === "expanded"`: show "Mark as Learned" button + chat icon button.
  - If `node_state === "learned"`: show a green checkmark and "Learned" text. No buttons except chat icon.
- **Shimmer state**: if `streamingNodeIds.has(node.id)`, show a pulsing skeleton over the resource block area.

On "Mark as Learned": `store.markLearned(node.id)`.
On chat icon: `store.openChat(node.id)`.

Invisible React Flow handles: `<Handle type="target" position={Position.Top} style={{ opacity: 0 }} />` and `<Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />`.

Min-width: 260px. Max-width: 300px.

---

### `frontend/src/components/GrayedNode.tsx`

Custom React Flow node for `node_state === "grayed"`.

Appearance: lower opacity (0.5), dashed border, slightly smaller card (min-width 220px).

If `node.explain_more_text === "__known__"`: show a small checkmark icon overlay in the corner and a "Already learned" label. No action buttons.

Otherwise:
- Node label (bold)
- `node.description` (the hint text, 1 sentence) in small muted text
- If `node.explain_more_text` is set (and not `"__known__"`): show the explanation text in an expandable panel below the hint.
- Action buttons:
  - "Explain more" — calls `store.explainNode(node.id)`. While loading, shows a spinner on this button.
  - "Don't know" — calls `store.expandNode(node.id)`. This is the button that fully generates the node.

Invisible handles same as Phase2Node.

---

### `frontend/src/components/NodeChatPanel.tsx`

A right-side panel, width 360px. Rendered in `App.tsx` as a sibling to `<GraphCanvas />`, positioned with CSS to overlay on the right side.

Structure:
- Header: node label + close button (`store.closeChat()`).
- Scrollable message list: user messages right-aligned (light background), assistant messages left-aligned (white card). Auto-scroll to bottom on new content.
- Input area: text input + send button.

On send:
1. Show user message immediately in the list.
2. Add an empty assistant message bubble with a cursor/spinner.
3. Open SSE stream via `streamSSE` to `POST /api/session/{id}/node/{nodeId}/chat` with `{ message }`.
4. For each `token` event: append `data.text` to the assistant message bubble content.
5. On `stream_done`: finalize. The store's session will be updated server-side; refetch the session or update `node.chat_history` locally from the collected response.

Chat history from `node.chat_history` is pre-populated in the message list when the panel opens.

---

## API Reference

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/session` | `{topic}` | Create session + Phase 1 children |
| GET | `/api/session/{id}` | — | Load full session |
| GET | `/api/sessions` | — | List all sessions |
| POST | `/api/session/{id}/select-topic` | `{node_id}` | Select subtopic, generate its children |
| POST | `/api/session/{id}/back` | — | Pop selection stack |
| POST | `/api/session/{id}/resolution` | `{resolution}` | Set resolution preference |
| POST | `/api/session/{id}/deep-dive` | `{node_id}` | Transition to Phase 2 |
| POST | `/api/session/{id}/node/{node_id}/expand` | — | Expand node into full resource + prereqs (SSE) |
| POST | `/api/session/{id}/node/{node_id}/explain` | — | Get "explain more" text for a grayed node |
| DELETE | `/api/session/{id}/node/{node_id}` | — | Delete node + subtree |
| PATCH | `/api/session/{id}/node/{node_id}/status` | `{node_state}` | Mark learned or un-mark |
| POST | `/api/session/{id}/node/{node_id}/chat` | `{message}` | Node chat (SSE) |

---

## SSE Event Reference

### Expand endpoint events

| Event | Data |
|-------|------|
| `node_updated` | `{ resource: Resource, intuition_score: number }` — applied to the node being expanded |
| `node_added` | Full `GraphNode` object — a new grayed prerequisite |
| `edge_added` | Full `GraphEdge` object |
| `stream_done` | `{}` |
| `stream_error` | `{ message: string }` |

### Chat endpoint events

| Event | Data |
|-------|------|
| `token` | `{ text: string }` |
| `stream_done` | `{}` |
| `stream_error` | `{ message: string }` |

---

## Startup

**Backend:**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
echo "OPENAI_API_KEY=sk-..." > .env
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`. Backend: `http://localhost:8000`.

---

## Critical Implementation Notes

1. **`from` keyword conflict**: `GraphEdge` uses `from_id` in Python with `Field(alias="from")`. Always serialize with `by_alias=True` or `model_dump_json(by_alias=True)`. The frontend receives `"from"` in JSON and uses it as such in the `GraphEdge` TypeScript type.

2. **`client.responses.create` for all AI calls**: Use the Responses API, not Chat Completions. This is required for `web_search_preview` and is used consistently for simplicity. The web search tool is added only to the `expand_phase2_node` call; all other calls omit `tools`.

3. **Phase 2 node begins as grayed**: When the goal node transitions to Phase 2 via deep-dive, it exists in the session as an expanded Phase 1 node. The first `expandNode` call on it upgrades it with a resource. All newly detected prerequisites are created as grayed. The frontend should call `store.expandNode(focus_node_id)` immediately after `store.deepDive()` resolves.

4. **Dagre re-runs on edge changes**: The dagre layout must re-run whenever `session.edges` changes, not only when nodes are added. Edges determine rank positions in the top-down layout.

5. **`nodeTypes` must be a stable reference**: Define `const nodeTypes = { phase2Node: Phase2Node, grayedNode: GrayedNode }` outside the `GraphCanvas` component body. If defined inline, React Flow will remount all custom nodes on every render.

6. **`"__known__"` sentinel**: When `markLearned` causes deduplication, the backend and frontend use `explain_more_text = "__known__"` as a sentinel to distinguish "this was grayed out by deduplication" from "this was grayed out because it's an unexpanded prerequisite." `GrayedNode` checks for this sentinel and renders a different UI.

7. **Phase 1 does not use React Flow**: Phase1View is a plain React component with card lists. Only Phase 2 uses React Flow. Attempting to use React Flow for Phase 1 will produce a confusing UX — it is intentionally a sequential selection UI, not a graph explorer.

8. **Session file is authoritative**: The in-memory Zustand store is derived from the backend session. On any SSE event that mutates the graph, the backend saves the session file before forwarding the event. If the app is refreshed, the session loads cleanly from disk.

9. **`sessions/` must exist**: `ensure_sessions_dir()` is called in `main.py` before the app starts. Do not assume the directory exists. On a fresh clone, no `sessions/` directory will exist.

10. **OpenAI response parsing**: The Responses API with `web_search_preview` may include tool_use blocks interleaved with text. Extract only text content blocks when building the full response string: `response.output` is a list — filter for items where `type == "text"` and join their `text` fields.
