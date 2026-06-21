# Current Implementation Summary

Leaf Learning uses a Vite/React frontend and FastAPI backend.

## Privacy Model

The frontend owns all user session state in `localStorage`.

- `roadmap_session_id` stores the active session ID.
- `roadmap_sessions` stores serialized session objects by ID.
- Chat history, hidden prefetched graph nodes, known topics, and graph progress are browser-local only.
- Clearing cache clears browser storage; it does not call a backend session deletion route.

The backend is stateless for roadmap data. It accepts request-local session snapshots for AI generation and returns generated results without writing sessions or chats to disk.

## Main Backend Endpoints

- `POST /api/session`: create an initial in-memory session response for a topic.
- `POST /api/phase1/children`: generate Phase 1 children from a supplied session snapshot and node ID.
- `POST /api/session/{session_id}/node/{node_id}/expand`: stream Phase 2 expansion events from a supplied session snapshot.
- `POST /api/session/{session_id}/phase2/prefetch`: generate hidden Phase 2 descendants for client-owned prefetch.
- `POST /api/session/{session_id}/node/{node_id}/explain`: explain a grayed node from supplied context.
- `POST /api/session/{session_id}/node/{node_id}/suggest-prerequisite`: suggest a missing prerequisite from supplied context.
- `POST /api/session/{session_id}/node/{node_id}/chat`: stream a scoped answer from supplied context and bounded history.

There is no backend session storage module and no `/api/sessions` listing route.

## Main Frontend Modules

- `frontend/src/store/useSessionStore.ts`: active session state, local mutations, persistence, streaming merge logic, and client-owned prefetch.
- `frontend/src/lib/sessionPersistence.ts`: browser-local session save/load/list helpers.
- `frontend/src/lib/sessionPayload.ts`: strips stored chat history from backend-bound session snapshots.
- `frontend/src/lib/api.ts`: stateless generation API client.

## Verification

- Backend: `uv run python3 -m unittest`
- Frontend tests: `npm test`
- Frontend build: `npm run build`
