# FastAPI + OpenAI + React Starter

This repo is split into:

- `backend/`: FastAPI server that calls the OpenAI Responses API.
- `frontend/`: Vite React TypeScript app styled with Tailwind CSS.

## Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
OPENAI_API_KEY=sk-your-key-here uvicorn app.main:app --reload --port 8000
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/chat` to FastAPI on `http://localhost:8000`.
