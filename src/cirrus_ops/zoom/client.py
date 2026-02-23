"""Zoom Server-to-Server OAuth API client with async HTTP and rate limiting."""

from __future__ import annotations

import time
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_result,
    stop_after_attempt,
    wait_exponential,
)

from cirrus_ops.config import settings

ZOOM_BASE_URL = "https://api.zoom.us"
ZOOM_OAUTH_URL = "https://zoom.us/oauth/token"

# Refresh the token 60 seconds before it actually expires to avoid
# edge-case failures during in-flight requests.
_TOKEN_REFRESH_BUFFER_SECS = 60


def _is_rate_limited(response: httpx.Response) -> bool:
    """Return True if the response is a 429 rate-limit error."""
    return response.status_code == 429


class ZoomClient:
    """Async Zoom API client with Server-to-Server OAuth and rate-limit retry.

    Usage::

        async with ZoomClient() as zoom:
            recordings, token = await zoom.list_recordings(from_date="2024-01-01")
    """

    def __init__(self) -> None:
        self._http = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0

    # -- Async context manager --------------------------------------------------

    async def __aenter__(self) -> ZoomClient:
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:  # noqa: ANN001
        await self.close()

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._http.aclose()

    # -- OAuth token management -------------------------------------------------

    async def _ensure_token(self) -> str:
        """Obtain or refresh the Server-to-Server OAuth access token.

        The token is cached in memory and automatically refreshed when it is
        within ``_TOKEN_REFRESH_BUFFER_SECS`` of expiry.
        """
        if self._access_token and time.monotonic() < self._token_expires_at:
            return self._access_token

        response = await self._http.post(
            ZOOM_OAUTH_URL,
            params={
                "grant_type": "account_credentials",
                "account_id": settings.zoom_account_id,
            },
            auth=(settings.zoom_client_id, settings.zoom_client_secret),
        )
        response.raise_for_status()

        data = response.json()
        self._access_token = data["access_token"]
        expires_in: int = data.get("expires_in", 3600)
        self._token_expires_at = time.monotonic() + expires_in - _TOKEN_REFRESH_BUFFER_SECS

        return self._access_token

    # -- Core request with retry ------------------------------------------------

    @retry(
        retry=retry_if_result(_is_rate_limited),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        stop=stop_after_attempt(6),
    )
    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        base_url: str | None = None,
    ) -> httpx.Response:
        """Send an authenticated request to the Zoom API.

        Retries automatically on HTTP 429 (rate limit) using exponential backoff.
        For non-429 errors the response is raised immediately via
        ``raise_for_status``.
        """
        token = await self._ensure_token()
        url = f"{base_url or ZOOM_BASE_URL}{path}" if path.startswith("/") else path
        headers = {"Authorization": f"Bearer {token}"}

        response = await self._http.request(
            method,
            url,
            params=params,
            json=json,
            headers=headers,
        )

        # Return 429 responses so tenacity can decide to retry.
        if response.status_code == 429:
            return response

        response.raise_for_status()
        return response

    # -- Public API methods -----------------------------------------------------

    async def list_recordings(
        self,
        from_date: str | None = None,
        to_date: str | None = None,
        user_id: str = "me",
        next_page_token: str | None = None,
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Return a page of cloud recordings.

        Parameters
        ----------
        from_date:
            Start date in ``YYYY-MM-DD`` format.
        to_date:
            End date in ``YYYY-MM-DD`` format.
        user_id:
            Zoom user ID or ``"me"`` for the authenticated user.
        next_page_token:
            Token for fetching the next page.

        Returns
        -------
        tuple
            A ``(meetings, next_page_token)`` pair.  ``next_page_token`` is
            ``None`` when there are no more pages.
        """
        params: dict[str, Any] = {}
        if from_date:
            params["from"] = from_date
        if to_date:
            params["to"] = to_date
        if next_page_token:
            params["next_page_token"] = next_page_token

        resp = await self._request("GET", f"/v2/users/{user_id}/recordings", params=params)
        data = resp.json()

        meetings: list[dict[str, Any]] = data.get("meetings", [])
        token = data.get("next_page_token") or None
        return meetings, token

    async def get_meeting(self, meeting_id: str | int) -> dict[str, Any]:
        """Fetch details for a single meeting."""
        resp = await self._request("GET", f"/v2/meetings/{meeting_id}")
        return resp.json()

    async def get_participants(self, meeting_id: str | int) -> list[dict[str, Any]]:
        """Fetch the participant list for a past meeting.

        Paginates automatically and returns the full participant list.
        """
        all_participants: list[dict[str, Any]] = []
        next_token: str | None = None

        while True:
            params: dict[str, Any] = {}
            if next_token:
                params["next_page_token"] = next_token

            resp = await self._request(
                "GET",
                f"/v2/past_meetings/{meeting_id}/participants",
                params=params,
            )
            data = resp.json()
            all_participants.extend(data.get("participants", []))

            next_token = data.get("next_page_token") or None
            if not next_token:
                break

        return all_participants

    async def download_transcript(self, download_url: str) -> str:
        """Download a VTT transcript and return its text content."""
        resp = await self._request("GET", download_url)
        return resp.text

    async def download_recording(self, download_url: str) -> bytes:
        """Download a recording file and return the raw bytes."""
        resp = await self._request("GET", download_url)
        return resp.content
