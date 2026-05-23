import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    model: str | None = Field(default=None, max_length=120)


class ChatResponse(BaseModel):
    reply: str
    model: str


OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

app = FastAPI(title="OpenAI FastAPI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured on the backend.",
        )

    model = payload.model or OPENAI_MODEL
    client = OpenAI(api_key=api_key)

    try:
        response = client.responses.create(
            model=model,
            instructions=(
                "You are a concise assistant inside a starter FastAPI and "
                "React application. Give practical, implementation-focused answers."
            ),
            input=payload.message,
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return ChatResponse(reply=response.output_text, model=model)
