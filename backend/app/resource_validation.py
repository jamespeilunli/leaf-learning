from __future__ import annotations

import asyncio
from dataclasses import dataclass
import ssl
import urllib.error
import urllib.request
from urllib.parse import urlparse


ACCEPTED_ENDPOINT_STATUS_CODES = {401, 403, 405, 408, 409, 423, 425, 429, 500, 502, 503, 504}
REJECTED_ENDPOINT_STATUS_CODES = {404, 410}


@dataclass(frozen=True)
class EndpointValidationResult:
    exists: bool
    reason: str


def _is_certificate_verification_error(exc: urllib.error.URLError) -> bool:
    reason = exc.reason
    return isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason)


def _request_status(url: str, method: str, timeout: float, context: ssl.SSLContext | None) -> int:
    request = urllib.request.Request(
        url,
        method=method,
        headers={
            "User-Agent": "alphag3n-link-validator/1.0",
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        return response.getcode()


def _endpoint_validation_result_sync(url: str, timeout: float) -> EndpointValidationResult:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return EndpointValidationResult(False, "URL must include an http or https scheme and host")

    verified_context = ssl.create_default_context()
    unverified_context = ssl._create_unverified_context()

    for method in ("HEAD", "GET"):
        try:
            status = _request_status(url, method, timeout, verified_context)
        except urllib.error.HTTPError as exc:
            status = exc.code
        except urllib.error.URLError as exc:
            if not _is_certificate_verification_error(exc):
                return EndpointValidationResult(False, f"request failed: {exc.reason}")
            try:
                status = _request_status(url, method, timeout, unverified_context)
            except urllib.error.HTTPError as unverified_exc:
                status = unverified_exc.code
            except urllib.error.URLError as unverified_exc:
                return EndpointValidationResult(False, f"request failed: {unverified_exc.reason}")
        except (OSError, ValueError) as exc:
            return EndpointValidationResult(False, f"request failed: {exc}")

        if 200 <= status < 400 or status in ACCEPTED_ENDPOINT_STATUS_CODES:
            return EndpointValidationResult(True, f"{method} returned HTTP {status}")
        if method == "HEAD" and status in {405, 501}:
            continue
        if status in REJECTED_ENDPOINT_STATUS_CODES:
            return EndpointValidationResult(False, f"{method} returned HTTP {status}")
        return EndpointValidationResult(True, f"{method} returned HTTP {status}")

    return EndpointValidationResult(False, "endpoint did not respond to HEAD or GET")


async def endpoint_validation_result(url: str, timeout: float = 3.0) -> EndpointValidationResult:
    return await asyncio.to_thread(_endpoint_validation_result_sync, url, timeout)


async def endpoint_exists(url: str, timeout: float = 3.0) -> bool:
    return (await endpoint_validation_result(url, timeout)).exists
