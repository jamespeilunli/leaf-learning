from __future__ import annotations

import asyncio
import os
import unittest

from app.ai import explain_prerequisite, using_mock_ai


@unittest.skipUnless(
    os.getenv("ALPHAG3N_TEST_ALLOW_REAL_AI", "").strip() == "1",
    "real OpenAI tests require ALPHAG3N_TEST_ALLOW_REAL_AI=1",
)
class OpenAIIntegrationTests(unittest.TestCase):
    def test_explain_prerequisite_uses_real_openai(self) -> None:
        self.assertEqual(os.getenv("ALPHAG3N_AI_MODE", "").strip().lower(), "openai")
        self.assertFalse(using_mock_ai())

        text = asyncio.run(
            explain_prerequisite(
                "vector spaces",
                "representation learning",
                "Learned representations often encode examples as vectors.",
                "intuitive",
            )
        )

        self.assertGreater(len(text.strip()), 20)
        self.assertNotIn("mock resource", text.lower())


if __name__ == "__main__":
    unittest.main()
