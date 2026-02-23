"""Pydantic request/response models for the Cirrus Ops API."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ============================================================
# Profile schemas
# ============================================================


class ProfileCreate(BaseModel):
    name: str
    display_name: str
    description: str | None = None
    extraction_system_prompt: str
    extraction_user_prompt: str
    themes: list[str] = Field(default_factory=list)
    extraction_tool_schema: dict | None = None
    generation_system_prompt: str
    confidence_threshold: float = 0.5
    is_active: bool = True
    personas: list[str] = Field(default_factory=list)
    approval_stages: list[str] = Field(default_factory=list)
    approvers: list[str] = Field(default_factory=list)


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    extraction_system_prompt: str | None = None
    extraction_user_prompt: str | None = None
    themes: list[str] | None = None
    extraction_tool_schema: dict | None = None
    generation_system_prompt: str | None = None
    confidence_threshold: float | None = None
    is_active: bool | None = None
    personas: list[str] | None = None
    approval_stages: list[str] | None = None
    approvers: list[str] | None = None


class ContentTypeCreate(BaseModel):
    name: str
    display_name: str
    prompt_template: str
    max_tokens: int = 4096


class ContentTypeUpdate(BaseModel):
    display_name: str | None = None
    prompt_template: str | None = None
    max_tokens: int | None = None


class KnowledgeDocCreate(BaseModel):
    name: str
    display_name: str
    content: str
    usage: str = "both"
    sort_order: int = 0


class KnowledgeDocUpdate(BaseModel):
    display_name: str | None = None
    content: str | None = None
    usage: str | None = None
    sort_order: int | None = None


class ContentTypeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    profile_id: str
    name: str
    display_name: str
    prompt_template: str
    max_tokens: int
    created_at: datetime | None = None


class KnowledgeDocResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    profile_id: str
    name: str
    display_name: str
    content: str
    usage: str
    sort_order: int
    created_at: datetime | None = None


class ProfileResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    display_name: str
    description: str | None = None
    extraction_system_prompt: str
    extraction_user_prompt: str
    themes: list[str] = Field(default_factory=list)
    extraction_tool_schema: dict | None = None
    generation_system_prompt: str
    confidence_threshold: float
    is_active: bool
    personas: list[str] = Field(default_factory=list)
    approval_stages: list[str] = Field(default_factory=list)
    approvers: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    content_types: list[ContentTypeResponse] = Field(default_factory=list)
    knowledge: list[KnowledgeDocResponse] = Field(default_factory=list)


class ProfileListResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    display_name: str
    description: str | None = None
    themes: list[str] = Field(default_factory=list)
    confidence_threshold: float
    is_active: bool
    personas: list[str] = Field(default_factory=list)
    approval_stages: list[str] = Field(default_factory=list)
    approvers: list[str] = Field(default_factory=list)
    content_type_count: int = 0
    knowledge_doc_count: int = 0


# ============================================================
# Mining schemas
# ============================================================


class ExtractRequest(BaseModel):
    meeting_id: str
    profile_name: str = "default"


class BatchExtractRequest(BaseModel):
    meeting_ids: list[str]
    profile_name: str = "default"


class GenerateRequest(BaseModel):
    story_id: str
    content_type: str
    profile_name: str = "default"


class BatchGenerateRequest(BaseModel):
    story_id: str
    content_types: list[str]
    profile_name: str = "default"


class StoryResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    meeting_id: str
    profile_id: str | None = None
    title: str
    summary: str | None = None
    story_text: str | None = None
    themes: list[str] = Field(default_factory=list)
    customer_name: str | None = None
    customer_company: str | None = None
    sentiment: str | None = None
    confidence_score: float | None = None
    personas: list[str] = Field(default_factory=list)
    funnel_stage: str | None = None
    created_at: datetime | None = None


class ApprovalStep(BaseModel):
    stage: str
    status: str = "pending"
    approved_by: str | None = None
    notes: str | None = None
    timestamp: str | None = None


class ContentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    story_id: str
    profile_id: str | None = None
    content_type: str
    content: str
    status: str
    platform_target: str | None = None
    tone: str | None = None
    custom_instructions: str | None = None
    version: int | None = 1
    parent_id: str | None = None
    status_note: str | None = None
    campaign_id: str | None = None
    brief_id: str | None = None
    personas: list[str] = Field(default_factory=list)
    funnel_stage: str | None = None
    approval_chain: list[ApprovalStep] = Field(default_factory=list)
    created_at: datetime | None = None


# ============================================================
# Content Studio schemas
# ============================================================


class ContentUpdateRequest(BaseModel):
    content: str | None = None
    status: str | None = None
    tone: str | None = None
    status_note: str | None = None
    campaign_id: str | None = None
    personas: list[str] | None = None
    funnel_stage: str | None = None


class RegenerateRequest(BaseModel):
    content_id: str
    tone: str | None = None
    custom_instructions: str | None = None
    content_type: str | None = None


class SearchResponse(BaseModel):
    stories: list[dict[str, Any]] = Field(default_factory=list)
    content: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0


class ThemeCount(BaseModel):
    theme: str
    count: int


class TimeSeriesPoint(BaseModel):
    month: str
    theme: str
    count: int


class SentimentBreakdown(BaseModel):
    sentiment: str
    count: int
    percentage: float


class CompanyCount(BaseModel):
    company: str
    story_count: int


class PipelineStatus(BaseModel):
    status: str
    count: int


# ============================================================
# Browse schemas
# ============================================================


class MeetingResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    platform: str
    external_id: str
    title: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: int | None = None
    host_name: str | None = None
    host_email: str | None = None
    created_at: datetime | None = None


class MeetingDetailResponse(MeetingResponse):
    participants: list[dict[str, Any]] = Field(default_factory=list)
    has_transcript: bool = False
    word_count: int | None = None
    story_count: int = 0


class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    limit: int
    offset: int


# ============================================================
# Phase 2 schemas
# ============================================================


class PresetCreate(BaseModel):
    profile_id: str
    name: str
    tone: str | None = None
    custom_instructions: str | None = None


class PresetResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    profile_id: str
    name: str
    tone: str | None = None
    custom_instructions: str | None = None
    created_at: datetime | None = None


class CustomerQuoteItem(BaseModel):
    quote: str
    customer_name: str | None = None
    customer_company: str | None = None
    story_id: str
    story_title: str
    themes: list[str] = Field(default_factory=list)
    sentiment: str | None = None


class CompetitorMention(BaseModel):
    competitor: str
    count: int
    story_ids: list[str] = Field(default_factory=list)


class ActivityItem(BaseModel):
    type: str
    title: str
    detail: str
    entity_id: str
    created_at: str


# ============================================================
# Phase 3 schemas — Campaigns, Briefs, Approvals
# ============================================================


class CampaignCreate(BaseModel):
    profile_id: str
    name: str
    description: str | None = None
    target_audience: str | None = None
    status: str = "planning"


class CampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    target_audience: str | None = None
    status: str | None = None


class CampaignResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    profile_id: str
    name: str
    description: str | None = None
    target_audience: str | None = None
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    story_count: int = 0
    content_count: int = 0


class CampaignDetailResponse(CampaignResponse):
    stories: list[StoryResponse] = Field(default_factory=list)
    content: list[ContentResponse] = Field(default_factory=list)
    briefs: list[Any] = Field(default_factory=list)  # Will be BriefResponse once constructed


class CampaignStoryLink(BaseModel):
    story_id: str


class BriefCreate(BaseModel):
    profile_id: str
    campaign_id: str | None = None
    title: str
    objective: str | None = None
    key_messages: list[str] = Field(default_factory=list)
    target_personas: list[str] = Field(default_factory=list)
    tone_guidance: str | None = None
    linked_story_ids: list[str] = Field(default_factory=list)
    status: str = "draft"


class BriefUpdate(BaseModel):
    title: str | None = None
    campaign_id: str | None = None
    objective: str | None = None
    key_messages: list[str] | None = None
    target_personas: list[str] | None = None
    tone_guidance: str | None = None
    linked_story_ids: list[str] | None = None
    status: str | None = None


class BriefResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    profile_id: str
    campaign_id: str | None = None
    title: str
    objective: str | None = None
    key_messages: list[str] = Field(default_factory=list)
    target_personas: list[str] = Field(default_factory=list)
    tone_guidance: str | None = None
    linked_story_ids: list[str] = Field(default_factory=list)
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class GenerateFromBriefRequest(BaseModel):
    brief_id: str
    content_types: list[str]
    profile_name: str = "default"


class ApprovalActionRequest(BaseModel):
    stage: str
    person: str
    notes: str | None = None


class InitApprovalRequest(BaseModel):
    stages: list[str] = Field(default_factory=list)


# ============================================================
# Sales Quotes & Orders schemas
# ============================================================


class SalesQuoteItemInput(BaseModel):
    description: str
    quantity: float = 1
    unit_price: float
    sort_order: int = 0


class SalesQuoteCreate(BaseModel):
    customer_name: str
    customer_company: str | None = None
    customer_email: str | None = None
    discount_pct: float = 0
    notes: str | None = None
    valid_until: str | None = None
    created_by: str | None = None
    items: list[SalesQuoteItemInput] = Field(default_factory=list)


class SalesQuoteUpdate(BaseModel):
    customer_name: str | None = None
    customer_company: str | None = None
    customer_email: str | None = None
    discount_pct: float | None = None
    notes: str | None = None
    valid_until: str | None = None
    items: list[SalesQuoteItemInput] | None = None


class SalesQuoteItemResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    quote_id: str
    description: str
    quantity: float
    unit_price: float
    total: float
    sort_order: int


class SalesQuoteResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    customer_name: str
    customer_company: str | None = None
    customer_email: str | None = None
    status: str
    subtotal: float | None = None
    discount_pct: float | None = 0
    total: float | None = None
    notes: str | None = None
    valid_until: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SalesQuoteDetailResponse(SalesQuoteResponse):
    items: list[SalesQuoteItemResponse] = Field(default_factory=list)


class OrderCreate(BaseModel):
    customer_name: str
    customer_company: str | None = None
    customer_email: str | None = None
    total: float | None = None
    notes: str | None = None
    quote_id: str | None = None


class OrderUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None


class OrderResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    quote_id: str | None = None
    customer_name: str
    customer_company: str | None = None
    customer_email: str | None = None
    status: str
    total: float | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
