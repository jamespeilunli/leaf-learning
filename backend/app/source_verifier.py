from __future__ import annotations

from collections.abc import Iterable

import httpx

from app.models import Resource


async def _url_is_reachable(client: httpx.AsyncClient, url: str) -> bool:
    try:
        response = await client.head(url, follow_redirects=True)
        if response.status_code < 400:
            return True
        if response.status_code in {403, 405}:
            response = await client.get(url, follow_redirects=True)
            return response.status_code < 400
        return False
    except httpx.HTTPError:
        return False


async def filter_verified_sources(
    sources: Iterable[Resource],
    *,
    client: httpx.AsyncClient | None = None,
) -> list[Resource]:
    source_list = list(sources)
    if not source_list:
        return []

    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=8.0)

    try:
        verified: list[Resource] = []
        for source in source_list:
            if await _url_is_reachable(client, source.url):
                verified.append(source)
        return verified
    finally:
        if owns_client:
            await client.aclose()
