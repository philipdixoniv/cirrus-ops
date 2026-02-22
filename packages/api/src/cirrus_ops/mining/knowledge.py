"""Grounding knowledge management for mining profiles.

Handles parsing knowledge documents and assembling them into context blocks
that get injected into AI prompts for grounded extraction and generation.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def parse_grounding_docx(path: str) -> dict[str, str]:
    """Parse a Word document into named sections based on Title-level headings.

    Args:
        path: Path to the .docx file.

    Returns:
        A dict mapping section titles (lowercased, underscored) to their text content.
    """
    from docx import Document

    doc = Document(path)
    sections: dict[str, str] = {}
    current_title: str | None = None
    current_lines: list[str] = []

    for para in doc.paragraphs:
        style = para.style.name if para.style else "Normal"
        text = para.text.strip()

        if style == "Title" and text:
            # Save previous section
            if current_title is not None:
                key = current_title.lower().replace(" ", "_").replace("-", "_")
                sections[key] = "\n".join(current_lines)
            current_title = text
            current_lines = []
        elif text:
            current_lines.append(text)

    # Save last section
    if current_title is not None:
        key = current_title.lower().replace(" ", "_").replace("-", "_")
        sections[key] = "\n".join(current_lines)

    logger.info("Parsed %d sections from %s", len(sections), path)
    return sections


def build_knowledge_context(
    knowledge_docs: list[dict],
    usage: str,
    max_chars: int = 80_000,
) -> str:
    """Assemble knowledge documents into a single context block for prompt injection.

    Documents are included in sort_order priority. If total content exceeds
    max_chars, later documents are truncated or excluded.

    Args:
        knowledge_docs: List of knowledge doc dicts from the DB. Each must have
            'name', 'display_name', 'content', 'usage', and 'sort_order'.
        usage: Filter value - 'extraction' or 'generation'. Docs with matching
            usage or usage='both' are included.
        max_chars: Maximum total characters of knowledge to include.

    Returns:
        A formatted knowledge context string, or empty string if no docs match.
    """
    # Filter docs by usage
    filtered = [
        doc for doc in knowledge_docs
        if doc["usage"] == "both" or doc["usage"] == usage
    ]

    # Sort by sort_order (should already be sorted from DB, but ensure)
    filtered.sort(key=lambda d: d.get("sort_order", 0))

    if not filtered:
        return ""

    parts: list[str] = []
    total_chars = 0

    for doc in filtered:
        content = doc["content"]
        display_name = doc["display_name"]

        # Check if adding this doc would exceed budget
        section = f"### {display_name}\n{content}"
        if total_chars + len(section) > max_chars:
            remaining = max_chars - total_chars
            if remaining > 200:
                # Include truncated version
                truncated_content = content[: remaining - len(f"### {display_name}\n") - 20]
                section = f"### {display_name}\n{truncated_content}\n[... truncated]"
                parts.append(section)
                logger.warning(
                    "Knowledge doc '%s' truncated (%d -> %d chars)",
                    doc["name"],
                    len(content),
                    len(truncated_content),
                )
            else:
                logger.warning(
                    "Knowledge doc '%s' excluded (budget exhausted)", doc["name"]
                )
            break

        parts.append(section)
        total_chars += len(section)

    if not parts:
        return ""

    context = "## Grounding Knowledge\n\n" + "\n\n".join(parts)
    logger.info(
        "Built knowledge context: %d docs, %d chars (budget: %d)",
        len(parts),
        len(context),
        max_chars,
    )
    return context
