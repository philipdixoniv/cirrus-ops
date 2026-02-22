"""Campaign endpoints: CRUD for campaigns, story linking, and campaign briefs."""

from fastapi import APIRouter, Depends, HTTPException, Query

from cirrus_ops import db
from cirrus_ops.api.deps import get_org_id
from cirrus_ops.api.schemas import (
    BriefCreate,
    BriefResponse,
    CampaignCreate,
    CampaignDetailResponse,
    CampaignResponse,
    CampaignStoryLink,
    CampaignUpdate,
    ContentResponse,
    PaginatedResponse,
    StoryResponse,
)

router = APIRouter()


# -- Campaigns --


@router.get("/", response_model=PaginatedResponse)
def list_campaigns(
    profile_id: str | None = None,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    org_id: str = Depends(get_org_id),
):
    """List campaigns with optional filters and pagination."""
    rows, total = db.list_campaigns(
        org_id=org_id,
        profile_id=profile_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    items = []
    for r in rows:
        stories = db.get_campaign_stories(r["id"])
        content = db.get_campaign_content(r["id"])
        items.append(
            CampaignResponse(
                **r,
                story_count=len(stories),
                content_count=len(content),
            )
        )
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/", response_model=CampaignResponse, status_code=201)
def create_campaign(data: CampaignCreate, org_id: str = Depends(get_org_id)):
    """Create a new campaign."""
    campaign_data = data.model_dump()
    campaign_data["org_id"] = org_id
    result = db.create_campaign(campaign_data)
    return CampaignResponse(**result, story_count=0, content_count=0)


@router.get("/{campaign_id}", response_model=CampaignDetailResponse)
def get_campaign(campaign_id: str, org_id: str = Depends(get_org_id)):
    """Get campaign detail with stories, content, and briefs."""
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign not found: {campaign_id}")

    stories = db.get_campaign_stories(campaign_id)
    content = db.get_campaign_content(campaign_id)
    briefs_rows, _ = db.list_briefs(campaign_id=campaign_id, limit=200)

    return CampaignDetailResponse(
        **campaign,
        story_count=len(stories),
        content_count=len(content),
        stories=[StoryResponse(**s) for s in stories],
        content=[ContentResponse(**c) for c in content],
        briefs=[BriefResponse(**b) for b in briefs_rows],
    )


@router.put("/{campaign_id}", response_model=CampaignResponse)
def update_campaign(campaign_id: str, data: CampaignUpdate, org_id: str = Depends(get_org_id)):
    """Update a campaign."""
    existing = db.get_campaign(campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Campaign not found: {campaign_id}")
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    updated = db.update_campaign(campaign_id, update_data)
    stories = db.get_campaign_stories(campaign_id)
    content = db.get_campaign_content(campaign_id)
    return CampaignResponse(**updated, story_count=len(stories), content_count=len(content))


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(campaign_id: str, org_id: str = Depends(get_org_id)):
    """Delete a campaign."""
    existing = db.get_campaign(campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Campaign not found: {campaign_id}")
    db.delete_campaign(campaign_id)
    return None


# -- Campaign-Story links --


@router.post("/{campaign_id}/stories", status_code=201)
def add_story_to_campaign(campaign_id: str, data: CampaignStoryLink, org_id: str = Depends(get_org_id)):
    """Link a story to a campaign."""
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign not found: {campaign_id}")
    story = db.get_story(data.story_id)
    if not story:
        raise HTTPException(status_code=404, detail=f"Story not found: {data.story_id}")
    try:
        db.add_story_to_campaign(campaign_id, data.story_id)
    except Exception:
        raise HTTPException(status_code=409, detail="Story already linked to this campaign")
    return {"status": "linked"}


@router.delete("/{campaign_id}/stories/{story_id}", status_code=204)
def remove_story_from_campaign(campaign_id: str, story_id: str, org_id: str = Depends(get_org_id)):
    """Unlink a story from a campaign."""
    db.remove_story_from_campaign(campaign_id, story_id)
    return None


# -- Campaign briefs --


@router.get("/{campaign_id}/briefs", response_model=list[BriefResponse])
def list_campaign_briefs(campaign_id: str, org_id: str = Depends(get_org_id)):
    """List all briefs for a campaign."""
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign not found: {campaign_id}")
    rows, _ = db.list_briefs(campaign_id=campaign_id, limit=200)
    return [BriefResponse(**r) for r in rows]


@router.post("/{campaign_id}/briefs", response_model=BriefResponse, status_code=201)
def create_campaign_brief(campaign_id: str, data: BriefCreate, org_id: str = Depends(get_org_id)):
    """Create a brief tied to a campaign."""
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign not found: {campaign_id}")
    brief_data = data.model_dump()
    brief_data["campaign_id"] = campaign_id
    brief_data["org_id"] = org_id
    result = db.create_brief(brief_data)
    return BriefResponse(**result)
