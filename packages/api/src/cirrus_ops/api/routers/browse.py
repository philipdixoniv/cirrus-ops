"""Browse endpoints: list and filter meetings, stories, and content."""

from fastapi import APIRouter, Depends, HTTPException, Query

from cirrus_ops import db
from cirrus_ops.api.deps import get_org_id
from cirrus_ops.api.schemas import (
    ActivityItem,
    ApprovalActionRequest,
    CompanyCount,
    CompetitorMention,
    ContentResponse,
    ContentUpdateRequest,
    InitApprovalRequest,
    MeetingDetailResponse,
    MeetingResponse,
    PaginatedResponse,
    PipelineStatus,
    PresetCreate,
    PresetResponse,
    QuoteItem,
    SearchResponse,
    SentimentBreakdown,
    StoryResponse,
    ThemeCount,
    TimeSeriesPoint,
)

router = APIRouter()


# -- Meetings --


@router.get("/meetings", response_model=PaginatedResponse)
def list_meetings(
    platform: str | None = None,
    since: str | None = Query(None, description="ISO date string (YYYY-MM-DD)"),
    until: str | None = Query(None, description="ISO date string (YYYY-MM-DD)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    org_id: str = Depends(get_org_id),
):
    """List meetings with optional filters and pagination."""
    rows, total = db.list_meetings(
        org_id=org_id,
        platform=platform,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
    items = [MeetingResponse(**r) for r in rows]
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/meetings/{meeting_id}", response_model=MeetingDetailResponse)
def get_meeting(meeting_id: str, org_id: str = Depends(get_org_id)):
    """Get meeting details including participants and transcript info."""
    meeting = db.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail=f"Meeting not found: {meeting_id}")

    # Get participants
    participants_result = (
        db.client()
        .table("participants")
        .select("name, email, company, role, is_customer")
        .eq("meeting_id", meeting_id)
        .execute()
    )

    # Get transcript info
    transcript = db.get_transcript(meeting_id)

    # Get story count
    _, story_count = db.list_stories(org_id=org_id, meeting_id=meeting_id, limit=1, offset=0)

    return MeetingDetailResponse(
        **meeting,
        participants=participants_result.data,
        has_transcript=transcript is not None and bool(transcript.get("full_text")),
        word_count=transcript.get("word_count") if transcript else None,
        story_count=story_count,
    )


# -- Stories --


@router.get("/stories", response_model=PaginatedResponse)
def list_stories(
    meeting_id: str | None = None,
    profile_id: str | None = None,
    theme: str | None = None,
    sentiment: str | None = None,
    min_confidence: float | None = Query(None, ge=0.0, le=1.0),
    persona: str | None = None,
    funnel_stage: str | None = None,
    campaign_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    org_id: str = Depends(get_org_id),
):
    """List stories with optional filters and pagination."""
    rows, total = db.list_stories(
        org_id=org_id,
        meeting_id=meeting_id,
        profile_id=profile_id,
        theme=theme,
        sentiment=sentiment,
        min_confidence=min_confidence,
        persona=persona,
        funnel_stage=funnel_stage,
        campaign_id=campaign_id,
        limit=limit,
        offset=offset,
    )
    items = [StoryResponse(**r) for r in rows]
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/stories/{story_id}", response_model=StoryResponse)
def get_story(story_id: str, org_id: str = Depends(get_org_id)):
    """Get a story by ID."""
    story = db.get_story(story_id)
    if not story:
        raise HTTPException(status_code=404, detail=f"Story not found: {story_id}")
    return story


@router.get("/stories/{story_id}/content", response_model=list[ContentResponse])
def get_story_content(story_id: str, org_id: str = Depends(get_org_id)):
    """Get all generated content for a story."""
    story = db.get_story(story_id)
    if not story:
        raise HTTPException(status_code=404, detail=f"Story not found: {story_id}")
    return db.get_content_for_story(story_id)


# -- Content --


@router.get("/content", response_model=PaginatedResponse)
def list_content(
    profile_id: str | None = None,
    content_type: str | None = None,
    status: str | None = None,
    persona: str | None = None,
    funnel_stage: str | None = None,
    campaign_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    org_id: str = Depends(get_org_id),
):
    """List generated content with optional filters and pagination."""
    rows, total = db.list_content(
        org_id=org_id,
        profile_id=profile_id,
        content_type=content_type,
        status=status,
        persona=persona,
        funnel_stage=funnel_stage,
        campaign_id=campaign_id,
        limit=limit,
        offset=offset,
    )
    items = [ContentResponse(**r) for r in rows]
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


# -- Content Studio endpoints --


@router.put("/content/{content_id}", response_model=ContentResponse)
def update_content(content_id: str, data: ContentUpdateRequest, org_id: str = Depends(get_org_id)):
    """Update content text, status, or tone (inline edit)."""
    existing = db.get_content(content_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Content not found: {content_id}")
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    updated = db.update_content(content_id, update_data)
    return updated


@router.get("/content/{content_id}/versions", response_model=list[ContentResponse])
def get_content_versions(content_id: str, org_id: str = Depends(get_org_id)):
    """List all versions of a content piece."""
    content = db.get_content(content_id)
    if not content:
        raise HTTPException(status_code=404, detail=f"Content not found: {content_id}")
    versions = db.get_content_versions(content["story_id"], content["content_type"])
    return versions


@router.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    org_id: str = Depends(get_org_id),
):
    """Full-text search across stories and content."""
    stories, story_total = db.search_stories(q, org_id=org_id, limit=limit, offset=offset)
    content, content_total = db.search_content(q, org_id=org_id, limit=limit, offset=offset)
    return SearchResponse(
        stories=stories,
        content=content,
        total=story_total + content_total,
    )


@router.get("/themes", response_model=list[ThemeCount])
def list_themes(org_id: str = Depends(get_org_id)):
    """List all unique themes with story counts."""
    return db.get_theme_counts(org_id=org_id)


# -- Analytics endpoints --


@router.get("/analytics/themes-over-time", response_model=list[TimeSeriesPoint])
def themes_over_time(months: int = Query(12, ge=1, le=36), org_id: str = Depends(get_org_id)):
    """Theme frequency by month."""
    return db.get_themes_over_time(months=months, org_id=org_id)


@router.get("/analytics/sentiment-breakdown", response_model=list[SentimentBreakdown])
def sentiment_breakdown(profile_id: str | None = None, org_id: str = Depends(get_org_id)):
    """Sentiment distribution across stories."""
    return db.get_sentiment_breakdown(profile_id=profile_id, org_id=org_id)


@router.get("/analytics/top-companies", response_model=list[CompanyCount])
def top_companies(limit: int = Query(10, ge=1, le=50), org_id: str = Depends(get_org_id)):
    """Most-mentioned customer companies."""
    return db.get_top_companies(limit=limit, org_id=org_id)


@router.get("/analytics/content-pipeline", response_model=list[PipelineStatus])
def content_pipeline(profile_id: str | None = None, org_id: str = Depends(get_org_id)):
    """Content counts by status (draft/reviewed/published)."""
    return db.get_content_pipeline(profile_id=profile_id, org_id=org_id)


@router.get("/analytics/overview")
def analytics_overview(org_id: str = Depends(get_org_id)):
    """Overview metrics: total stories, total content, content pipeline."""
    return {
        "total_stories": db.count_stories(org_id=org_id),
        "total_content": db.count_content(org_id=org_id),
        "total_meetings": db.count_meetings(org_id=org_id),
        "pipeline": db.get_content_pipeline(org_id=org_id),
    }


@router.get("/analytics/competitor-mentions", response_model=list[CompetitorMention])
def competitor_mentions(limit: int = Query(20, ge=1, le=50), org_id: str = Depends(get_org_id)):
    """Competitor mention aggregation across stories."""
    return db.get_competitor_mentions(limit=limit, org_id=org_id)


# -- Quotes --


@router.get("/quotes", response_model=PaginatedResponse)
def list_quotes(
    theme: str | None = None,
    company: str | None = None,
    sentiment: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    org_id: str = Depends(get_org_id),
):
    """Customer quotes extracted from stories."""
    rows, total = db.get_quotes(
        org_id=org_id,
        theme=theme,
        company=company,
        sentiment=sentiment,
        limit=limit,
        offset=offset,
    )
    items = [QuoteItem(**r) for r in rows]
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


# -- Activity feed --


@router.get("/activity", response_model=list[ActivityItem])
def recent_activity(limit: int = Query(15, ge=1, le=50), org_id: str = Depends(get_org_id)):
    """Recent activity feed for dashboard."""
    return db.get_recent_activity(limit=limit, org_id=org_id)


# -- Prompt presets --


@router.get("/presets", response_model=list[PresetResponse])
def list_presets(profile_id: str = Query(...), org_id: str = Depends(get_org_id)):
    """List prompt presets for a profile."""
    return db.list_presets(profile_id)


@router.post("/presets", response_model=PresetResponse, status_code=201)
def create_preset(data: PresetCreate, org_id: str = Depends(get_org_id)):
    """Create a prompt preset."""
    return db.create_preset(data.model_dump())


@router.delete("/presets/{preset_id}", status_code=204)
def delete_preset(preset_id: str, org_id: str = Depends(get_org_id)):
    """Delete a prompt preset."""
    db.delete_preset(preset_id)
    return None


# -- Approval workflow --


@router.post("/content/{content_id}/init-approval", response_model=ContentResponse)
def init_approval(content_id: str, data: InitApprovalRequest, org_id: str = Depends(get_org_id)):
    """Initialize approval chain on a content piece."""
    existing = db.get_content(content_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Content not found: {content_id}")
    if not data.stages:
        # Try to get stages from the profile
        profile_id = existing.get("profile_id")
        if profile_id:
            profile = db.get_profile_by_id(profile_id)
            if profile and profile.get("approval_stages"):
                data.stages = profile["approval_stages"]
    if not data.stages:
        raise HTTPException(status_code=400, detail="No approval stages provided or configured on profile")
    updated = db.init_approval_chain(content_id, data.stages)
    return updated


@router.post("/content/{content_id}/approve", response_model=ContentResponse)
def approve_content(content_id: str, data: ApprovalActionRequest, org_id: str = Depends(get_org_id)):
    """Approve a content piece at a specific stage."""
    existing = db.get_content(content_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Content not found: {content_id}")
    try:
        updated = db.advance_approval(content_id, data.stage, data.person, data.notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return updated


@router.post("/content/{content_id}/reject", response_model=ContentResponse)
def reject_content(content_id: str, data: ApprovalActionRequest, org_id: str = Depends(get_org_id)):
    """Reject a content piece at a specific stage."""
    existing = db.get_content(content_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Content not found: {content_id}")
    try:
        updated = db.reject_approval(content_id, data.stage, data.person, data.notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return updated
