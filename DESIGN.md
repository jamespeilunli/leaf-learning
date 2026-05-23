# Learning Roadmap App — Design Document

## Problem Statement

When you start learning something new, you don't know what you don't know. You can't search for what you haven't heard of. You don't know where to start, and you don't know where your starting point leads. This app solves two sequential problems:

1. **Phase 1 — What do I actually want to learn?** You have a vague interest. The app helps you narrow it to a specific, committed goal through a guided selection drill.
2. **Phase 2 — How do I get there, and what do I need first?** Given a specific goal, the app generates a prerequisite roadmap with curated resources. As you examine each resource, the app surfaces what that resource assumes you already know — as grayed-out nodes. You decide which gaps to expand and which to dismiss.

---

## Phase 1 — Topic Narrowing

### Entry

The user is shown a single prompt: "What do you want to learn?" They type anything — a concept, a field, a question. This is the seed.

### The Narrowing Loop

The app generates a tree rooted at the seed topic, with 4–6 subtopic children. The user receives a notification that the tree has been updated and is invited to examine the options.

The user selects one subtopic. That subtopic becomes the new root. A new set of children is generated for it. The previous tree is still accessible for backtracking — the user can step back up the selection history at any time.

This loop repeats: select a subtopic, re-root, generate children, repeat. Each iteration drills one level deeper in specificity. The user continues until they reach a topic specific enough to commit to learning seriously.

When ready, the user presses **Deep Dive** on the current root node. This ends Phase 1 and begins Phase 2 with that node as the learning goal.

### Resolution Selection

At some point before or during Phase 1 (exact placement is flexible — a sensible default is to prompt for it when Deep Dive is pressed), the user chooses their preferred depth:

- **Intuitive** — conceptual understanding, metaphors, the "why." Example: understanding that `exp` curves a function onto a rotational manifold, without working through the equations.
- **Technical** — formal definitions, derivations, the "how." Example: understanding `exp` as arising from `x' = Ax`, so the solution must be `e^(At)`.

This preference is stored and passed to every AI call in Phase 2. It affects resource selection, how prerequisites are framed, and the tone of inline chat responses.

### Backtracking

The selection history is maintained as a stack. A "back" button steps the user up one level, restoring the previous root and its children. The user can navigate this history freely before pressing Deep Dive.

---

## Phase 2 — Prerequisite Roadmap

### Initial Generation

Phase 2 begins with the chosen goal node at the top of a tree. The AI searches for the best resource explaining this topic at the user's resolution level, reads it, and generates a fully expanded node: a resource link, a description of what the resource covers, an intuition score, and a set of grayed-out prerequisite nodes representing topics the resource assumes the reader knows.

### Node States

Every node in Phase 2 is in one of three states:

**Fully expanded** — the node has been generated. It shows:
- A title and 2-sentence description of the topic
- A link to a curated resource that genuinely explains the topic (not an introduction)
- A brief description of what the resource covers, so the user can judge its relevance without clicking
- An intuition score (0 = purely conceptual, 1 = highly technical) as a visible badge, letting the user decide whether to engage deeply or accept the concept at face value
- An inline chat toggle (see below)
- A "Learned" button

**Grayed-out** — the node exists as a named prerequisite detected from a parent node's resource, but has not been expanded yet. It shows only a title and a one-sentence hint about what it represents. The user has two options:
- **"Explain more"** — triggers an AI explanation of what this prerequisite actually is, in plain language, so the user can self-assess whether they know it. This does not expand the node — it just helps the user decide.
- **"Don't know"** — fully expands the node: finds a resource, generates a description, scores it, and creates its own set of grayed-out prerequisite children.

Silently ignoring a grayed-out node (not acting on it) is the implicit "I know this" action. Grayed nodes that are never expanded are treated as known.

**Learned** — the user has pressed "Learned" on a fully expanded node. The node gets a checkmark. Its normalized label is added to the session's `known_topics` set. Any other node in the tree whose label matches a known topic is automatically grayed out further (visually distinct from a regular grayed-out prerequisite — use a checkmark or strikethrough to differentiate). Future AI calls will not suggest topics in `known_topics` as prerequisites.

### Prerequisite Detection

Every time a node is fully expanded, the AI reads the resource and identifies topics that are directly used or assumed in it — not general background knowledge, but things that would block understanding if missing. Each of these becomes a grayed-out child node.

The AI is given the current `known_topics` list and must not surface topics the user has already marked as learned.

### Deduplication

When a node is marked Learned, the app scans the entire tree for other nodes with matching normalized labels (case-insensitive, whitespace-normalized). Any matches that are currently grayed-out are marked as implicitly known and receive a distinct visual treatment (e.g., a small checkmark overlay on the grayed node). Any matches that are fully expanded but not yet learned are highlighted as "you already learned this elsewhere."

### "Explain More" Flow

When the user presses "Explain more" on a grayed node, the app calls the AI with the node's label, its parent node's topic context, and the user's resolution preference. The AI returns a plain-language explanation of what this prerequisite is and why the parent resource uses it. This explanation appears inline below the grayed node as an expandable panel. The node remains grayed-out — the user then decides to expand it ("Don't know") or leave it ("I know this enough").

### Inline Chat

Every fully expanded node has a chat toggle. Opening it reveals a streaming chat panel scoped to that node. The system context includes the node's label, description, resource summary, the user's resolution preference, and the path from the root goal down to this node. The user can ask questions and get tutor-style responses without leaving the graph.

Chat history per node is persisted in the session.

### Pruning

The user can prune any subtree they're not interested in. This removes the node and all its descendants from the graph and saves the change to the session.

---

## Graph Layout and Navigation

### Phase 1

The Phase 1 view is not a traditional graph — it is a focused selection interface. The current root is prominently displayed at the top. Its children are displayed as selectable option cards below it. A breadcrumb or back-stack is shown above the root so the user can see and navigate their selection history.

When the user selects a child, that child becomes the new root, slides to the top position, and new children are generated below it. The old root and its siblings slide into the history stack.

This is not rendered with React Flow. It is a custom list/card UI — simpler and clearer for the selection task.

### Phase 2

Phase 2 is rendered as a top-down tree using React Flow with a dagre layout. The goal node is at the top. Prerequisites branch downward. The tree grows as nodes are expanded.

Fully expanded nodes are visually prominent. Grayed-out nodes are visually subdued — lower opacity, dashed border. Learned nodes have a checkmark overlay. Nodes currently loading (being expanded) show a shimmer state.

Edges are labeled "requires" and point from the goal downward toward prerequisites.

A minimap is shown in Phase 2 for navigating large graphs.

---

## Data Model

### Session

```
id:             UUID
created_at:     ISO timestamp
phase:          "1" | "2"
resolution:     "intuitive" | "technical" | null
root_topic:     string
selection_history: string[]    (stack of node IDs from Phase 1 selections)
current_phase1_node_id: string | null
focus_node_id:  string | null  (the Phase 2 goal, set at Deep Dive)
known_topics:   string[]       (normalized labels of all Learned nodes)
nodes:          map of node_id → Node
edges:          Edge[]
```

### Node

```
id:                string
label:             string
description:       string | null    (null if grayed-out and not yet explained)
phase:             "1" | "2"
node_state:        "expanded" | "grayed" | "learned"
intuition_score:   float | null     (0.0–1.0, Phase 2 expanded nodes only)
resource:          Resource | null  (null if grayed-out)
parent_id:         string | null
child_ids:         string[]
depth:             int              (Phase 2, 0 = goal)
chat_history:      ChatMessage[]
explain_more_text: string | null    (populated by "Explain more" action)
```

### Resource

```
url:         string
title:       string
description: string   (1–2 sentences on what this resource covers)
```

### Edge

```
id:    string
from:  node_id   (parent)
to:    node_id   (child / prerequisite)
label: string | null
```

### ChatMessage

```
role:       "user" | "assistant"
content:    string
created_at: ISO timestamp
```

---

## Storage

All state is stored as flat JSON files in `backend/sessions/`. One file per session, named `<session_id>.json`. The backend reads the file at request start and writes it on any mutation. No database, no migrations. The `sessions/` directory is created by the backend on startup and is gitignored.

The frontend stores the active `session_id` in `localStorage`. On app load, if a session ID is found, it fetches the full session from the backend and restores state.

---

## AI Behavior Summary

### Phase 1 — Child Generation

No web search. The prompt includes the current root node label and all ancestor labels (the selection path so far). Returns 4–6 subtopics as structured JSON: id, label, description (2 sentences), why_interesting (1 sentence), and 1–2 resource URLs. Subtopics must be meaningfully distinct from each other and from any ancestor.

### Phase 2 — Node Expansion

Web search enabled. Given a node label, resolution preference, known_topics list, and the goal label. Returns: a resource (URL, title, description), an intuition score (0.0–1.0), and a list of prerequisite topics detected from the resource (each with a label and a 1-sentence hint). The known_topics list must be passed so already-known prerequisites are excluded.

### Explain More

No web search. Given a grayed node's label, its parent node's label and description, and the resolution preference. Returns a plain-language explanation of what the prerequisite is and why it matters in the context of the parent topic. Approximately 3–5 sentences.

### Inline Chat

No web search. System context: node label, description, resource description, resolution preference, path from goal to this node. Streaming. Responds in tutor style at the specified resolution level.

---

## Out of Scope (v1)

- User accounts or authentication
- Multiple simultaneous users
- Export / sharing
- Embedding-based deduplication (exact label match is sufficient)
- Undo/redo
- Mobile layout
- Offline support
