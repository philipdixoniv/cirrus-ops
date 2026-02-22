"""Mining endpoints: extract stories and generate content."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from cirrus_ops.api.deps import get_org_id
from cirrus_ops.api.schemas import (
    BatchExtractRequest,
    BatchGenerateRequest,
    ContentResponse,
    ExtractRequest,
    GenerateFromBriefRequest,
    GenerateRequest,
    RegenerateRequest,
    StoryResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/extract", response_model=list[StoryResponse])
def extract(data: ExtractRequest, org_id: str = Depends(get_org_id)):
    """Extract stories from a meeting transcript using a mining profile."""
    from cirrus_ops.mining.extractor import extract_stories

    try:
        stories = extract_stories(data.meeting_id, profile_name=data.profile_name, org_id=org_id)
        return stories
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Extraction failed for meeting %s", data.meeting_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=ContentResponse)
def generate(data: GenerateRequest, org_id: str = Depends(get_org_id)):
    """Generate content from an extracted story using a mining profile."""
    from cirrus_ops.mining.generator import generate_content

    try:
        result = generate_content(
            data.story_id,
            data.content_type,
            profile_name=data.profile_name,
            org_id=org_id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Generation failed for story %s", data.story_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-extract", response_model=list[StoryResponse])
def batch_extract(data: BatchExtractRequest, org_id: str = Depends(get_org_id)):
    """Extract stories from multiple meetings."""
    from cirrus_ops.mining.extractor import extract_stories

    all_stories = []
    errors = []
    for meeting_id in data.meeting_ids:
        try:
            stories = extract_stories(meeting_id, profile_name=data.profile_name, org_id=org_id)
            all_stories.extend(stories)
        except ValueError as e:
            errors.append({"meeting_id": meeting_id, "error": str(e)})
        except Exception as e:
            logger.exception("Extraction failed for meeting %s", meeting_id)
            errors.append({"meeting_id": meeting_id, "error": str(e)})

    if errors:
        logger.warning("Batch extraction had %d errors: %s", len(errors), errors)

    return all_stories


@router.post("/batch-generate", response_model=list[ContentResponse])
def batch_generate(data: BatchGenerateRequest, org_id: str = Depends(get_org_id)):
    """Generate multiple content types for a single story."""
    from cirrus_ops.mining.generator import batch_generate

    try:
        results = batch_generate(
            data.story_id,
            data.content_types,
            profile_name=data.profile_name,
            org_id=org_id,
        )
        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Batch generation failed for story %s", data.story_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-from-brief", response_model=list[ContentResponse])
def generate_from_brief(data: GenerateFromBriefRequest, org_id: str = Depends(get_org_id)):
    """Generate content for each linked story x content type, using brief context in prompt."""
    from cirrus_ops import db
    from cirrus_ops.mining.generator import generate_content

    brief = db.get_brief(data.brief_id)
    if not brief:
        raise HTTPException(status_code=404, detail=f"Brief not found: {data.brief_id}")

    linked_story_ids = brief.get("linked_story_ids") or []
    if not linked_story_ids:
        raise HTTPException(status_code=400, detail="Brief has no linked stories")

    brief_context = {
        "objective": brief.get("objective"),
        "key_messages": brief.get("key_messages") or [],
        "target_personas": brief.get("target_personas") or [],
        "tone_guidance": brief.get("tone_guidance"),
    }

    results = []
    errors = []
    for story_id in linked_story_ids:
        for content_type in data.content_types:
            try:
                record = generate_content(
                    story_id,
                    content_type,
                    profile_name=data.profile_name,
                    brief_context=brief_context,
                    org_id=org_id,
                )
                # Set campaign_id and brief_id on the generated content
                update_data = {"brief_id": data.brief_id}
                if brief.get("campaign_id"):
                    update_data["campaign_id"] = brief["campaign_id"]
                record = db.update_content(record["id"], update_data)
                results.append(record)
            except Exception as e:
                logger.exception(
                    "Generation from brief failed: story=%s type=%s",
                    story_id,
                    content_type,
                )
                errors.append({"story_id": story_id, "content_type": content_type, "error": str(e)})

    if errors:
        logger.warning("Generate-from-brief had %d errors: %s", len(errors), errors)

    # Mark brief as completed if any content was generated
    if results:
        db.update_brief(data.brief_id, {"status": "completed"})

    return results


@router.post("/regenerate", response_model=ContentResponse)
def regenerate(data: RegenerateRequest, org_id: str = Depends(get_org_id)):
    """Regenerate content with new tone/instructions, creating a new version."""
    from cirrus_ops import db
    from cirrus_ops.mining.generator import generate_content

    # Get the original content to use as base
    original = db.get_content(data.content_id)
    if not original:
        raise HTTPException(status_code=404, detail=f"Content not found: {data.content_id}")

    story_id = original["story_id"]
    content_type = data.content_type or original["content_type"]
    profile_id = original.get("profile_id")

    # Look up profile name from profile_id
    profile_name = "default"
    if profile_id:
        profile = db.get_profile_by_id(profile_id)
        if profile:
            profile_name = profile["name"]

    try:
        # Generate new content using the standard generator
        record = generate_content(story_id, content_type, profile_name=profile_name, org_id=org_id)

        # Get next version number and update the record with versioning info
        next_version = db.get_next_version(story_id, content_type)
        update_data = {
            "parent_id": data.content_id,
            "version": next_version,
        }
        if data.tone:
            update_data["tone"] = data.tone
        if data.custom_instructions:
            update_data["custom_instructions"] = data.custom_instructions

        updated = db.update_content(record["id"], update_data)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Regeneration failed for content %s", data.content_id)
        raise HTTPException(status_code=500, detail=str(e))
