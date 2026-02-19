"""Prompt templates for Claude-powered transcript mining."""

STORY_EXTRACTION_SYSTEM = """\
You are an expert at analyzing meeting transcripts and extracting compelling customer stories, \
insights, and narratives. You identify moments where customers share pain points, success stories, \
objections, "aha" moments, and valuable feedback.

You always respond with structured JSON matching the requested schema."""

STORY_EXTRACTION_USER = """\
Analyze the following meeting transcript and extract all customer stories and insights.

## Meeting Context
- Title: {title}
- Date: {date}
- Participants: {participants}

## Transcript
{transcript}

## Instructions
Extract every distinct customer story, insight, or notable moment from this transcript. For each one:
1. Give it a clear, descriptive title
2. Write a 1-2 sentence summary
3. Extract the relevant portion of the conversation as story_text
4. Identify themes (e.g., pricing, onboarding, support, product-feedback, success-story, pain-point, competitive, integration)
5. Note the customer name and company if mentioned
6. Assess sentiment (positive, negative, neutral, mixed)
7. Rate your confidence (0.0 to 1.0) that this is a genuine, usable customer story

Focus on stories that would be compelling for marketing content, case studies, or a business book."""

CONTENT_GENERATION_SYSTEM = """\
You are a world-class content writer who transforms customer stories into engaging content \
for various platforms. You adapt tone, length, and format to match each platform's best practices \
while preserving the authentic voice of the customer story."""

LINKEDIN_POST_PROMPT = """\
Write a LinkedIn post based on this customer story.

## Story
Title: {title}
Summary: {summary}
Full Story: {story_text}
Customer: {customer_name} at {customer_company}
Themes: {themes}

## Guidelines
- 150-300 words (LinkedIn sweet spot)
- Hook in the first line (pattern interrupt or bold claim)
- Use short paragraphs and line breaks for readability
- Include a clear takeaway or lesson
- End with a question or call-to-action to drive engagement
- Professional but conversational tone
- Do NOT use hashtags excessively (max 3-5 at the end)
- Do NOT reveal confidential details - anonymize if needed"""

BOOK_EXCERPT_PROMPT = """\
Write a book excerpt/narrative passage based on this customer story.

## Story
Title: {title}
Summary: {summary}
Full Story: {story_text}
Customer: {customer_name} at {customer_company}
Themes: {themes}

## Guidelines
- 400-800 words
- Narrative/storytelling style - paint a scene
- Include dialogue where appropriate (based on the transcript)
- Build tension (the problem) and resolution (the outcome)
- Draw out universal business lessons
- Professional, authoritative, yet engaging tone
- This is for a business/leadership book"""

TWEET_PROMPT = """\
Write a tweet (X/Twitter post) based on this customer story.

## Story
Title: {title}
Summary: {summary}
Themes: {themes}

## Guidelines
- Under 280 characters
- Punchy and memorable
- Include one key insight or lesson
- Can use thread format (provide 1-3 tweets) if the story warrants it"""

BLOG_POST_PROMPT = """\
Write a blog post based on this customer story.

## Story
Title: {title}
Summary: {summary}
Full Story: {story_text}
Customer: {customer_name} at {customer_company}
Themes: {themes}

## Guidelines
- 500-1000 words
- Include a compelling headline
- Introduction that hooks the reader
- Body with the story and key insights
- Conclusion with actionable takeaways
- Subheadings for scannability
- Professional but approachable tone"""

CONTENT_TYPE_PROMPTS = {
    "linkedin_post": LINKEDIN_POST_PROMPT,
    "book_excerpt": BOOK_EXCERPT_PROMPT,
    "tweet": TWEET_PROMPT,
    "blog_post": BLOG_POST_PROMPT,
}
