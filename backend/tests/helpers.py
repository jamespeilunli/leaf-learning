from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from app.main import app


def configure_test_ai_mode() -> None:
    os.environ["ALPHAG3N_AI_MODE"] = "mock"
    os.environ["ALPHAG3N_USE_OPENAI"] = "false"
    app_logger = logging.getLogger("app")
    app_logger.setLevel(logging.CRITICAL)
    for handler in app_logger.handlers:
        handler.setLevel(logging.CRITICAL)


@contextmanager
def isolated_sessions_dir() -> Iterator[Path]:
    with TemporaryDirectory() as directory:
        yield Path(directory)


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
