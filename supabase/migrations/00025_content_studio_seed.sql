-- Migration 00025: Seed Content Studio data under the 'Cirrus' org
-- Seeds default + marketing mining profiles with content types and knowledge docs.

DO $$
DECLARE
  cirrus_org_id UUID;
  default_profile_id UUID;
  marketing_profile_id UUID;
BEGIN
  -- Get the Cirrus org (created in migration 00001)
  SELECT id INTO cirrus_org_id FROM organizations WHERE slug = 'cirrus';
  IF cirrus_org_id IS NULL THEN
    RAISE EXCEPTION 'Cirrus organization not found. Run migration 00001 first.';
  END IF;

  -- Initialize sync state for Cirrus org
  INSERT INTO sync_state (org_id, platform) VALUES (cirrus_org_id, 'gong'), (cirrus_org_id, 'zoom')
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- Default profile
  -- ============================================================
  INSERT INTO mining_profiles (org_id, name, display_name, description, extraction_system_prompt, extraction_user_prompt, generation_system_prompt, themes, confidence_threshold)
  VALUES (
    cirrus_org_id,
    'default',
    'Default',
    'General-purpose story extraction and content generation.',
    E'You are an expert at analyzing meeting transcripts and extracting compelling customer stories, insights, and narratives. You identify moments where customers share pain points, success stories, objections, "aha" moments, and valuable feedback.\n\nYou always respond with structured JSON matching the requested schema.',
    E'Analyze the following meeting transcript and extract all customer stories and insights.\n\n## Meeting Context\n- Title: {title}\n- Date: {date}\n- Participants: {participants}\n\n## Transcript\n{transcript}\n\n## Instructions\nExtract every distinct customer story, insight, or notable moment from this transcript. For each one:\n1. Give it a clear, descriptive title\n2. Write a 1-2 sentence summary\n3. Extract the relevant portion of the conversation as story_text\n4. Identify themes (e.g., pricing, onboarding, support, product-feedback, success-story, pain-point, competitive, integration)\n5. Note the customer name and company if mentioned\n6. Assess sentiment (positive, negative, neutral, mixed)\n7. Rate your confidence (0.0 to 1.0) that this is a genuine, usable customer story\n\nFocus on stories that would be compelling for marketing content, case studies, or a business book.',
    E'You are a world-class content writer who transforms customer stories into engaging content for various platforms. You adapt tone, length, and format to match each platform''s best practices while preserving the authentic voice of the customer story.',
    '["pricing","onboarding","support","product-feedback","success-story","pain-point","competitive","integration"]'::jsonb,
    0.5
  )
  RETURNING id INTO default_profile_id;

  -- Default content types
  INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens) VALUES
  (default_profile_id, 'linkedin_post', 'LinkedIn Post',
    E'Write a LinkedIn post based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 150-300 words\n- Hook in the first line\n- Short paragraphs and line breaks\n- Clear takeaway or lesson\n- End with a question or CTA\n- Professional but conversational tone\n- Max 3-5 hashtags at end',
    4096),
  (default_profile_id, 'book_excerpt', 'Book Excerpt',
    E'Write a book excerpt/narrative passage based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 400-800 words\n- Narrative/storytelling style\n- Include dialogue where appropriate\n- Build tension and resolution\n- Draw out universal business lessons\n- Professional, authoritative, yet engaging tone',
    4096),
  (default_profile_id, 'tweet', 'Tweet',
    E'Write a tweet based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nThemes: {themes}\n\n## Guidelines\n- Under 280 characters\n- Punchy and memorable\n- One key insight or lesson\n- Can use thread format (1-3 tweets)',
    4096),
  (default_profile_id, 'blog_post', 'Blog Post',
    E'Write a blog post based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 500-1000 words\n- Compelling headline\n- Hook introduction\n- Key insights in body\n- Actionable takeaways\n- Subheadings for scannability',
    4096);

  -- ============================================================
  -- Marketing profile
  -- ============================================================
  INSERT INTO mining_profiles (org_id, name, display_name, description, extraction_system_prompt, extraction_user_prompt, generation_system_prompt, themes, confidence_threshold)
  VALUES (
    cirrus_org_id,
    'marketing',
    'Marketing',
    'Marketing content strategist persona grounded in Cirrus positioning, competitive differentiation, and value pillars.',
    E'You are a marketing content strategist at Cirrus, analyzing meeting transcripts to identify customer narratives for marketing assets. Cirrus is an AI Sales Operating System embedded in email, calendar, and meetings. Focus on: testimonials, case studies, success metrics, competitive wins, pain points Cirrus solves, ROI evidence, and quotable customer moments. Use the Grounding Knowledge provided for accurate positioning and terminology.',
    E'Analyze the following meeting transcript and extract customer stories and marketing-ready insights.\n\n## Meeting Context\n- Title: {title}\n- Date: {date}\n- Participants: {participants}\n\n## Transcript\n{transcript}\n\n## Instructions\nExtract every customer story, testimonial, competitive insight, success metric, and quotable moment. For each:\n1. Marketing-ready title\n2. 1-2 sentence summary with marketing angle\n3. Relevant transcript portion as story_text\n4. Themes from: customer-story, case-study, testimonial, pain-point, success-story, competitive-insight, product-feedback, roi-metric, customer-quote, adoption-journey\n5. Customer name and company\n6. Sentiment\n7. Confidence score\n\nFocus on stories showcasing Cirrus value pillars, competitive wins, ROI evidence, and authentic customer voices.',
    E'You are a world-class content writer for Cirrus, creating marketing content grounded in Cirrus''s positioning as the only AI Sales Operating System that works where sellers actually work. All content must use correct Cirrus terminology and reinforce competitive positioning.',
    '["customer-story","case-study","testimonial","pain-point","success-story","competitive-insight","product-feedback","roi-metric","customer-quote","adoption-journey"]'::jsonb,
    0.5
  )
  RETURNING id INTO marketing_profile_id;

  -- Marketing content types
  INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens) VALUES
  (marketing_profile_id, 'linkedin_post', 'LinkedIn Post',
    E'Write a LinkedIn post for Cirrus based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 150-300 words\n- Hook with bold claim grounded in Cirrus value\n- Reinforce Cirrus positioning: AI Sales Operating System\n- Reference relevant differentiators where natural\n- Thought leadership tone\n- Max 3-5 hashtags\n- Never attribute competitor capabilities to Cirrus',
    4096),
  (marketing_profile_id, 'blog_post', 'Blog Post',
    E'Write an SEO-friendly blog post for Cirrus based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 500-1000 words\n- SEO-friendly headline\n- Reference Cirrus capabilities where relevant\n- Subtle CTA\n- Professional tone aligned with Cirrus brand',
    8192),
  (marketing_profile_id, 'tweet', 'Tweet',
    E'Write a tweet for Cirrus based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nThemes: {themes}\n\n## Guidelines\n- Under 280 characters\n- Lead with insight, not product pitch\n- Use Cirrus terminology correctly',
    4096),
  (marketing_profile_id, 'book_excerpt', 'Book Excerpt',
    E'Write a book excerpt for a Cirrus-authored business book based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 400-800 words\n- Narrative storytelling style\n- Build tension and resolution\n- Weave in relationship intelligence themes\n- Thought-leadership business book tone',
    8192),
  (marketing_profile_id, 'case_study', 'Case Study',
    E'Write a structured case study for Cirrus based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 600-1200 words\n- Structure: Challenge -> Solution -> Results\n- Reference specific Cirrus features\n- Include a pull-quote\n- End with "Why Cirrus" section\n- Professional, credible tone',
    8192);

  -- Marketing knowledge docs
  INSERT INTO profile_knowledge (profile_id, name, display_name, content, usage, sort_order) VALUES
  (marketing_profile_id, 'cirrus_positioning', 'Cirrus Core Positioning',
    'Cirrus is the only AI Sales Operating System that works the way sellers actually work — in email, calendar, and meetings — using relationship history to automate preparation, coaching, follow-up, CRM updates, and insights across the entire customer lifecycle. Other platforms cover fragments of the workflow. Cirrus unifies it end-to-end. 5 Key Differentiators: (1) Embedded in seller workflow, (2) Captures ALL relationship history automatically, (3) Powers the Sales Cortex relationship model, (4) Automates EVERYTHING across the meeting lifecycle, (5) Works across Sales, CS, Advisors, and Services.',
    'both', 0),
  (marketing_profile_id, 'competitive_framework', 'Competitive Category Framework',
    'CI tools (Gong/Clari) analyze calls — Cirrus analyzes the entire relationship. Sales engagement (Outreach/SalesLoft) automates outbound — Cirrus automates the entire conversation lifecycle. Scheduling tools (Calendly/Chili Piper) schedule meetings — Cirrus helps you win meetings. Revenue intelligence (Clari/People.ai) predicts numbers — Cirrus improves numbers. Data hygiene (ZoomInfo) fixes data — Cirrus prevents bad data.',
    'generation', 1),
  (marketing_profile_id, 'value_modules', 'Cirrus Value Modules',
    'Module 1: Sell Smarter (Conversation & Revenue Insight). Module 2: Build Pipeline (Smart Routing & Outreach). Module 3: Build Pipeline (Auto-Capture & Contact Intelligence). Module 4: Win Every Meeting (AI Meeting Prep). Module 5: Win Every Meeting (Live Coaching & Competitive Positioning). Module 6: Win Every Meeting (Proposals, ROI & Deal Room). Module 7: No Admin BS (Automated CRM Hygiene). Module 8: Sell Smarter (Cirrus Next — Prioritized Actions).',
    'both', 3),
  (marketing_profile_id, 'cirrus_flex', 'Cirrus Flex Pricing Model',
    'Cirrus Flex is a customer-aligned pricing model: every feature available to every customer, no gating, no seat rationing, no forced upgrades. Pay only for exact capacity required per feature. Rewards commitment, never penalties. Activity-measured capacity pricing eliminates shelfware.',
    'generation', 5);

END $$;
