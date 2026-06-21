from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import ai
from app.main import app
from app.openai_key import (
    OPENAI_API_KEY_HEADER,
    normalize_openai_api_key,
    require_openai_api_key,
    using_mock_ai,
)
from tests.helpers import isolated_sessions_dir


class OpenAIKeyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dir_context = isolated_sessions_dir()
        self.dir_context.__enter__()

    def tearDown(self) -> None:
        self.dir_context.__exit__(None, None, None)

    def test_normalize_openai_api_key_trims_and_rejects_empty_or_placeholder_values(self) -> None:
        self.assertIsNone(normalize_openai_api_key(""))
        self.assertIsNone(normalize_openai_api_key(" sk-your-key-here "))
        self.assertEqual(normalize_openai_api_key(" sk-user-key "), "sk-user-key")

    def test_require_openai_api_key_raises_only_when_openai_mode_is_enabled(self) -> None:
        with patch.dict("os.environ", {"ALPHAG3N_USE_OPENAI": "false"}):
            self.assertTrue(using_mock_ai())
            self.assertIsNone(require_openai_api_key(None))

        with patch.dict("os.environ", {"ALPHAG3N_USE_OPENAI": "true"}):
            self.assertFalse(using_mock_ai())
            with self.assertRaises(HTTPException) as context:
                require_openai_api_key(None)
            self.assertEqual(context.exception.status_code, 401)
            self.assertEqual(require_openai_api_key(" sk-user-key "), "sk-user-key")

    def test_ai_client_uses_request_scoped_openai_key(self) -> None:
        with patch("app.ai.AsyncOpenAI") as async_openai:
            client = ai.get_client(" sk-user-key ")

        async_openai.assert_called_once_with(api_key="sk-user-key")
        self.assertIs(client, async_openai.return_value)

    def test_ai_endpoint_requires_key_when_openai_mode_is_enabled(self) -> None:
        with patch.dict("os.environ", {"ALPHAG3N_USE_OPENAI": "true"}):
            response = TestClient(app).post("/api/session", json={"topic": "machine learning"})

        self.assertEqual(response.status_code, 401)
        self.assertIn("OpenAI API key is required", response.json()["detail"])

    def test_mock_mode_ignores_provided_key_on_ai_endpoint(self) -> None:
        with patch.dict("os.environ", {"ALPHAG3N_USE_OPENAI": "false"}):
            response = TestClient(app).post(
                "/api/session",
                json={"topic": "machine learning"},
                headers={OPENAI_API_KEY_HEADER: "sk-user-key"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.json()["session"]["nodes"]), 1)


if __name__ == "__main__":
    unittest.main()
