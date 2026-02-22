"""Zoom sync engine -- bulk and incremental sync of recordings, transcripts, and media."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from typing import Any

from cirrus_ops.config import settings
from cirrus_ops.zoom.client import ZoomClient
from cirrus_ops import db

logger = logging.getLogger(__name__)

PLATFORM = "zoom"

# Recording types that represent downloadable media files.
_MEDIA_RECORDING_TYPES = frozenset(
    {
        "shared_screen_with_speaker_view",
        "audio_only",
        "shared_screen",
    }
)

# Content-type mapping for media uploads.
_CONTENT_TYPES: dict[str, str] = {
    "MP4": "video/mp4",
    "M4A": "audio/mp4",
    "mp4": "video/mp4",
    "m4a": "audio/mp4",
}

# ---------------------------------------------------------------------------
# VTT parsing
# ---------------------------------------------------------------------------

_TIMESTAMP_RE = re.compile(
    r"(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})"
)


def _parse_vtt(vtt_content: str) -> tuple[str, list[dict[str, Any]]]:
    """Parse WebVTT content into a full-text string and a list of segments.

    Each segment has the keys ``speaker``, ``text``, ``start_time``, and
    ``end_time``.  The ``speaker`` is extracted from lines matching the
    pattern ``"Speaker Name: spoken text"``; if no colon-delimited speaker
    prefix is found the speaker is set to ``"Unknown"``.

    Parameters
    ----------
    vtt_content:
        Raw VTT file content (as returned by Zoom).

    Returns
    -------
    tuple
        ``(full_text, segments)`` where *full_text* is the concatenated
        plain text of all cues.
    """
    segments: list[dict[str, Any]] = []
    full_text_parts: list[str] = []

    lines = vtt_content.splitlines()
    i = 0

    # Skip the WEBVTT header and any blank lines / NOTE blocks.
    while i < len(lines) and not _TIMESTAMP_RE.search(lines[i]):
        i += 1

    while i < len(lines):
        line = lines[i].strip()

        ts_match = _TIMESTAMP_RE.search(line)
        if ts_match:
            start_time = ts_match.group(1)
            end_time = ts_match.group(2)
            i += 1

            # Collect all text lines until the next blank line or EOF.
            text_lines: list[str] = []
            while i < len(lines) and lines[i].strip():
                text_lines.append(lines[i].strip())
                i += 1

            raw_text = " ".join(text_lines)

            # Try to extract "Speaker: text" pattern.
            if ": " in raw_text:
                speaker, _, text = raw_text.partition(": ")
            else:
                speaker = "Unknown"
                text = raw_text

            segments.append(
                {
                    "speaker": speaker,
                    "text": text,
                    "start_time": start_time,
                    "end_time": end_time,
                }
            )
            full_text_parts.append(text)
        else:
            i += 1

    full_text = "\n".join(full_text_parts)
    return full_text, segments


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------


def _normalize_meeting(meeting: dict[str, Any]) -> dict[str, Any]:
    """Transform a Zoom recording/meeting payload into a ``meetings`` table row."""
    return {
        "platform": PLATFORM,
        "external_id": str(meeting.get("uuid") or meeting.get("id", "")),
        "title": meeting.get("topic", ""),
        "started_at": meeting.get("start_time"),
        "duration_seconds": (meeting.get("duration", 0) or 0) * 60,  # Zoom returns minutes
        "host_email": meeting.get("host_email", ""),
        "host_name": meeting.get("host_id", ""),
        "raw_metadata": meeting,
    }


def _normalize_participants(participants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Transform Zoom participant records into ``participants`` table rows."""
    normalized: list[dict[str, Any]] = []
    for p in participants:
        normalized.append(
            {
                "name": p.get("name", ""),
                "email": p.get("user_email", ""),
                "speaker_id": str(p.get("id", "")),
                "raw_metadata": p,
            }
        )
    return normalized


# ---------------------------------------------------------------------------
# Recording-file helpers
# ---------------------------------------------------------------------------


def _find_transcript_file(recording_files: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Return the first VTT transcript file from a meeting's recording files."""
    for rf in recording_files:
        if rf.get("recording_type") == "audio_transcript" and rf.get("file_extension") == "VTT":
            return rf
    return None


def _find_media_files(recording_files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return all media (video/audio) recording files."""
    return [rf for rf in recording_files if rf.get("recording_type") in _MEDIA_RECORDING_TYPES]


# ---------------------------------------------------------------------------
# Sync entry points
# ---------------------------------------------------------------------------


async def _sync_meetings(client: ZoomClient, from_date: str, to_date: str | None = None) -> int:
    """Core sync loop shared by bulk and incremental sync.

    Returns the total number of meetings synced.
    """
    total_synced = 0
    next_page_token: str | None = None
    batch: list[dict[str, Any]] = []

    while True:
        meetings, next_page_token = await client.list_recordings(
            from_date=from_date,
            to_date=to_date,
            next_page_token=next_page_token,
        )

        for meeting in meetings:
            batch.append(meeting)

            if len(batch) >= settings.sync_batch_size:
                total_synced += await _process_batch(client, batch)
                batch = []

        if not next_page_token:
            break

    # Process any remaining meetings in the last partial batch.
    if batch:
        total_synced += await _process_batch(client, batch)

    return total_synced


async def _process_batch(client: ZoomClient, meetings: list[dict[str, Any]]) -> int:
    """Process a batch of Zoom meeting recordings.

    For each meeting:
    1. Upsert the meeting record.
    2. Fetch and upsert participants.
    3. Download and parse the VTT transcript (if available).
    4. Download media files and upload to Supabase Storage.

    Returns the count of successfully processed meetings.
    """
    processed = 0

    for meeting in meetings:
        meeting_external_id = str(meeting.get("uuid") or meeting.get("id", ""))
        topic = meeting.get("topic", "<untitled>")

        try:
            # 1. Upsert meeting
            row = _normalize_meeting(meeting)
            upserted = db.upsert_meeting(row)
            meeting_id: str = upserted["id"]
            logger.info("Upserted meeting %s — %s", meeting_external_id, topic)

            # 2. Participants
            try:
                raw_participants = await client.get_participants(meeting_external_id)
                norm_participants = _normalize_participants(raw_participants)
                db.upsert_participants(meeting_id, norm_participants)
                logger.debug(
                    "Upserted %d participants for meeting %s",
                    len(norm_participants),
                    meeting_external_id,
                )
            except Exception:
                # Participant fetch can fail for meetings still in progress or
                # very old meetings.  Log and continue.
                logger.warning(
                    "Failed to fetch participants for meeting %s",
                    meeting_external_id,
                    exc_info=True,
                )

            # 3. Transcript (VTT)
            recording_files: list[dict[str, Any]] = meeting.get("recording_files", [])
            vtt_file = _find_transcript_file(recording_files)
            if vtt_file:
                download_url = vtt_file.get("download_url", "")
                if download_url:
                    try:
                        vtt_content = await client.download_transcript(download_url)
                        full_text, segments = _parse_vtt(vtt_content)
                        db.upsert_transcript(
                            {
                                "meeting_id": meeting_id,
                                "full_text": full_text,
                                "segments": segments,
                                "word_count": len(full_text.split()),
                            }
                        )
                        logger.info(
                            "Upserted transcript (%d segments) for meeting %s",
                            len(segments),
                            meeting_external_id,
                        )
                    except Exception:
                        logger.warning(
                            "Failed to download/parse transcript for meeting %s",
                            meeting_external_id,
                            exc_info=True,
                        )

            # 4. Media files
            media_files = _find_media_files(recording_files)
            for mf in media_files:
                download_url = mf.get("download_url", "")
                if not download_url:
                    continue

                try:
                    file_ext = (mf.get("file_extension") or "mp4").lower()
                    recording_type = mf.get("recording_type", "unknown")
                    storage_path = f"zoom/{meeting_external_id}/{recording_type}.{file_ext}"
                    content_type = _CONTENT_TYPES.get(
                        mf.get("file_extension", ""), "application/octet-stream"
                    )

                    file_bytes = await client.download_recording(download_url)
                    db.upload_to_storage("recordings", storage_path, file_bytes, content_type)
                    db.insert_media(
                        {
                            "id": str(uuid.uuid4()),
                            "meeting_id": meeting_id,
                            "media_type": recording_type,
                            "storage_path": storage_path,
                            "file_size_bytes": mf.get("file_size", len(file_bytes)),
                            "format": file_ext,
                            "source_url": download_url,
                        }
                    )
                    logger.info(
                        "Uploaded media %s for meeting %s",
                        recording_type,
                        meeting_external_id,
                    )
                except Exception:
                    logger.warning(
                        "Failed to upload media %s for meeting %s",
                        mf.get("recording_type", "unknown"),
                        meeting_external_id,
                        exc_info=True,
                    )

            processed += 1

        except Exception:
            logger.error(
                "Failed to process meeting %s",
                meeting_external_id,
                exc_info=True,
            )

    logger.info("Batch complete — processed %d / %d meetings", processed, len(meetings))
    return processed


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def bulk_sync() -> None:
    """Run a full (bulk) sync of all Zoom recordings since 2020-01-01."""
    logger.info("Starting Zoom bulk sync")
    db.set_sync_running(PLATFORM)

    try:
        async with ZoomClient() as client:
            total = await _sync_meetings(client, from_date="2020-01-01")

        db.set_sync_complete(PLATFORM, total_synced=total)
        logger.info("Zoom bulk sync complete — %d meetings synced", total)

    except Exception as exc:
        error_msg = f"Bulk sync failed: {exc}"
        logger.error(error_msg, exc_info=True)
        db.set_sync_error(PLATFORM, error_msg)
        raise


async def incremental_sync() -> None:
    """Run an incremental sync starting from the last successful sync timestamp."""
    logger.info("Starting Zoom incremental sync")

    sync_state = db.get_sync_state(PLATFORM)
    if sync_state and sync_state.get("last_synced_at"):
        from_date = sync_state["last_synced_at"][:10]  # YYYY-MM-DD
    else:
        # Fall back to bulk-style start if we have never synced.
        from_date = "2020-01-01"

    logger.info("Incremental sync from_date=%s", from_date)
    db.set_sync_running(PLATFORM)

    try:
        async with ZoomClient() as client:
            total = await _sync_meetings(client, from_date=from_date)

        db.set_sync_complete(PLATFORM, total_synced=total)
        logger.info("Zoom incremental sync complete — %d meetings synced", total)

    except Exception as exc:
        error_msg = f"Incremental sync failed: {exc}"
        logger.error(error_msg, exc_info=True)
        db.set_sync_error(PLATFORM, error_msg)
        raise
