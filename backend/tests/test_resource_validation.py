from __future__ import annotations

import asyncio
import ssl
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

import urllib.error

from app.resource_validation import endpoint_exists, endpoint_validation_result


class EndpointHandler(BaseHTTPRequestHandler):
    def do_HEAD(self) -> None:
        if self.path == "/exists":
            self.send_response(200)
        elif self.path == "/private":
            self.send_response(403)
        else:
            self.send_response(404)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        return None


class ResourceValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = HTTPServer(("127.0.0.1", 0), EndpointHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=2)
        self.server.server_close()

    def url(self, path: str) -> str:
        host, port = self.server.server_address
        return f"http://{host}:{port}{path}"

    def test_endpoint_exists_accepts_reachable_and_private_endpoints(self) -> None:
        self.assertTrue(asyncio.run(endpoint_exists(self.url("/exists"))))
        self.assertTrue(asyncio.run(endpoint_exists(self.url("/private"))))

    def test_endpoint_exists_rejects_missing_or_invalid_urls(self) -> None:
        self.assertFalse(asyncio.run(endpoint_exists(self.url("/missing"))))
        self.assertFalse(asyncio.run(endpoint_exists("not-a-url")))

    def test_endpoint_validation_falls_back_on_ssl_verification_errors(self) -> None:
        class FakeResponse:
            def __init__(self, status: int) -> None:
                self.status = status

            def __enter__(self) -> "FakeResponse":
                return self

            def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
                return None

            def getcode(self) -> int:
                return self.status

        def fake_urlopen(request: object, timeout: float | None = None, context: ssl.SSLContext | None = None):
            if context and context.verify_mode == ssl.CERT_REQUIRED:
                raise urllib.error.URLError(ssl.SSLCertVerificationError(1, "CERTIFICATE_VERIFY_FAILED"))
            return FakeResponse(200)

        with patch("app.resource_validation.urllib.request.urlopen", side_effect=fake_urlopen):
            result = asyncio.run(endpoint_validation_result("https://example.com/resource"))

        self.assertTrue(result.exists)
        self.assertEqual(result.reason, "HEAD returned HTTP 200")


if __name__ == "__main__":
    unittest.main()
