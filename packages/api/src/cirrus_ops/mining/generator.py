"""Content generation from extracted customer stories using Claude."""

import logging

import anthropic

from cirrus_ops.config import settings
from cirrus_ops.mining.prompts import CONTENT_GENERATION_SYSTEM, CONTENT_TYPE_PROMPTS
from cirrus_ops.mining import profiles as profile_mod
from cirrus_ops import db

logger = logging.getLogger(__name__)


def generate_content(
    story_id: str,
    content_type: str,
    profile_name: str = "default",
    brief_context: dict | None = None,
    org_id: str | None = None,
) -> dict:
    """Generate a piece of content from an extracted story using Claude.

    Args:
        story_id: The unique identifier of the extracted story.
        content_type: The content type name (e.g., 'linkedin_post').
        profile_name: The mining profile to use (default: "default").
        brief_context: Optional dict with brief objective, key_messages,
            target_personas, and tone_guidance to append to the prompt.
        org_id: Optional org_id to scope profile lookup and tag inserted content.

    Returns:
        A dict representing the inserted generated-content record.

    Raises:
        ValueError: If the story is not found or the content type is invalid.
    """
    logger.info(
        "Generating %s content for story %s (profile: %s)",
        content_type,
        story_id,
        profile_name,
    )

    story = db.get_story(story_id)
    if story is None:
        raise ValueError(f"Story not found: {story_id}")

    # Load profile and resolve content type
    profile = profile_mod.load_profile(profile_name, org_id=org_id)
    profile_id = profile["id"]

    prompt_template, max_tokens = profile_mod.get_content_type_prompt(
        profile, content_type
    )

    # Build grounded system prompt with knowledge
    system_prompt = profile_mod.build_generation_system_prompt(profile)

    # Format the user prompt with story data
    user_prompt = prompt_template.format(
        title=story.get("title", ""),
        summary=story.get("summary", ""),
        story_text=story.get("story_text", ""),
        customer_name=story.get("customer_name", "Unknown"),
        customer_company=story.get("customer_company", "Unknown"),
        themes=", ".join(story.get("themes", [])),
    )

    # Append brief context to user prompt when provided
    if brief_context:
        brief_parts = []
        if brief_context.get("objective"):
            brief_parts.append(f"Content Objective: {brief_context['objective']}")
        if brief_context.get("key_messages"):
            brief_parts.append(
                "Key Messages:\n" + "\n".join(f"- {m}" for m in brief_context["key_messages"])
            )
        if brief_context.get("target_personas"):
            brief_parts.append(
                "Target Personas: " + ", ".join(brief_context["target_personas"])
            )
        if brief_context.get("tone_guidance"):
            brief_parts.append(f"Tone Guidance: {brief_context['tone_guidance']}")
        if brief_parts:
            user_prompt += "\n\n--- Content Brief Context ---\n" + "\n\n".join(brief_parts)

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    logger.info(
        "Calling Claude for %s generation (model: %s, max_tokens: %d)",
        content_type,
        settings.claude_model,
        max_tokens,
    )

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    # Extract the generated text from the response
    generated_text = ""
    for block in response.content:
        if block.type == "text":
            generated_text += block.text

    if not generated_text:
        logger.error("Claude returned no text content for story %s", story_id)
        raise RuntimeError(
            f"Claude returned no text content when generating {content_type} "
            f"for story {story_id}"
        )

    logger.info(
        "Generated %s content for story %s (%d characters)",
        content_type,
        story_id,
        len(generated_text),
    )

    # Persist to the database with draft status
    content_data = {
        "story_id": story_id,
        "profile_id": profile_id,
        "content_type": content_type,
        "content": generated_text,
        "status": "draft",
        "platform_target": content_type.split("_")[0] if "_" in content_type else content_type,
    }
    if org_id:
        content_data["org_id"] = org_id
    record = db.insert_content(content_data)

    logger.info(
        "Inserted generated content record (type=%s, story=%s)",
        content_type,
        story_id,
    )

    return record


def batch_generate(
    story_id: str,
    content_types: list[str],
    profile_name: str = "default",
    org_id: str | None = None,
) -> list[dict]:
    """Generate multiple content types for a single story.

    Args:
        story_id: The unique identifier of the extracted story.
        content_types: A list of content type names to generate.
        profile_name: The mining profile to use (default: "default").
        org_id: Optional org_id to scope profile lookup and tag inserted content.

    Returns:
        A list of dicts, one per generated content record.

    Raises:
        ValueError: If the story is not found or any content type is invalid.
    """
    logger.info(
        "Batch generating %d content types for story %s (profile: %s)",
        len(content_types),
        story_id,
        profile_name,
    )

    # Validate the story exists once up front
    story = db.get_story(story_id)
    if story is None:
        raise ValueError(f"Story not found: {story_id}")

    # Validate all content types against the profile
    profile = profile_mod.load_profile(profile_name, org_id=org_id)
    available = [ct["name"] for ct in profile.get("content_types", [])]
    invalid = [ct for ct in content_types if ct not in available]
    if invalid:
        raise ValueError(
            f"Invalid content type(s): {', '.join(invalid)}. "
            f"Available for profile '{profile_name}': {', '.join(available)}"
        )

    results: list[dict] = []
    for content_type in content_types:
        try:
            record = generate_content(story_id, content_type, profile_name, org_id=org_id)
            results.append(record)
        except Exception:
            logger.exception(
                "Failed to generate %s for story %s", content_type, story_id
            )
            # Continue with remaining content types rather than aborting
            continue

    logger.info(
        "Batch generation complete for story %s: %d/%d succeeded",
        story_id,
        len(results),
        len(content_types),
    )

    return results
