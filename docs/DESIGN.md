# Leaf Learning Design Notes

Leaf Learning builds a browser-owned learning roadmap. Users start with a broad topic, narrow it in Phase 1, then deep dive into a Phase 2 prerequisite graph with resources, explanations, and scoped node chat.

## State And Privacy

All user session state is stored in frontend `localStorage`.

- The active session ID is stored under `roadmap_session_id`.
- Serialized sessions are stored in the browser-local sessions map.
- Graph state, known topics, hidden prefetched nodes, and per-node chat history are browser-local only.
- The backend receives request-local snapshots for AI generation and does not write roadmap or chat data to disk.

## Backend Role

The backend is stateless for roadmap data. It exposes generation endpoints for:

- initial session creation
- Phase 1 child topic generation
- Phase 2 node expansion
- client-owned Phase 2 prefetch generation
- prerequisite suggestion
- prerequisite explanation
- scoped node chat streaming

The backend may receive bounded chat history for the active chat request, but it never appends or persists that history.

## Frontend Role

The frontend is the source of truth for session state.

- Zustand owns the active in-memory session.
- Session changes are persisted immediately to `localStorage`.
- Previous sessions shown on the start screen come from local browser storage.
- Restart/clear-cache clears browser storage and does not call backend session deletion.
