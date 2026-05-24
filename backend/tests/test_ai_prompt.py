from __future__ import annotations

import unittest

from app.ai import _build_phase2_instructions


class Phase2PromptTests(unittest.TestCase):
    def test_phase2_prompt_requires_actionable_parent_specific_nodes(self) -> None:
        prompt = _build_phase2_instructions(
            "localization",
            ["range residuals"],
            "robot localization",
        )

        self.assertIn('Each child node must be necessary for understanding the node immediately before it', prompt)
        self.assertIn("explicitly state how that prerequisite is used by", prompt)
        self.assertIn("single best source", prompt)
        self.assertIn("without a paywall", prompt)
        self.assertIn("sources must contain exactly 1", prompt)
        self.assertIn("scan the actual source content", prompt)
        self.assertIn("analytical localization solve", prompt)
        self.assertIn("iterative localization solve", prompt)
        self.assertIn("matrix exponentials", prompt)
        self.assertIn("Bad generic chains", prompt)
        self.assertIn("Image Recognition", prompt)
        self.assertIn("range residuals", prompt)


if __name__ == "__main__":
    unittest.main()
