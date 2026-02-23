from __future__ import annotations
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field
import uuid


class TranscriptSegment(BaseModel):
    speaker: str | None = None
    text: str
    start_time: float | None = None  # seconds
    end_time: float | None = None


class Meeting(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    platform: Literal["gong", "zoom"]
    external_id: str
    title: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: int | None = None
    host_name: str | None = None
    host_email: str | None = None
    meeting_url: str | None = None
    raw_metadata: dict[str, Any] = Field(default_factory=dict)


class Participant(BaseModel):
    name: str | None = None
    email: str | None = None
    company: str | None = None
    role: str | None = None
    is_customer: bool = False
    speaker_id: str | None = None
    raw_metadata: dict[str, Any] = Field(default_factory=dict)


class Transcript(BaseModel):
    meeting_id: str
    full_text: str | None = None
    segments: list[TranscriptSegment] = Field(default_factory=list)
    word_count: int | None = None
    language: str = "en"


class MediaRef(BaseModel):
    meeting_id: str
    media_type: str
    storage_path: str
    file_size_bytes: int | None = None
    duration_seconds: int | None = None
    format: str | None = None
    source_url: str | None = None


class ExtractedStory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    meeting_id: str
    title: str
    summary: str | None = None
    story_text: str | None = None
    themes: list[str] = Field(default_factory=list)
    customer_name: str | None = None
    customer_company: str | None = None
    sentiment: str | None = None
    confidence_score: float | None = None
    raw_analysis: dict[str, Any] = Field(default_factory=dict)


class GeneratedContent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    story_id: str
    content_type: str  # linkedin_post, book_excerpt, tweet, blog_post
    content: str
    status: Literal["draft", "reviewed", "published"] = "draft"
    platform_target: str | None = None


class SyncState(BaseModel):
    platform: Literal["gong", "zoom"]
    last_synced_at: datetime | None = None
    last_cursor: str | None = None
    total_synced: int = 0
    status: Literal["idle", "running", "error"] = "idle"
    error_message: str | None = None
