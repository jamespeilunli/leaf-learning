# FastAPI OpenAI Backend

## Setup

```bash
cd backend
cp .env.example .env
uv sync
```

Set `OPENAI_API_KEY` in `.env`, then run:

```bash
OPENAI_API_KEY=sk-your-key-here uv run uvicorn app.main:app --reload --port 8000
```

The React dev server proxies `/api/*` requests to `http://localhost:8000`.
