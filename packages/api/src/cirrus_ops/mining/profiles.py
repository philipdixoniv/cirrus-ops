"""Profile resolution and prompt building for mining operations.

Loads mining profiles from the database and constructs grounded prompts
by combining profile-level prompts with relevant knowledge documents.
"""

from __future__ import annotations

import logging

from cirrus_ops import db
from cirrus_ops.mining.knowledge import build_knowledge_context

logger = logging.getLogger(__name__)


def load_profile(name: str, org_id: str | None = None) -> dict:
    """Load a complete mining profile including content types and knowledge docs.

    Args:
        name: The profile name (e.g., 'default', 'marketing').
        org_id: Optional org_id to scope the profile lookup.

    Returns:
        A dict with profile data, plus 'content_types' and 'knowledge' keys.

    Raises:
        ValueError: If the profile is not found.
    """
    profile = db.get_profile(name, org_id=org_id)
    if profile is None:
        raise ValueError(f"Mining profile not found: '{name}'")

    profile["content_types"] = db.get_profile_content_types(profile["id"])
    profile["knowledge"] = db.get_profile_knowledge(profile["id"])

    logger.info(
        "Loaded profile '%s': %d content types, %d knowledge docs",
        name,
        len(profile["content_types"]),
        len(profile["knowledge"]),
    )
    return profile


def build_extraction_system_prompt(
    profile: dict, max_knowledge_chars: int = 80_000
) -> str:
    """Build the full extraction system prompt with grounding knowledge.

    Combines the profile's extraction_system_prompt with knowledge documents
    tagged for 'extraction' or 'both' usage.

    Args:
        profile: A loaded profile dict (from load_profile).
        max_knowledge_chars: Max chars of knowledge to include.

    Returns:
        The complete system prompt string.
    """
    base_prompt = profile["extraction_system_prompt"]
    knowledge_docs = profile.get("knowledge", [])

    if not knowledge_docs:
        return base_prompt

    knowledge_context = build_knowledge_context(
        knowledge_docs, usage="extraction", max_chars=max_knowledge_chars
    )

    if not knowledge_context:
        return base_prompt

    return f"{base_prompt}\n\n{knowledge_context}"


def build_generation_system_prompt(
    profile: dict, max_knowledge_chars: int = 80_000
) -> str:
    """Build the full generation system prompt with grounding knowledge.

    Combines the profile's generation_system_prompt with knowledge documents
    tagged for 'generation' or 'both' usage.

    Args:
        profile: A loaded profile dict (from load_profile).
        max_knowledge_chars: Max chars of knowledge to include.

    Returns:
        The complete system prompt string.
    """
    base_prompt = profile["generation_system_prompt"]
    knowledge_docs = profile.get("knowledge", [])

    if not knowledge_docs:
        return base_prompt

    knowledge_context = build_knowledge_context(
        knowledge_docs, usage="generation", max_chars=max_knowledge_chars
    )

    if not knowledge_context:
        return base_prompt

    return f"{base_prompt}\n\n{knowledge_context}"


def get_content_type_prompt(
    profile: dict, content_type_name: str
) -> tuple[str, int]:
    """Get the prompt template and max_tokens for a content type.

    Args:
        profile: A loaded profile dict (from load_profile).
        content_type_name: The content type name (e.g., 'linkedin_post').

    Returns:
        A tuple of (prompt_template, max_tokens).

    Raises:
        ValueError: If the content type is not found in this profile.
    """
    content_types = profile.get("content_types", [])
    for ct in content_types:
        if ct["name"] == content_type_name:
            return ct["prompt_template"], ct.get("max_tokens", 4096)

    available = [ct["name"] for ct in content_types]
    raise ValueError(
        f"Content type '{content_type_name}' not found in profile '{profile['name']}'. "
        f"Available: {', '.join(available)}"
    )
