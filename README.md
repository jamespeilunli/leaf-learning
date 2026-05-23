# FastAPI + OpenAI + React Starter

This repo is split into:

- `backend/`: FastAPI server that calls the OpenAI Responses API.
- `frontend/`: Vite React TypeScript app styled with Tailwind CSS.

## Backend

The backend defaults to a deterministic mock AI mode, so local development and
deep-dive testing work without OpenAI access even if an API key is present.

```bash
cd backend
uv sync
ALPHAG3N_AI_MODE=mock uv run uvicorn app.main:app --reload --port 8000
```

To force the real OpenAI backend, set both values:

```bash
ALPHAG3N_AI_MODE=openai OPENAI_API_KEY=sk-your-real-key uv run uvicorn app.main:app --reload --port 8000
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to FastAPI on `http://localhost:8000`.
