from __future__ import annotations

import unittest

from app.models import Resource
from app.source_verifier import filter_verified_sources


class _Response:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


class _Client:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def head(self, url: str, follow_redirects: bool = True) -> _Response:
        self.calls.append(("HEAD", url))
        if url.endswith("/head-ok"):
            return _Response(200)
        if url.endswith("/fallback-ok"):
            return _Response(405)
        return _Response(404)

    async def get(self, url: str, follow_redirects: bool = True) -> _Response:
        self.calls.append(("GET", url))
        if url.endswith("/fallback-ok"):
            return _Response(200)
        return _Response(404)


class SourceVerifierTests(unittest.IsolatedAsyncioTestCase):
    async def test_filters_sources_to_only_reachable_urls(self) -> None:
        client = _Client()
        sources = [
            Resource(url="https://example.com/head-ok", title="Head OK", description="passes head"),
            Resource(url="https://example.com/fallback-ok", title="Fallback OK", description="passes get"),
            Resource(url="https://example.com/broken", title="Broken", description="fails"),
        ]

        verified = await filter_verified_sources(sources, client=client)

        self.assertEqual([source.title for source in verified], ["Head OK", "Fallback OK"])
        self.assertIn(("GET", "https://example.com/fallback-ok"), client.calls)


if __name__ == "__main__":
    unittest.main()
