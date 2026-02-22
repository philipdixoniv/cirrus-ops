"""Gong sync engine -- bulk and incremental sync of calls, participants, and transcripts."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential

from cirrus_ops import db
from cirrus_ops.config import settings
from cirrus_ops.gong.client import GongClient

logger = logging.getLogger(__name__)

PLATFORM = "gong"


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------


def _normalize_call(call: dict[str, Any], users: dict[str, Any]) -> dict[str, Any]:
    """Transform a raw Gong call dict into a ``meetings`` table row.

    Parameters
    ----------
    call:
        A single call object as returned by the Gong ``/v2/calls`` endpoint.
    users:
        A mapping of Gong user IDs to user records, used to resolve the host
        display name.
    """
    host_user_id = call.get("metaData", {}).get("primaryUserId")
    host_user = users.get(host_user_id, {}) if host_user_id else {}
    host_name = (
        f"{host_user.get('firstName', '')} {host_user.get('lastName', '')}".strip()
        if host_user
        else None
    )

    meta = call.get("metaData", {})
    started = meta.get("started")
    duration = meta.get("duration")

    # Gong provides duration in seconds; compute ended_at when possible.
    ended_at: str | None = None
    if started and duration:
        try:
            start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
            end_dt = start_dt.replace(
                second=start_dt.second + int(duration)
            ) if isinstance(duration, (int, float)) else None
            if end_dt is not None:
                from datetime import timedelta

                end_dt = start_dt + timedelta(seconds=int(duration))
                ended_at = end_dt.isoformat()
        except (ValueError, TypeError):
            ended_at = None

    return {
        "platform": PLATFORM,
        "external_id": str(call.get("id", call.get("metaData", {}).get("id", ""))),
        "title": meta.get("title"),
        "started_at": started,
        "ended_at": ended_at,
        "duration_seconds": int(duration) if duration else None,
        "host_name": host_name,
        "host_email": host_user.get("emailAddress"),
        "raw_metadata": call,
    }


def _normalize_participants(
    call: dict[str, Any], users: dict[str, Any]
) -> list[dict[str, Any]]:
    """Extract participants from a Gong call and resolve display names.

    Parameters
    ----------
    call:
        A single call object from the Gong API.
    users:
        A mapping of Gong user IDs to user records.

    Returns
    -------
    list
        A list of dicts suitable for insertion into the ``participants`` table.
    """
    participants: list[dict[str, Any]] = []

    for party in call.get("parties", []):
        user_id = party.get("userId")
        user = users.get(user_id, {}) if user_id else {}
        name = party.get("name") or (
            f"{user.get('firstName', '')} {user.get('lastName', '')}".strip()
            if user
            else party.get("emailAddress")
        )

        participants.append(
            {
                "name": name,
                "email": party.get("emailAddress"),
                "role": party.get("affiliation"),  # e.g. "Internal" / "External"
                "speaker_id": user_id,
                "is_customer": party.get("affiliation") == "External",
                "raw_metadata": party,
            }
        )

    return participants


def _normalize_transcript(transcript_data: dict[str, Any]) -> dict[str, Any]:
    """Transform a Gong transcript response into our ``transcripts`` table schema.

    Parameters
    ----------
    transcript_data:
        A single object from the ``callTranscripts`` array returned by the
        Gong ``/v2/calls/transcript`` endpoint.

    Returns
    -------
    dict
        A dict with ``full_text``, ``segments``, and ``word_count`` keys.
    """
    raw_segments: list[dict[str, Any]] = transcript_data.get("transcript", [])

    segments: list[dict[str, Any]] = []
    text_parts: list[str] = []

    for seg in raw_segments:
        speaker = seg.get("speakerName") or seg.get("speakerId", "Unknown")
        sentences = seg.get("sentences", [])

        seg_text_parts: list[str] = []
        start_time: float | None = None
        end_time: float | None = None

        for sentence in sentences:
            seg_text_parts.append(sentence.get("text", ""))
            s_start = sentence.get("start")
            s_end = sentence.get("end")
            if s_start is not None and (start_time is None or s_start < start_time):
                start_time = s_start
            if s_end is not None and (end_time is None or s_end > end_time):
                end_time = s_end

        seg_text = " ".join(seg_text_parts)
        text_parts.append(seg_text)

        segments.append(
            {
                "speaker": str(speaker),
                "text": seg_text,
                "start_time": start_time,
                "end_time": end_time,
            }
        )

    full_text = "\n".join(text_parts)
    word_count = len(full_text.split())

    return {
        "full_text": full_text,
        "segments": segments,
        "word_count": word_count,
    }


# ---------------------------------------------------------------------------
# Sync orchestration
# ---------------------------------------------------------------------------


async def bulk_sync() -> None:
    """Run a full sync of all Gong calls, participants, and transcripts.

    Steps:
    1. Mark sync state as *running*.
    2. Fetch all Gong users (for speaker/host name resolution).
    3. Paginate through **all** calls via the cursor.
    4. For each batch: upsert meetings, upsert participants, fetch + upsert
       transcripts.
    5. Mark sync state as *complete* (or *error* on failure).
    """
    db.set_sync_running(PLATFORM)
    total_synced = 0
    last_cursor: str | None = None

    try:
        async with GongClient() as gong:
            # 1. Build a user lookup dict
            raw_users = await gong.list_users()
            users: dict[str, Any] = {u["id"]: u for u in raw_users}
            logger.info("Fetched %d Gong users for name resolution.", len(users))

            # 2. Paginate through all calls
            cursor: str | None = None
            while True:
                calls, next_cursor = await gong.list_calls(cursor=cursor)
                if not calls:
                    break

                # Process in sub-batches of sync_batch_size
                for i in range(0, len(calls), settings.sync_batch_size):
                    batch = calls[i : i + settings.sync_batch_size]
                    await _process_batch(gong, batch, users)
                    total_synced += len(batch)
                    logger.info(
                        "Gong bulk sync progress: %d calls synced so far.",
                        total_synced,
                    )

                last_cursor = next_cursor
                cursor = next_cursor
                if not cursor:
                    break

        db.set_sync_complete(PLATFORM, total_synced, last_cursor)
        logger.info("Gong bulk sync complete. Total calls synced: %d", total_synced)

    except Exception:
        logger.exception("Gong bulk sync failed.")
        db.set_sync_error(PLATFORM, _format_error())
        raise


async def incremental_sync() -> None:
    """Run an incremental sync starting from the last successful sync point.

    Uses ``last_synced_at`` from the sync-state table as the ``fromDateTime``
    filter so only new/updated calls are fetched.  Persists the cursor back
    on completion.
    """
    sync_state = db.get_sync_state(PLATFORM)
    from_datetime: str | None = None
    if sync_state:
        from_datetime = sync_state.get("last_synced_at")

    db.set_sync_running(PLATFORM)
    total_synced = 0
    last_cursor: str | None = None

    try:
        async with GongClient() as gong:
            raw_users = await gong.list_users()
            users: dict[str, Any] = {u["id"]: u for u in raw_users}
            logger.info("Fetched %d Gong users for name resolution.", len(users))

            cursor: str | None = None
            while True:
                calls, next_cursor = await gong.list_calls(
                    from_datetime=from_datetime,
                    cursor=cursor,
                )
                if not calls:
                    break

                for i in range(0, len(calls), settings.sync_batch_size):
                    batch = calls[i : i + settings.sync_batch_size]
                    await _process_batch(gong, batch, users)
                    total_synced += len(batch)
                    logger.info(
                        "Gong incremental sync progress: %d calls synced so far.",
                        total_synced,
                    )

                last_cursor = next_cursor
                cursor = next_cursor
                if not cursor:
                    break

        db.set_sync_complete(PLATFORM, total_synced, last_cursor)
        logger.info(
            "Gong incremental sync complete. Total calls synced: %d",
            total_synced,
        )

    except Exception:
        logger.exception("Gong incremental sync failed.")
        db.set_sync_error(PLATFORM, _format_error())
        raise


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30), reraise=True)
def _db_upsert_meeting(data: dict[str, Any]) -> dict[str, Any]:
    """Upsert a meeting with retry on transient connection errors."""
    return db.upsert_meeting(data)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30), reraise=True)
def _db_upsert_participants(meeting_id: str, participants: list[dict[str, Any]]) -> None:
    """Upsert participants with retry on transient connection errors."""
    db.upsert_participants(meeting_id, participants)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30), reraise=True)
def _db_upsert_transcript(data: dict[str, Any]) -> None:
    """Upsert a transcript with retry on transient connection errors."""
    db.upsert_transcript(data)


async def _process_batch(
    gong: GongClient,
    calls: list[dict[str, Any]],
    users: dict[str, Any],
) -> None:
    """Upsert meetings, participants, and transcripts for a batch of calls."""
    for call in calls:
        try:
            # Upsert the meeting row
            meeting_data = _normalize_call(call, users)
            meeting = _db_upsert_meeting(meeting_data)
            meeting_id: str = meeting["id"]

            # Upsert participants
            participants = _normalize_participants(call, users)
            _db_upsert_participants(meeting_id, participants)

            # Fetch and upsert transcript
            call_id = str(call.get("id", call.get("metaData", {}).get("id", "")))
            transcript_data = await gong.get_call_transcript(call_id)
            if transcript_data:
                normalized = _normalize_transcript(transcript_data)
                normalized["meeting_id"] = meeting_id
                _db_upsert_transcript(normalized)
        except Exception:
            logger.error(
                "Failed to process call %s, skipping",
                call.get("metaData", {}).get("id", "unknown"),
                exc_info=True,
            )


def _format_error() -> str:
    """Format the current exception as a string for sync-state storage."""
    import traceback

    return traceback.format_exc(limit=5)
