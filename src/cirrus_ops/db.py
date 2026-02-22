"""Supabase client wrapper for database and storage operations."""

from __future__ import annotations

import json
import re
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


# -- Profile operations --


def get_profile(name: str) -> dict[str, Any] | None:
    """Fetch a mining profile by name."""
    result = client().table("mining_profiles").select("*").eq("name", name).execute()
    return result.data[0] if result.data else None


def get_profile_by_id(profile_id: str) -> dict[str, Any] | None:
    """Fetch a mining profile by ID."""
    result = client().table("mining_profiles").select("*").eq("id", profile_id).execute()
    return result.data[0] if result.data else None


def list_profiles() -> list[dict[str, Any]]:
    """List all mining profiles."""
    result = (
        client()
        .table("mining_profiles")
        .select("*")
        .order("created_at")
        .execute()
    )
    return result.data


def create_profile(data: dict[str, Any]) -> dict[str, Any]:
    """Create a new mining profile."""
    result = client().table("mining_profiles").insert(data).execute()
    return result.data[0]


def update_profile(profile_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update a mining profile."""
    result = (
        client()
        .table("mining_profiles")
        .update(data)
        .eq("id", profile_id)
        .execute()
    )
    return result.data[0]


def delete_profile(profile_id: str) -> None:
    """Delete a mining profile."""
    client().table("mining_profiles").delete().eq("id", profile_id).execute()


# -- Profile content type operations --


def get_profile_content_types(profile_id: str) -> list[dict[str, Any]]:
    """Fetch all content types for a profile."""
    result = (
        client()
        .table("profile_content_types")
        .select("*")
        .eq("profile_id", profile_id)
        .order("name")
        .execute()
    )
    return result.data


def get_profile_content_type(profile_id: str, name: str) -> dict[str, Any] | None:
    """Fetch a single content type by profile_id and name."""
    result = (
        client()
        .table("profile_content_types")
        .select("*")
        .eq("profile_id", profile_id)
        .eq("name", name)
        .execute()
    )
    return result.data[0] if result.data else None


def create_profile_content_type(data: dict[str, Any]) -> dict[str, Any]:
    """Create a content type for a profile."""
    result = client().table("profile_content_types").insert(data).execute()
    return result.data[0]


def update_profile_content_type(ct_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update a profile content type."""
    result = (
        client()
        .table("profile_content_types")
        .update(data)
        .eq("id", ct_id)
        .execute()
    )
    return result.data[0]


def delete_profile_content_type(ct_id: str) -> None:
    """Delete a profile content type."""
    client().table("profile_content_types").delete().eq("id", ct_id).execute()


# -- Profile knowledge operations --


def get_profile_knowledge(
    profile_id: str, usage: str | None = None
) -> list[dict[str, Any]]:
    """Fetch knowledge docs for a profile, optionally filtered by usage.

    Args:
        profile_id: The profile UUID.
        usage: If set, filter to docs where usage matches this value or 'both'.
    """
    query = (
        client()
        .table("profile_knowledge")
        .select("*")
        .eq("profile_id", profile_id)
    )
    if usage and usage != "both":
        query = query.in_("usage", [usage, "both"])
    result = query.order("sort_order").execute()
    return result.data


def create_profile_knowledge(data: dict[str, Any]) -> dict[str, Any]:
    """Create a knowledge doc for a profile."""
    result = client().table("profile_knowledge").insert(data).execute()
    return result.data[0]


def update_profile_knowledge(knowledge_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update a profile knowledge doc."""
    result = (
        client()
        .table("profile_knowledge")
        .update(data)
        .eq("id", knowledge_id)
        .execute()
    )
    return result.data[0]


def delete_profile_knowledge(knowledge_id: str) -> None:
    """Delete a profile knowledge doc."""
    client().table("profile_knowledge").delete().eq("id", knowledge_id).execute()


# -- Filtered queries for browse API --


def list_meetings(
    platform: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """List meetings with optional filters and pagination. Returns (rows, total_count)."""
    query = client().table("meetings").select("*", count="exact")
    if platform:
        query = query.eq("platform", platform)
    if since:
        query = query.gte("started_at", since)
    if until:
        query = query.lte("started_at", until)
    result = query.order("started_at", desc=True).range(offset, offset + limit - 1).execute()
    return result.data, result.count or 0


def list_stories(
    meeting_id: str | None = None,
    profile_id: str | None = None,
    theme: str | None = None,
    sentiment: str | None = None,
    min_confidence: float | None = None,
    persona: str | None = None,
    funnel_stage: str | None = None,
    campaign_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """List stories with optional filters. Returns (rows, total_count)."""
    query = client().table("extracted_stories").select("*", count="exact")
    if meeting_id:
        query = query.eq("meeting_id", meeting_id)
    if profile_id:
        query = query.eq("profile_id", profile_id)
    if theme:
        query = query.filter("themes", "cs", json.dumps([theme]))
    if sentiment:
        query = query.eq("sentiment", sentiment)
    if min_confidence is not None:
        query = query.gte("confidence_score", min_confidence)
    if persona:
        query = query.filter("personas", "cs", json.dumps([persona]))
    if funnel_stage:
        query = query.eq("funnel_stage", funnel_stage)
    if campaign_id:
        # Filter to stories linked to this campaign via junction table
        junction = (
            client()
            .table("campaign_stories")
            .select("story_id")
            .eq("campaign_id", campaign_id)
            .execute()
        )
        story_ids = [r["story_id"] for r in junction.data]
        if not story_ids:
            return [], 0
        query = query.in_("id", story_ids)
    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return result.data, result.count or 0


def list_content(
    profile_id: str | None = None,
    content_type: str | None = None,
    status: str | None = None,
    persona: str | None = None,
    funnel_stage: str | None = None,
    campaign_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """List generated content with optional filters. Returns (rows, total_count)."""
    query = client().table("generated_content").select("*", count="exact")
    if profile_id:
        query = query.eq("profile_id", profile_id)
    if content_type:
        query = query.eq("content_type", content_type)
    if status:
        query = query.eq("status", status)
    if persona:
        query = query.filter("personas", "cs", json.dumps([persona]))
    if funnel_stage:
        query = query.eq("funnel_stage", funnel_stage)
    if campaign_id:
        query = query.eq("campaign_id", campaign_id)
    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return result.data, result.count or 0


# -- Content Studio operations --


def get_content(content_id: str) -> dict[str, Any] | None:
    """Fetch a single content record by ID."""
    result = client().table("generated_content").select("*").eq("id", content_id).execute()
    return result.data[0] if result.data else None


def update_content(content_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update content text, status, tone, or other fields."""
    result = (
        client()
        .table("generated_content")
        .update(data)
        .eq("id", content_id)
        .execute()
    )
    return result.data[0]


def get_content_versions(story_id: str, content_type: str) -> list[dict[str, Any]]:
    """List all versions of a content piece for a given story and content type."""
    result = (
        client()
        .table("generated_content")
        .select("*")
        .eq("story_id", story_id)
        .eq("content_type", content_type)
        .order("version", desc=True)
        .execute()
    )
    return result.data


def search_stories(query: str, limit: int = 20, offset: int = 0) -> tuple[list[dict[str, Any]], int]:
    """Search stories by title, summary, or story_text using ilike."""
    pattern = f"%{query}%"
    result = (
        client()
        .table("extracted_stories")
        .select("*", count="exact")
        .or_(f"title.ilike.{pattern},summary.ilike.{pattern},story_text.ilike.{pattern}")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data, result.count or 0


def search_content(query: str, limit: int = 20, offset: int = 0) -> tuple[list[dict[str, Any]], int]:
    """Search generated content by content text using ilike."""
    pattern = f"%{query}%"
    result = (
        client()
        .table("generated_content")
        .select("*", count="exact")
        .ilike("content", pattern)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data, result.count or 0


def get_theme_counts() -> list[dict[str, Any]]:
    """Get all unique themes with story counts via RPC or manual aggregation."""
    result = (
        client()
        .table("extracted_stories")
        .select("themes")
        .execute()
    )
    counts: dict[str, int] = {}
    for row in result.data:
        for theme in (row.get("themes") or []):
            counts[theme] = counts.get(theme, 0) + 1
    return [{"theme": t, "count": c} for t, c in sorted(counts.items(), key=lambda x: -x[1])]


def get_themes_over_time(months: int = 12) -> list[dict[str, Any]]:
    """Get theme counts grouped by month for the last N months."""
    result = (
        client()
        .table("extracted_stories")
        .select("themes, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    from collections import defaultdict
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in result.data:
        created = row.get("created_at", "")
        month = created[:7] if created else "unknown"
        for theme in (row.get("themes") or []):
            buckets[month][theme] += 1

    points = []
    for month, themes in sorted(buckets.items()):
        for theme, count in themes.items():
            points.append({"month": month, "theme": theme, "count": count})
    return points[-months * 20:] if len(points) > months * 20 else points


def get_sentiment_breakdown(profile_id: str | None = None) -> list[dict[str, Any]]:
    """Get sentiment distribution across stories."""
    query = client().table("extracted_stories").select("sentiment")
    if profile_id:
        query = query.eq("profile_id", profile_id)
    result = query.execute()

    counts: dict[str, int] = {}
    total = 0
    for row in result.data:
        s = row.get("sentiment") or "unknown"
        counts[s] = counts.get(s, 0) + 1
        total += 1

    return [
        {"sentiment": s, "count": c, "percentage": round(c / total * 100, 1) if total else 0}
        for s, c in sorted(counts.items(), key=lambda x: -x[1])
    ]


def get_top_companies(limit: int = 10) -> list[dict[str, Any]]:
    """Get most-mentioned customer companies."""
    result = (
        client()
        .table("extracted_stories")
        .select("customer_company")
        .not_.is_("customer_company", "null")
        .execute()
    )
    counts: dict[str, int] = {}
    for row in result.data:
        company = row.get("customer_company")
        if company:
            counts[company] = counts.get(company, 0) + 1
    ranked = sorted(counts.items(), key=lambda x: -x[1])[:limit]
    return [{"company": c, "story_count": n} for c, n in ranked]


def get_content_pipeline(profile_id: str | None = None) -> list[dict[str, Any]]:
    """Get content counts by status."""
    query = client().table("generated_content").select("status")
    if profile_id:
        query = query.eq("profile_id", profile_id)
    result = query.execute()

    counts: dict[str, int] = {}
    for row in result.data:
        s = row.get("status") or "draft"
        counts[s] = counts.get(s, 0) + 1
    return [{"status": s, "count": c} for s, c in counts.items()]


def count_stories() -> int:
    """Count total extracted stories."""
    result = client().table("extracted_stories").select("id", count="exact").execute()
    return result.count or 0


def count_content() -> int:
    """Count total generated content."""
    result = client().table("generated_content").select("id", count="exact").execute()
    return result.count or 0


def get_next_version(story_id: str, content_type: str) -> int:
    """Get the next version number for a story+content_type pair."""
    result = (
        client()
        .table("generated_content")
        .select("version")
        .eq("story_id", story_id)
        .eq("content_type", content_type)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return (result.data[0].get("version") or 0) + 1
    return 1


# -- Prompt preset operations --


def list_presets(profile_id: str) -> list[dict[str, Any]]:
    """List prompt presets for a profile."""
    result = (
        client()
        .table("prompt_presets")
        .select("*")
        .eq("profile_id", profile_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def create_preset(data: dict[str, Any]) -> dict[str, Any]:
    """Create a prompt preset."""
    result = client().table("prompt_presets").insert(data).execute()
    return result.data[0]


def delete_preset(preset_id: str) -> None:
    """Delete a prompt preset."""
    client().table("prompt_presets").delete().eq("id", preset_id).execute()


# -- Quote extraction --


_QUOTE_RE = re.compile(r'["\u201c\u201d]([^"\u201c\u201d]{20,300})["\u201c\u201d]')


def get_quotes(
    theme: str | None = None,
    company: str | None = None,
    sentiment: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """Scan stories for quoted text, return quotes with attribution."""
    query = client().table("extracted_stories").select("id, title, story_text, customer_name, customer_company, themes, sentiment")
    if theme:
        query = query.filter("themes", "cs", json.dumps([theme]))
    if company:
        query = query.ilike("customer_company", f"%{company}%")
    if sentiment:
        query = query.eq("sentiment", sentiment)
    result = query.order("created_at", desc=True).execute()

    quotes: list[dict[str, Any]] = []
    for row in result.data:
        text = row.get("story_text") or ""
        for match in _QUOTE_RE.finditer(text):
            quotes.append({
                "quote": match.group(1),
                "customer_name": row.get("customer_name"),
                "customer_company": row.get("customer_company"),
                "story_id": row["id"],
                "story_title": row.get("title", ""),
                "themes": row.get("themes") or [],
                "sentiment": row.get("sentiment"),
            })

    total = len(quotes)
    return quotes[offset : offset + limit], total


# -- Competitor mentions --

COMPETITORS = [
    "Gong", "Clari", "Outreach", "SalesLoft", "ZoomInfo",
    "Apollo", "Groove", "Calendly", "Chili Piper", "Salesforce",
]


def get_competitor_mentions(limit: int = 20) -> list[dict[str, Any]]:
    """Scan story_text for known competitor names, aggregate counts."""
    result = (
        client()
        .table("extracted_stories")
        .select("id, story_text")
        .execute()
    )

    mentions: dict[str, dict[str, Any]] = {
        c: {"competitor": c, "count": 0, "story_ids": []} for c in COMPETITORS
    }

    for row in result.data:
        text = (row.get("story_text") or "").lower()
        for comp in COMPETITORS:
            if comp.lower() in text:
                mentions[comp]["count"] += 1
                mentions[comp]["story_ids"].append(row["id"])

    ranked = sorted(mentions.values(), key=lambda x: -x["count"])
    return [m for m in ranked if m["count"] > 0][:limit]


# -- Activity feed --


# -- Campaign operations --


def create_campaign(data: dict[str, Any]) -> dict[str, Any]:
    """Create a new campaign."""
    result = client().table("campaigns").insert(data).execute()
    return result.data[0]


def get_campaign(campaign_id: str) -> dict[str, Any] | None:
    """Fetch a single campaign by ID."""
    result = client().table("campaigns").select("*").eq("id", campaign_id).execute()
    return result.data[0] if result.data else None


def list_campaigns(
    profile_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """List campaigns with optional filters. Returns (rows, total_count)."""
    query = client().table("campaigns").select("*", count="exact")
    if profile_id:
        query = query.eq("profile_id", profile_id)
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return result.data, result.count or 0


def update_campaign(campaign_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update a campaign."""
    result = (
        client()
        .table("campaigns")
        .update(data)
        .eq("id", campaign_id)
        .execute()
    )
    return result.data[0]


def delete_campaign(campaign_id: str) -> None:
    """Delete a campaign."""
    client().table("campaigns").delete().eq("id", campaign_id).execute()


# -- Campaign-Story link operations --


def add_story_to_campaign(campaign_id: str, story_id: str) -> dict[str, Any]:
    """Link a story to a campaign."""
    result = (
        client()
        .table("campaign_stories")
        .insert({"campaign_id": campaign_id, "story_id": story_id})
        .execute()
    )
    return result.data[0]


def remove_story_from_campaign(campaign_id: str, story_id: str) -> None:
    """Unlink a story from a campaign."""
    (
        client()
        .table("campaign_stories")
        .delete()
        .eq("campaign_id", campaign_id)
        .eq("story_id", story_id)
        .execute()
    )


def get_campaign_stories(campaign_id: str) -> list[dict[str, Any]]:
    """Get all stories linked to a campaign."""
    junction = (
        client()
        .table("campaign_stories")
        .select("story_id")
        .eq("campaign_id", campaign_id)
        .execute()
    )
    story_ids = [r["story_id"] for r in junction.data]
    if not story_ids:
        return []
    result = (
        client()
        .table("extracted_stories")
        .select("*")
        .in_("id", story_ids)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def get_campaign_content(campaign_id: str) -> list[dict[str, Any]]:
    """Get all content assigned to a campaign."""
    result = (
        client()
        .table("generated_content")
        .select("*")
        .eq("campaign_id", campaign_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


# -- Brief operations --


def create_brief(data: dict[str, Any]) -> dict[str, Any]:
    """Create a content brief."""
    result = client().table("content_briefs").insert(data).execute()
    return result.data[0]


def get_brief(brief_id: str) -> dict[str, Any] | None:
    """Fetch a single content brief by ID."""
    result = client().table("content_briefs").select("*").eq("id", brief_id).execute()
    return result.data[0] if result.data else None


def list_briefs(
    profile_id: str | None = None,
    campaign_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """List content briefs with optional filters. Returns (rows, total_count)."""
    query = client().table("content_briefs").select("*", count="exact")
    if profile_id:
        query = query.eq("profile_id", profile_id)
    if campaign_id:
        query = query.eq("campaign_id", campaign_id)
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return result.data, result.count or 0


def update_brief(brief_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update a content brief."""
    result = (
        client()
        .table("content_briefs")
        .update(data)
        .eq("id", brief_id)
        .execute()
    )
    return result.data[0]


def delete_brief(brief_id: str) -> None:
    """Delete a content brief."""
    client().table("content_briefs").delete().eq("id", brief_id).execute()


# -- Approval operations --


def init_approval_chain(content_id: str, stages: list[str]) -> dict[str, Any]:
    """Initialize approval chain on a content record with pending steps."""
    chain = [
        {"stage": stage, "status": "pending", "approved_by": None, "notes": None, "timestamp": None}
        for stage in stages
    ]
    return update_content(content_id, {"approval_chain": chain})


def advance_approval(
    content_id: str, stage: str, approved_by: str, notes: str | None = None
) -> dict[str, Any]:
    """Mark an approval step as approved."""
    content = get_content(content_id)
    if not content:
        raise ValueError(f"Content not found: {content_id}")
    chain = content.get("approval_chain") or []
    for step in chain:
        if step["stage"] == stage:
            step["status"] = "approved"
            step["approved_by"] = approved_by
            step["notes"] = notes
            step["timestamp"] = datetime.utcnow().isoformat()
            break
    return update_content(content_id, {"approval_chain": chain})


def reject_approval(
    content_id: str, stage: str, rejected_by: str, notes: str | None = None
) -> dict[str, Any]:
    """Mark an approval step as rejected."""
    content = get_content(content_id)
    if not content:
        raise ValueError(f"Content not found: {content_id}")
    chain = content.get("approval_chain") or []
    for step in chain:
        if step["stage"] == stage:
            step["status"] = "rejected"
            step["approved_by"] = rejected_by
            step["notes"] = notes
            step["timestamp"] = datetime.utcnow().isoformat()
            break
    return update_content(content_id, {"approval_chain": chain})


def get_recent_activity(limit: int = 15) -> list[dict[str, Any]]:
    """Get recent stories + content ordered by created_at."""
    stories_result = (
        client()
        .table("extracted_stories")
        .select("id, title, created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    content_result = (
        client()
        .table("generated_content")
        .select("id, content_type, status, story_id, created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    items: list[dict[str, Any]] = []
    for s in stories_result.data:
        items.append({
            "type": "story_extracted",
            "title": s.get("title", "Untitled"),
            "detail": "New story extracted",
            "entity_id": s["id"],
            "created_at": s.get("created_at", ""),
        })
    for c in content_result.data:
        ct = (c.get("content_type") or "content").replace("_", " ").title()
        items.append({
            "type": "content_generated",
            "title": f"{ct} generated",
            "detail": f"Status: {c.get('status', 'draft')}",
            "entity_id": c.get("story_id", c["id"]),
            "created_at": c.get("created_at", ""),
        })

    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items[:limit]
