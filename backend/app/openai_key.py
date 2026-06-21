from __future__ import annotations

import os
from typing import Annotated

from fastapi import Header, HTTPException


OPENAI_API_KEY_HEADER = "X-OpenAI-API-Key"
API_KEY_PLACEHOLDER = "sk-your-key-here"


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def openai_usage_enabled() -> bool:
    return env_flag("ALPHAG3N_USE_OPENAI", default=False)


def using_mock_ai() -> bool:
    return not openai_usage_enabled()


def normalize_openai_api_key(value: str | None) -> str | None:
    key = (value or "").strip()
    if not key or key == API_KEY_PLACEHOLDER:
        return None
    return key


def request_openai_api_key(
    x_openai_api_key: Annotated[str | None, Header(alias=OPENAI_API_KEY_HEADER)] = None,
) -> str | None:
    return normalize_openai_api_key(x_openai_api_key)


def require_openai_api_key(openai_api_key: str | None) -> str | None:
    if using_mock_ai():
        return None
    key = normalize_openai_api_key(openai_api_key)
    if key is None:
        raise HTTPException(
            status_code=401,
            detail="OpenAI API key is required when OpenAI mode is enabled.",
        )
    return key
