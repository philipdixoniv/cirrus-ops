"""Claude-powered story and insight extraction from meeting transcripts."""

import logging
from difflib import SequenceMatcher

import anthropic

from cirrus_ops.config import settings
from cirrus_ops.mining.prompts import STORY_EXTRACTION_SYSTEM, STORY_EXTRACTION_USER
from cirrus_ops import db

logger = logging.getLogger(__name__)

CHUNK_WORD_LIMIT = 80_000
CHUNK_SIZE = 60_000  # words per chunk
CHUNK_OVERLAP = 5_000  # overlap between chunks for context continuity
DEDUP_SIMILARITY_THRESHOLD = 0.8


def _build_tool_schema() -> dict:
    """Return the tool definition dict for structured story extraction."""
    return {
        "name": "extract_stories",
        "description": (
            "Extract customer stories, insights, and notable moments from a "
            "meeting transcript. Returns a structured list of stories."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "stories": {
                    "type": "array",
                    "description": "List of extracted customer stories and insights.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "A clear, descriptive title for the story.",
                            },
                            "summary": {
                                "type": "string",
                                "description": "A 1-2 sentence summary of the story.",
                            },
                            "story_text": {
                                "type": "string",
                                "description": "The relevant portion of the conversation.",
                            },
                            "themes": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": (
                                    "Themes such as pricing, onboarding, support, "
                                    "product-feedback, success-story, pain-point, "
                                    "competitive, integration."
                                ),
                            },
                            "customer_name": {
                                "type": "string",
                                "description": "The customer's name if mentioned.",
                            },
                            "customer_company": {
                                "type": "string",
                                "description": "The customer's company if mentioned.",
                            },
                            "sentiment": {
                                "type": "string",
                                "enum": ["positive", "negative", "neutral", "mixed"],
                                "description": "Overall sentiment of the story.",
                            },
                            "confidence_score": {
                                "type": "number",
                                "description": (
                                    "Confidence (0.0 to 1.0) that this is a genuine, "
                                    "usable customer story."
                                ),
                            },
                        },
                        "required": [
                            "title",
                            "summary",
                            "story_text",
                            "themes",
                            "customer_name",
                            "customer_company",
                            "sentiment",
                            "confidence_score",
                        ],
                    },
                },
            },
            "required": ["stories"],
        },
    }


def _chunk_transcript(transcript: str) -> list[str]:
    """Split a long transcript into overlapping word-based chunks."""
    words = transcript.split()
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = start + CHUNK_SIZE
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += CHUNK_SIZE - CHUNK_OVERLAP
    logger.info("Split transcript into %d chunks", len(chunks))
    return chunks


def _titles_are_similar(title_a: str, title_b: str) -> bool:
    """Check if two story titles are similar enough to be considered duplicates."""
    ratio = SequenceMatcher(None, title_a.lower(), title_b.lower()).ratio()
    return ratio >= DEDUP_SIMILARITY_THRESHOLD


def _deduplicate_stories(stories: list[dict]) -> list[dict]:
    """Remove duplicate stories based on title similarity."""
    unique: list[dict] = []
    for story in stories:
        is_duplicate = False
        for existing in unique:
            if _titles_are_similar(story["title"], existing["title"]):
                # Keep the one with higher confidence
                if story.get("confidence_score", 0) > existing.get("confidence_score", 0):
                    unique.remove(existing)
                    unique.append(story)
                is_duplicate = True
                break
        if not is_duplicate:
            unique.append(story)
    logger.info(
        "Deduplicated %d stories down to %d", len(stories), len(unique)
    )
    return unique


def _call_claude_for_stories(
    client: anthropic.Anthropic,
    transcript: str,
    title: str,
    date: str,
    participants: str,
) -> list[dict]:
    """Call Claude with the extraction prompt and tool, returning parsed stories."""
    user_prompt = STORY_EXTRACTION_USER.format(
        title=title,
        date=date,
        participants=participants,
        transcript=transcript,
    )

    tool_schema = _build_tool_schema()

    logger.info("Calling Claude for story extraction (model: %s)", settings.claude_model)

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=16384,
        system=STORY_EXTRACTION_SYSTEM,
        tools=[tool_schema],
        tool_choice={"type": "tool", "name": "extract_stories"},
        messages=[{"role": "user", "content": user_prompt}],
    )

    # Parse the tool_use response block
    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_stories":
            stories = block.input.get("stories", [])
            logger.info("Claude extracted %d stories from chunk", len(stories))
            return stories

    logger.warning("No tool_use block found in Claude response")
    return []


def extract_stories(meeting_id: str) -> list[dict]:
    """Extract customer stories from a meeting transcript using Claude.

    Args:
        meeting_id: The unique identifier of the meeting to process.

    Returns:
        A list of dicts representing the inserted story records.

    Raises:
        ValueError: If the meeting or its transcript is not found.
    """
    logger.info("Starting story extraction for meeting %s", meeting_id)

    meeting = db.get_meeting(meeting_id)
    if meeting is None:
        raise ValueError(f"Meeting not found: {meeting_id}")

    transcript_row = db.get_transcript(meeting_id)
    if transcript_row is None or not transcript_row.get("full_text"):
        raise ValueError(f"No transcript found for meeting: {meeting_id}")

    full_text = transcript_row["full_text"]
    title = meeting.get("title") or "Untitled Meeting"
    date = meeting.get("started_at") or "Unknown"

    # Build participant context from the participants table
    participants_result = (
        db.client()
        .table("participants")
        .select("name, email, company")
        .eq("meeting_id", meeting_id)
        .execute()
    )
    participant_names = [
        p.get("name") or p.get("email") or "Unknown"
        for p in participants_result.data
    ]
    participants_str = ", ".join(participant_names) if participant_names else "Unknown"

    claude_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # Handle long transcripts by chunking
    word_count = transcript_row.get("word_count") or len(full_text.split())
    logger.info("Transcript word count: %d", word_count)

    if word_count > CHUNK_WORD_LIMIT:
        logger.info(
            "Transcript exceeds %d words, chunking for processing",
            CHUNK_WORD_LIMIT,
        )
        chunks = _chunk_transcript(full_text)
        all_stories: list[dict] = []
        for i, chunk in enumerate(chunks):
            logger.info("Processing chunk %d/%d", i + 1, len(chunks))
            chunk_stories = _call_claude_for_stories(
                claude_client, chunk, title, str(date), participants_str
            )
            all_stories.extend(chunk_stories)
        stories = _deduplicate_stories(all_stories)
    else:
        stories = _call_claude_for_stories(
            claude_client, full_text, title, str(date), participants_str
        )

    # Persist each story to the database
    inserted: list[dict] = []
    for story in stories:
        record = db.insert_story({
            "meeting_id": meeting_id,
            "title": story["title"],
            "summary": story["summary"],
            "story_text": story["story_text"],
            "themes": story["themes"],
            "customer_name": story.get("customer_name", ""),
            "customer_company": story.get("customer_company", ""),
            "sentiment": story["sentiment"],
            "confidence_score": story["confidence_score"],
            "raw_analysis": story,
        })
        inserted.append(record)
        logger.info("Inserted story: %s (confidence=%.2f)", story["title"], story["confidence_score"])

    logger.info(
        "Extraction complete for meeting %s: %d stories inserted",
        meeting_id,
        len(inserted),
    )
    return inserted
