# FastAPI OpenAI Backend

## Setup

```bash
cd backend
cp .env.example .env
uv sync
```

Mock mode is the default and provides dummy subjects, subtopics, deep-dive
resources, prerequisites, explanations, and chat responses without requiring a
working API key.

```bash
ALPHAG3N_USE_OPENAI=false uv run uvicorn app.main:app --reload --port 8000
```

To use OpenAI instead, set a real key and enable it explicitly:

```bash
ALPHAG3N_USE_OPENAI=true OPENAI_API_KEY=sk-your-real-key uv run uvicorn app.main:app --reload --port 8000
```

The React dev server proxies `/api/*` requests to `http://localhost:8000`.

## Deployment CORS

When the frontend and backend are deployed as separate services, set the backend
environment variable `ALPHAG3N_CORS_ORIGINS` to the exact frontend origin:

```bash
ALPHAG3N_CORS_ORIGINS=https://your-frontend.onrender.com
```

Use the origin only, without a path or `/api` suffix. Multiple origins can be
comma-separated.
