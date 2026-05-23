# FastAPI OpenAI Backend

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`, then run:

```bash
OPENAI_API_KEY=sk-your-key-here uvicorn app.main:app --reload --port 8000
```

The React dev server proxies `/api/*` requests to `http://localhost:8000`.
