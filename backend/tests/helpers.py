from __future__ import annotations

import json
import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from app import storage
from app.main import app


def configure_test_ai_mode() -> None:
    allow_real_ai = os.getenv("ALPHAG3N_TEST_ALLOW_REAL_AI", "").strip() == "1"
    requested_mode = os.getenv("ALPHAG3N_AI_MODE", "").strip().lower()
    if allow_real_ai and requested_mode == "openai":
        return
    os.environ["ALPHAG3N_AI_MODE"] = "mock"


@contextmanager
def isolated_sessions_dir() -> Iterator[Path]:
    with TemporaryDirectory() as directory:
        previous = storage.SESSIONS_DIR
        storage.SESSIONS_DIR = Path(directory)
        storage.ensure_sessions_dir()
        try:
            yield storage.SESSIONS_DIR
        finally:
            storage.SESSIONS_DIR = previous


def test_client() -> TestClient:
    configure_test_ai_mode()
    return TestClient(app)


def parse_sse(text: str) -> list[tuple[str, object]]:
    events: list[tuple[str, object]] = []
    current_event = "message"

    for block in text.strip().split("\n\n"):
        if not block:
            continue
        data: object = None
        for line in block.splitlines():
            if line.startswith("event: "):
                current_event = line[7:].strip()
            elif line.startswith("data: "):
                raw = line[6:]
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    data = raw
        events.append((current_event, data))
        current_event = "message"

    return events
