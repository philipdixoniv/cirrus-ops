"""Content generation from extracted customer stories using Claude."""

import logging

import anthropic

from cirrus_ops.config import settings
from cirrus_ops.mining.prompts import CONTENT_GENERATION_SYSTEM, CONTENT_TYPE_PROMPTS
from cirrus_ops import db

logger = logging.getLogger(__name__)


def generate_content(story_id: str, content_type: str) -> dict:
    """Generate a piece of content from an extracted story using Claude.

    Args:
        story_id: The unique identifier of the extracted story.
        content_type: The type of content to generate. Must be one of:
            ``linkedin_post``, ``book_excerpt``, ``tweet``, ``blog_post``.

    Returns:
        A dict representing the inserted generated-content record.

    Raises:
        ValueError: If the story is not found or the content type is invalid.
    """
    logger.info(
        "Generating %s content for story %s", content_type, story_id
    )

    story = db.get_story(story_id)
    if story is None:
        raise ValueError(f"Story not found: {story_id}")

    if content_type not in CONTENT_TYPE_PROMPTS:
        raise ValueError(
            f"Invalid content_type '{content_type}'. "
            f"Must be one of: {', '.join(CONTENT_TYPE_PROMPTS.keys())}"
        )

    prompt_template = CONTENT_TYPE_PROMPTS[content_type]

    # Format the prompt with story data, providing safe defaults for
    # fields that may be absent on certain content types (e.g. tweet
    # templates don't use story_text or customer fields).
    user_prompt = prompt_template.format(
        title=story.get("title", ""),
        summary=story.get("summary", ""),
        story_text=story.get("story_text", ""),
        customer_name=story.get("customer_name", "Unknown"),
        customer_company=story.get("customer_company", "Unknown"),
        themes=", ".join(story.get("themes", [])),
    )

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    logger.info("Calling Claude for %s generation (model: %s)", content_type, settings.claude_model)

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=4096,
        system=CONTENT_GENERATION_SYSTEM,
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
    record = db.insert_content({
        "story_id": story_id,
        "content_type": content_type,
        "content": generated_text,
        "status": "draft",
        "platform_target": content_type.split("_")[0] if "_" in content_type else content_type,
    })

    logger.info(
        "Inserted generated content record (type=%s, story=%s)",
        content_type,
        story_id,
    )

    return record


def batch_generate(story_id: str, content_types: list[str]) -> list[dict]:
    """Generate multiple content types for a single story.

    Args:
        story_id: The unique identifier of the extracted story.
        content_types: A list of content types to generate. Each must be one of:
            ``linkedin_post``, ``book_excerpt``, ``tweet``, ``blog_post``.

    Returns:
        A list of dicts, one per generated content record.

    Raises:
        ValueError: If the story is not found or any content type is invalid.
    """
    logger.info(
        "Batch generating %d content types for story %s",
        len(content_types),
        story_id,
    )

    # Validate the story exists once up front
    story = db.get_story(story_id)
    if story is None:
        raise ValueError(f"Story not found: {story_id}")

    # Validate all content types before starting
    invalid = [ct for ct in content_types if ct not in CONTENT_TYPE_PROMPTS]
    if invalid:
        raise ValueError(
            f"Invalid content type(s): {', '.join(invalid)}. "
            f"Must be one of: {', '.join(CONTENT_TYPE_PROMPTS.keys())}"
        )

    results: list[dict] = []
    for content_type in content_types:
        try:
            record = generate_content(story_id, content_type)
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
