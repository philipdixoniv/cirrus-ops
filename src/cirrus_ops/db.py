"""Supabase client wrapper for database and storage operations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from supabase import create_client, Client

from cirrus_ops.config import settings


def get_client() -> Client:
    """Create and return a Supabase client."""
    return create_client(settings.supabase_url, settings.supabase_key)


# Singleton client
_client: Client | None = None


def client() -> Client:
    """Return the singleton Supabase client."""
    global _client
    if _client is None:
        _client = get_client()
    return _client


# -- Meeting operations --


def upsert_meeting(data: dict[str, Any]) -> dict[str, Any]:
    """Upsert a meeting record. Returns the upserted row."""
    result = (
        client()
        .table("meetings")
        .upsert(data, on_conflict="platform,external_id")
        .execute()
    )
    return result.data[0]


def get_meeting(meeting_id: str) -> dict[str, Any] | None:
    """Fetch a single meeting by ID."""
    result = client().table("meetings").select("*").eq("id", meeting_id).execute()
    return result.data[0] if result.data else None


def get_meeting_by_external(platform: str, external_id: str) -> dict[str, Any] | None:
    """Fetch a meeting by platform + external_id."""
    result = (
        client()
        .table("meetings")
        .select("*")
        .eq("platform", platform)
        .eq("external_id", external_id)
        .execute()
    )
    return result.data[0] if result.data else None


def count_meetings(platform: str | None = None) -> int:
    """Count meetings, optionally filtered by platform."""
    query = client().table("meetings").select("id", count="exact")
    if platform:
        query = query.eq("platform", platform)
    result = query.execute()
    return result.count or 0


# -- Participant operations --


def upsert_participants(meeting_id: str, participants: list[dict[str, Any]]) -> None:
    """Delete existing participants for a meeting and insert new ones."""
    client().table("participants").delete().eq("meeting_id", meeting_id).execute()
    if participants:
        rows = [{**p, "meeting_id": meeting_id, "id": str(uuid.uuid4())} for p in participants]
        client().table("participants").insert(rows).execute()


# -- Transcript operations --


def upsert_transcript(data: dict[str, Any]) -> dict[str, Any]:
    """Upsert a transcript record (one per meeting)."""
    result = (
        client()
        .table("transcripts")
        .upsert(data, on_conflict="meeting_id")
        .execute()
    )
    return result.data[0]


def get_transcript(meeting_id: str) -> dict[str, Any] | None:
    """Fetch the transcript for a meeting."""
    result = (
        client()
        .table("transcripts")
        .select("*")
        .eq("meeting_id", meeting_id)
        .execute()
    )
    return result.data[0] if result.data else None


# -- Media operations --


def insert_media(data: dict[str, Any]) -> dict[str, Any]:
    """Insert a media reference record."""
    result = client().table("media").insert(data).execute()
    return result.data[0]


def upload_to_storage(bucket: str, path: str, file_bytes: bytes, content_type: str) -> str:
    """Upload a file to Supabase Storage. Returns the storage path."""
    client().storage.from_(bucket).upload(path, file_bytes, {"content-type": content_type})
    return path


# -- Sync state operations --


def get_sync_state(platform: str) -> dict[str, Any] | None:
    """Get the current sync state for a platform."""
    result = (
        client()
        .table("sync_state")
        .select("*")
        .eq("platform", platform)
        .execute()
    )
    return result.data[0] if result.data else None


def update_sync_state(platform: str, **kwargs: Any) -> None:
    """Update sync state fields for a platform."""
    client().table("sync_state").update(kwargs).eq("platform", platform).execute()


def set_sync_running(platform: str) -> None:
    """Mark a sync as running."""
    update_sync_state(platform, status="running", error_message=None)


def set_sync_complete(platform: str, total_synced: int, last_cursor: str | None = None) -> None:
    """Mark a sync as complete."""
    update_sync_state(
        platform,
        status="idle",
        last_synced_at=datetime.utcnow().isoformat(),
        total_synced=total_synced,
        last_cursor=last_cursor,
    )


def set_sync_error(platform: str, error_message: str) -> None:
    """Mark a sync as errored."""
    update_sync_state(platform, status="error", error_message=error_message)


# -- Story / content operations --


def insert_story(data: dict[str, Any]) -> dict[str, Any]:
    """Insert an extracted story."""
    result = client().table("extracted_stories").insert(data).execute()
    return result.data[0]


def get_stories(meeting_id: str | None = None) -> list[dict[str, Any]]:
    """Fetch extracted stories, optionally filtered by meeting."""
    query = client().table("extracted_stories").select("*")
    if meeting_id:
        query = query.eq("meeting_id", meeting_id)
    result = query.order("created_at", desc=True).execute()
    return result.data


def get_story(story_id: str) -> dict[str, Any] | None:
    """Fetch a single story by ID."""
    result = client().table("extracted_stories").select("*").eq("id", story_id).execute()
    return result.data[0] if result.data else None


def insert_content(data: dict[str, Any]) -> dict[str, Any]:
    """Insert generated content."""
    result = client().table("generated_content").insert(data).execute()
    return result.data[0]


def get_content_for_story(story_id: str) -> list[dict[str, Any]]:
    """Fetch all generated content for a story."""
    result = (
        client()
        .table("generated_content")
        .select("*")
        .eq("story_id", story_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data
