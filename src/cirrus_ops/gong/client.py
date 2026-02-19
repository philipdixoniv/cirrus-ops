"""Gong.io API client with async HTTP, pagination, and rate-limit handling."""

from __future__ import annotations

import base64
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from cirrus_ops.config import settings


def _is_rate_limited(exc: BaseException) -> bool:
    """Return True if the exception represents an HTTP 429 response."""
    return (
        isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code == 429
    )


class GongClient:
    """Async client for the Gong REST API.

    Uses Basic authentication with access_key:access_key_secret encoded as
    base64 in the ``Authorization`` header.  All network calls go through
    :pymethod:`_request`, which retries automatically on 429 rate-limit
    responses via *tenacity*.
    """

    def __init__(self) -> None:
        credentials = f"{settings.gong_access_key}:{settings.gong_access_key_secret}"
        token = base64.b64encode(credentials.encode()).decode()

        self._http = httpx.AsyncClient(
            base_url=settings.gong_base_url,
            headers={
                "Authorization": f"Basic {token}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(30.0),
        )

    # -- async context manager -------------------------------------------

    async def __aenter__(self) -> GongClient:
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:  # noqa: ANN001
        await self.close()

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._http.aclose()

    # -- core request with retry -----------------------------------------

    @retry(
        retry=retry_if_exception(_is_rate_limited),
        wait=wait_exponential(multiplier=1, min=2, max=60),
        stop=stop_after_attempt(6),
        reraise=True,
    )
    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Send an HTTP request and return the parsed JSON response.

        Raises ``httpx.HTTPStatusError`` for non-2xx responses.  429 errors
        are retried automatically (up to 6 attempts with exponential backoff).
        """
        response = await self._http.request(
            method,
            path,
            json=json,
            params=params,
        )
        response.raise_for_status()
        return response.json()

    # -- Gong API methods ------------------------------------------------

    async def list_calls(
        self,
        from_datetime: str | None = None,
        to_datetime: str | None = None,
        cursor: str | None = None,
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Fetch a page of calls via ``POST /v2/calls``.

        Parameters
        ----------
        from_datetime:
            ISO-8601 datetime string for the start of the range.
        to_datetime:
            ISO-8601 datetime string for the end of the range.
        cursor:
            Pagination cursor returned by a previous call.

        Returns
        -------
        tuple
            A ``(calls, next_cursor)`` pair.  *next_cursor* is ``None`` when
            there are no more pages.
        """
        body: dict[str, Any] = {"filter": {}}

        if from_datetime:
            body["filter"]["fromDateTime"] = from_datetime
        if to_datetime:
            body["filter"]["toDateTime"] = to_datetime
        if cursor:
            body["cursor"] = cursor

        data = await self._request("POST", "/v2/calls", json=body)

        calls: list[dict[str, Any]] = data.get("calls", [])
        records = data.get("records", {})
        next_cursor: str | None = records.get("cursor")

        return calls, next_cursor

    async def get_call_transcript(
        self, call_id: str
    ) -> dict[str, Any] | None:
        """Fetch the transcript for a single call via ``POST /v2/calls/transcript``.

        Returns the first matching transcript object, or ``None`` if the API
        returned no transcripts for the given *call_id*.
        """
        body = {"filter": {"callIds": [call_id]}}
        data = await self._request("POST", "/v2/calls/transcript", json=body)

        transcripts: list[dict[str, Any]] = data.get("callTranscripts", [])
        if transcripts:
            return transcripts[0]
        return None

    async def get_call_media(self, call_id: str) -> dict[str, Any]:
        """Fetch media URL information for a call via ``GET /v2/calls/{call_id}/media``."""
        return await self._request("GET", f"/v2/calls/{call_id}/media")

    async def list_users(self) -> list[dict[str, Any]]:
        """Fetch all Gong users, paginating automatically via ``GET /v2/users``.

        Returns the full list of user records across all pages.
        """
        all_users: list[dict[str, Any]] = []
        cursor: str | None = None

        while True:
            params: dict[str, Any] = {}
            if cursor:
                params["cursor"] = cursor

            data = await self._request("GET", "/v2/users", params=params)

            all_users.extend(data.get("users", []))

            records = data.get("records", {})
            cursor = records.get("cursor")
            if not cursor:
                break

        return all_users
