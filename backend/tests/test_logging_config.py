from __future__ import annotations

import logging
import unittest
from unittest.mock import patch

from app.main import configure_logging


class LoggingConfigTests(unittest.TestCase):
    def test_configure_logging_prints_app_info_logs(self) -> None:
        app_logger = logging.getLogger("app")
        previous_handlers = app_logger.handlers[:]
        previous_level = app_logger.level
        previous_propagate = app_logger.propagate
        app_logger.handlers = []

        try:
            with patch.dict("os.environ", {"ALPHAG3N_LOG_LEVEL": "INFO"}):
                configure_logging()

            self.assertEqual(app_logger.level, logging.INFO)
            self.assertFalse(app_logger.propagate)
            self.assertTrue(app_logger.handlers)
            self.assertTrue(all(handler.level == logging.INFO for handler in app_logger.handlers))
        finally:
            app_logger.handlers = previous_handlers
            app_logger.setLevel(previous_level)
            app_logger.propagate = previous_propagate


if __name__ == "__main__":
    unittest.main()
