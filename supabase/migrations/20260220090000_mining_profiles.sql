-- Migration 002: Mining Profiles, Content Types, and Grounding Knowledge
-- Apply after schema.sql (001)

-- ============================================================
-- New tables
-- ============================================================

CREATE TABLE mining_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    -- Extraction config
    extraction_system_prompt TEXT NOT NULL,
    extraction_user_prompt TEXT NOT NULL,
    themes JSONB DEFAULT '[]'::jsonb,
    extraction_tool_schema JSONB,
    -- Generation config
    generation_system_prompt TEXT NOT NULL,
    -- Settings
    confidence_threshold FLOAT DEFAULT 0.5,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE profile_content_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES mining_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    prompt_template TEXT NOT NULL,
    max_tokens INTEGER DEFAULT 4096,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (profile_id, name)
);

CREATE TABLE profile_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES mining_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    content TEXT NOT NULL,
    usage TEXT NOT NULL DEFAULT 'both',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (profile_id, name)
);

-- ============================================================
-- Alter existing tables
-- ============================================================

ALTER TABLE extracted_stories
    ADD COLUMN profile_id UUID REFERENCES mining_profiles(id);
CREATE INDEX idx_extracted_stories_profile ON extracted_stories(profile_id);

ALTER TABLE generated_content
    ADD COLUMN profile_id UUID REFERENCES mining_profiles(id);
CREATE INDEX idx_generated_content_profile ON generated_content(profile_id);

-- ============================================================
-- Updated_at trigger for mining_profiles
-- ============================================================

CREATE TRIGGER mining_profiles_updated_at
    BEFORE UPDATE ON mining_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Seed: "default" profile (current hardcoded prompts)
-- ============================================================

INSERT INTO mining_profiles (name, display_name, description, extraction_system_prompt, extraction_user_prompt, generation_system_prompt, themes, confidence_threshold)
VALUES (
    'default',
    'Default',
    'General-purpose story extraction and content generation. Uses the original hardcoded prompts with no grounding knowledge.',
    E'You are an expert at analyzing meeting transcripts and extracting compelling customer stories, insights, and narratives. You identify moments where customers share pain points, success stories, objections, "aha" moments, and valuable feedback.\n\nYou always respond with structured JSON matching the requested schema.',
    E'Analyze the following meeting transcript and extract all customer stories and insights.\n\n## Meeting Context\n- Title: {title}\n- Date: {date}\n- Participants: {participants}\n\n## Transcript\n{transcript}\n\n## Instructions\nExtract every distinct customer story, insight, or notable moment from this transcript. For each one:\n1. Give it a clear, descriptive title\n2. Write a 1-2 sentence summary\n3. Extract the relevant portion of the conversation as story_text\n4. Identify themes (e.g., pricing, onboarding, support, product-feedback, success-story, pain-point, competitive, integration)\n5. Note the customer name and company if mentioned\n6. Assess sentiment (positive, negative, neutral, mixed)\n7. Rate your confidence (0.0 to 1.0) that this is a genuine, usable customer story\n\nFocus on stories that would be compelling for marketing content, case studies, or a business book.',
    E'You are a world-class content writer who transforms customer stories into engaging content for various platforms. You adapt tone, length, and format to match each platform''s best practices while preserving the authentic voice of the customer story.',
    '["pricing","onboarding","support","product-feedback","success-story","pain-point","competitive","integration"]'::jsonb,
    0.5
);

-- Default profile content types
INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens)
SELECT p.id, 'linkedin_post', 'LinkedIn Post',
    E'Write a LinkedIn post based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 150-300 words (LinkedIn sweet spot)\n- Hook in the first line (pattern interrupt or bold claim)\n- Use short paragraphs and line breaks for readability\n- Include a clear takeaway or lesson\n- End with a question or call-to-action to drive engagement\n- Professional but conversational tone\n- Do NOT use hashtags excessively (max 3-5 at the end)\n- Do NOT reveal confidential details - anonymize if needed',
    4096
FROM mining_profiles p WHERE p.name = 'default';

INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens)
SELECT p.id, 'book_excerpt', 'Book Excerpt',
    E'Write a book excerpt/narrative passage based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 400-800 words\n- Narrative/storytelling style - paint a scene\n- Include dialogue where appropriate (based on the transcript)\n- Build tension (the problem) and resolution (the outcome)\n- Draw out universal business lessons\n- Professional, authoritative, yet engaging tone\n- This is for a business/leadership book',
    4096
FROM mining_profiles p WHERE p.name = 'default';

INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens)
SELECT p.id, 'tweet', 'Tweet',
    E'Write a tweet (X/Twitter post) based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nThemes: {themes}\n\n## Guidelines\n- Under 280 characters\n- Punchy and memorable\n- Include one key insight or lesson\n- Can use thread format (provide 1-3 tweets) if the story warrants it',
    4096
FROM mining_profiles p WHERE p.name = 'default';

INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens)
SELECT p.id, 'blog_post', 'Blog Post',
    E'Write a blog post based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 500-1000 words\n- Include a compelling headline\n- Introduction that hooks the reader\n- Body with the story and key insights\n- Conclusion with actionable takeaways\n- Subheadings for scannability\n- Professional but approachable tone',
    4096
FROM mining_profiles p WHERE p.name = 'default';

-- ============================================================
-- Seed: "marketing" profile (Cirrus-grounded marketing persona)
-- ============================================================

INSERT INTO mining_profiles (name, display_name, description, extraction_system_prompt, extraction_user_prompt, generation_system_prompt, themes, confidence_threshold)
VALUES (
    'marketing',
    'Marketing',
    'Marketing content strategist persona grounded in Cirrus positioning, competitive differentiation, and value pillars. Extracts customer narratives for marketing assets and generates on-brand content.',
    E'You are a marketing content strategist at Cirrus, analyzing meeting transcripts to identify customer narratives for marketing assets. Cirrus is an AI Sales Operating System embedded in email, calendar, and meetings -- using relationship history to automate preparation, coaching, follow-up, CRM updates, and insights. You have deep knowledge of Cirrus positioning, competitive differentiation, and value pillars. Focus on: testimonials, case studies, success metrics, competitive wins, pain points Cirrus solves, ROI evidence, and quotable customer moments. Use the Grounding Knowledge provided for accurate positioning and terminology.',
    E'Analyze the following meeting transcript and extract customer stories and marketing-ready insights.\n\n## Meeting Context\n- Title: {title}\n- Date: {date}\n- Participants: {participants}\n\n## Transcript\n{transcript}\n\n## Instructions\nExtract every customer story, testimonial, competitive insight, success metric, and quotable moment. For each one:\n1. Give it a clear, marketing-ready title\n2. Write a 1-2 sentence summary highlighting the marketing angle\n3. Extract the relevant portion of the conversation as story_text\n4. Identify themes from: customer-story, case-study, testimonial, pain-point, success-story, competitive-insight, product-feedback, roi-metric, customer-quote, adoption-journey\n5. Note the customer name and company if mentioned\n6. Assess sentiment (positive, negative, neutral, mixed)\n7. Rate your confidence (0.0 to 1.0) that this is a genuine, usable customer story for marketing\n\nFocus on stories that showcase Cirrus value pillars (Build Pipeline, Win Every Meeting, Sell Smarter), competitive wins, ROI evidence, and authentic customer voices.',
    E'You are a world-class content writer for Cirrus, creating marketing content grounded in Cirrus''s positioning as the only AI Sales Operating System that works where sellers actually work. You understand Cirrus''s 5 key differentiators, the Sales Cortex, the Meeting Lifecycle (before/during/after/always), and Cirrus Flex pricing model. All content must use correct Cirrus terminology, reinforce competitive positioning, and never reference competitor features as Cirrus capabilities. Use the Grounding Knowledge for brand voice, value framing, and competitive context.',
    '["customer-story","case-study","testimonial","pain-point","success-story","competitive-insight","product-feedback","roi-metric","customer-quote","adoption-journey"]'::jsonb,
    0.5
);

-- Marketing profile content types
INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens)
SELECT p.id, 'linkedin_post', 'LinkedIn Post',
    E'Write a LinkedIn post for Cirrus based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 150-300 words (LinkedIn sweet spot)\n- Hook in the first line — use a bold claim or pattern interrupt grounded in Cirrus value\n- Reinforce Cirrus positioning: AI Sales Operating System embedded in the seller''s workflow\n- Reference relevant Cirrus differentiators (Sales Cortex, Meeting Lifecycle, etc.) where natural\n- Include a clear takeaway or lesson tied to Cirrus value pillars\n- End with a question or call-to-action to drive engagement\n- Professional thought leadership tone — authoritative yet approachable\n- Do NOT use hashtags excessively (max 3-5 at the end)\n- Do NOT reveal confidential details — anonymize if needed\n- Never attribute competitor capabilities to Cirrus',
    4096
FROM mining_profiles p WHERE p.name = 'marketing';

INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens)
SELECT p.id, 'blog_post', 'Blog Post',
    E'Write an SEO-friendly blog post for Cirrus based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 500-1000 words\n- Include a compelling, SEO-friendly headline\n- Introduction that hooks the reader with a relatable sales challenge\n- Body weaving the customer story with Cirrus value propositions\n- Reference specific Cirrus capabilities (Meeting Prep, Live Coaching, Follow-Up AI, Sales Cortex) where relevant\n- Position against competitor categories without naming competitors directly\n- Conclusion with actionable takeaways and subtle CTA\n- Subheadings for scannability\n- Professional, authoritative tone aligned with Cirrus brand voice',
    8192
FROM mining_profiles p WHERE p.name = 'marketing';

INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens)
SELECT p.id, 'tweet', 'Tweet',
    E'Write a tweet for Cirrus based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nThemes: {themes}\n\n## Guidelines\n- Under 280 characters\n- Punchy and memorable\n- Lead with insight, not product pitch\n- Can reference Cirrus value props subtly\n- Can use thread format (1-3 tweets) if the story warrants it\n- Use Cirrus terminology correctly (Sales Cortex, Meeting Lifecycle, Cirrus Flex)',
    4096
FROM mining_profiles p WHERE p.name = 'marketing';

INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens)
SELECT p.id, 'book_excerpt', 'Book Excerpt',
    E'Write a book excerpt/narrative passage for a Cirrus-authored business book based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 400-800 words\n- Narrative/storytelling style — paint a scene\n- Include dialogue where appropriate (based on the transcript)\n- Build tension (the sales challenge) and resolution (how the approach changed)\n- Draw out universal business lessons aligned with Cirrus value pillars\n- Weave in themes of relationship intelligence, meeting lifecycle optimization, and seller empowerment\n- Professional, authoritative, yet engaging tone\n- This is for a thought-leadership business book',
    8192
FROM mining_profiles p WHERE p.name = 'marketing';

INSERT INTO profile_content_types (profile_id, name, display_name, prompt_template, max_tokens)
SELECT p.id, 'case_study', 'Case Study',
    E'Write a structured case study for Cirrus based on this customer story.\n\n## Story\nTitle: {title}\nSummary: {summary}\nFull Story: {story_text}\nCustomer: {customer_name} at {customer_company}\nThemes: {themes}\n\n## Guidelines\n- 600-1200 words\n- Structure: Challenge → Solution → Results\n- **Challenge**: Describe the customer''s pain points and the status quo before Cirrus\n- **Solution**: How Cirrus addressed the challenge — reference specific features (Meeting Prep, Live Coaching, Follow-Up AI, CRM Hygiene, Sales Cortex, etc.)\n- **Results**: Quantify impact where possible (time saved, deals won, pipeline generated, CRM accuracy improved)\n- Include a compelling pull-quote from the customer\n- Highlight which Cirrus value pillars were activated\n- End with a brief "Why Cirrus" section reinforcing competitive differentiation\n- Professional, credible tone — let the customer''s story speak\n- Anonymize confidential details if needed',
    8192
FROM mining_profiles p WHERE p.name = 'marketing';


INSERT INTO profile_knowledge (profile_id, name, display_name, content, usage, sort_order)
SELECT p.id, 'cirrus_positioning', 'Cirrus Core Positioning',
    E'⭐ THE CORE POSITIONING STATEMENT
(Always respond with this high-level frame)
Cirrus is the only AI Sales Operating System that works the way sellers actually work — in email, calendar, and meetings — using relationship history to automate preparation, coaching, follow-up, CRM updates, and insights across the entire customer lifecycle.
Other platforms cover fragments of the workflow. Cirrus unifies it end-to-end.

🔥 THE 5 DIFFERENTIATORS (Use with ALL Competitors)
These five pillars are what make Cirrus defensible and unique across all categories.
1. Cirrus is embedded in the seller’s workflow — not a standalone platform.
🎯 We live where relationships happen:
Email

Calendar

Live meetings

Meeting prep

Follow-up

No competitor unifies all of these touchpoints.
Why it matters:
 Sellers don’t need a new system. Cirrus fits inside the tools they already use 300+ times per day.
2. Cirrus is the only system that captures ALL relationship history automatically.
→ Email
 → Meetings
 → Transcripts
 → Follow-ups
 → Collateral
 → CRM
 → Buyer signals
Why competitors struggle:
 Almost all competitors rely on:
manual logging

browser plugins

dialer-only data

partial capture

one channel (calls only)

Cirrus becomes the source of truth for the entire customer relationship.
3. Cirrus powers the Sales Cortex: a relationship model unique to every buyer & seller.
No other competitor has this.
 The Cortex continuously learns:
personas

sentiment

objections

next steps

deal risk

responsiveness

internal alignment

missing stakeholders

Other platforms analyze moments.
Cirrus models the entire relationship.
4. Cirrus automates EVERYTHING across the meeting lifecycle.
Before the meeting → AI Meeting Prep
During the meeting → Live Coaching
After the meeting → AI Follow-Up & Collateral
Always → CRM Hygiene + Analytics
Competitors only solve one piece.
Cirrus solves the entire seller workflow.
5. Cirrus works across Sales, CS, Advisors, and Services — not just AEs.
Most direct competitors are sales-only.
Cirrus can serve:
Sales reps

Account managers

Customer success

Consultants

Financial advisors

Professional services

Your TAM is exponentially wider.

🏆 THE CLOSE: THE CIRRUS ADVANTAGE
Use this line in every competitive conversation:
Cirrus isn’t a tool — it’s a co-pilot that works across your entire relationship lifecycle.
Where other tools capture fragments, Cirrus connects everything and automates the work that truly moves relationships forward.',
    'both',
    0
FROM mining_profiles p WHERE p.name = 'marketing';

INSERT INTO profile_knowledge (profile_id, name, display_name, content, usage, sort_order)
SELECT p.id, 'competitive_framework', 'Competitive Category Framework',
    E'🥊 CIRRUS BATTLECARD SUMMARY — BY COMPETITOR CATEGORY
Below is the script ChatGPT will automatically use when reps need help positioning against a specific vendor.
1️⃣ Against Conversation Intelligence Platforms (Gong, Clari, Avoma, Fireflies)
Positioning:
“CI tools analyze calls. Cirrus analyzes the entire relationship.”
Key Wins:
Gong/Clari do not have email context, calendar context, or Salesforce sidebar context.

They offer post-call insights, not pre-meeting prep or live coaching.

They cannot automate follow-ups, collateral, or CRM updates.

They do not function across CS, advisors, and services — only sales.

2️⃣ Against Sales Engagement Platforms (Outreach, SalesLoft, Groove, Apollo)
Positioning:
“They automate outbound. Cirrus automates the entire customer conversation lifecycle.”
Key Wins:
They do not offer meeting prep.

They do not offer real-time coaching.

They do not auto-sync CRM with transcripts + emails + meetings.

Their analytics are step-based, not conversation-based.

Cadences don’t adapt dynamically from real meetings.

Cirrus works in email + calendar, not separate tabs.

3️⃣ Against Scheduling Tools (Calendly, Chili Piper, OnceHub)
Positioning:
“They schedule the meeting. Cirrus helps you win the meeting.”
Key Wins:
Scheduling is <10% of the meeting lifecycle.

They don’t know:

deal stage

personas

pain points

prior conversations

They can’t prep sellers for the call.

They can’t coach sellers during the call.

They can’t generate follow-up after the call.

They offer no analytics or CRM hygiene.

4️⃣ Against Revenue Intelligence Platforms (Clari, People.ai, BoostUp)
Positioning:
“They predict the numbers. Cirrus improves the numbers.”
Key Wins:
Cirrus actually captures the underlying activity, not just pipelines.

Their insights are based on CRM fields and call logs.

Cirrus insights are based on the entire conversation history.

Cirrus → action: follow-up drafted, next steps, CRM updates.

They are built for leadership; Cirrus is built for sellers.

5️⃣ Against Data Hygiene Tools (ZoomInfo, Clearbit, DemandTools, Cloudingo)
Positioning:
“They fix data that sellers didn’t log. Cirrus prevents bad data from ever happening.”
Key Wins:
Cirrus creates the source-of-truth activity record automatically.

Data hygiene tools only fix CRM fields — not conversations.

Cirrus enriches contacts from actual engagement, not databases.

We create a clean engagement graph, not isolated records.

6️⃣ Against Email Productivity Tools (Mixmax, Yesware, Superhuman)
Positioning:
“Templates and tracking are features. Cirrus is a full AI relationship OS.”
Key Wins:
They don’t understand meeting history.

They don’t prep sellers.

They don’t coach sellers.

They can’t update CRM intelligently.

They can’t analyze conversations.

They don’t build buyer signals or relationship maps.

7️⃣ Against Workflow/Integration Tools (Riva, Tray.io, Zapier, Workato)
Positioning:
“Workflows move data. Cirrus understands data.”
Key Wins:
They can’t analyze conversations.

They don’t enrich contacts with relationship context.

They don’t auto-generate follow-ups or meeting prep.

They require admin build — Cirrus requires none.

They do not improve seller performance — Cirrus does.
',
    'generation',
    1
FROM mining_profiles p WHERE p.name = 'marketing';

INSERT INTO profile_knowledge (profile_id, name, display_name, content, usage, sort_order)
SELECT p.id, 'battlecards_top10', 'Top 10 Competitor Battlecards',
    E'Top 25 Battle Cards
TOP 25 COMPETITOR BATTLECARDS
(Ordered by influence, not alphabetically.)
1. Gong
Positioning
Gong analyzes calls.
 Cirrus improves the entire relationship lifecycle.
Where They’re Strong
Best-in-class call transcription

Deal intelligence

Post-call analytics

Strong coaching insights

Where Cirrus Wins
Gong has no pre-meeting prep

No live coaching inside video meetings

No AI follow-up creation

No CRM hygiene automation

No email or calendar history → insight gaps

Gong is sales-only, Cirrus works across CS, AM, Advisors

Landmine
Ask:
“How are you capturing email + meeting context Gong never sees?”
Replace Gong When…
Team needs end-to-end automation — not just call recording.
2. Clari (Chorus + Copilot)
Positioning
Clari forecasts the pipeline.
 Cirrus improves the pipeline.
Where They’re Strong
Forecasting

Deal risk scoring

Conversation intelligence

Where Cirrus Wins
Clari sees only calls, not emails + calendars

No meeting prep, no real-time coaching, no follow-up automation

Insights depend heavily on CRM manual entry

No unified relationship model like the Sales Cortex

Landmine
“How do you ensure your CRM data is accurate enough for forecasting?”
3. Outreach
Positioning
Outreach automates outbound.
 Cirrus automates the entire customer conversation lifecycle.
Where They’re Strong
Sales sequences

Templates

Rep workflow management

Where Cirrus Wins
No meeting prep

No live coaching

No CRM hygiene automation

Cadences aren''t adaptive to real conversation data

Reps still need to switch tabs → workflow friction

Landmine
“Do your reps prep and follow up from Outreach or from email + calendar?”
4. SalesLoft
Positioning
SalesLoft helps you send more messages.
 Cirrus helps you have better conversations.
Where They’re Strong
Cadences

Sales engagement

Integrations

Where Cirrus Wins
No live meeting coaching

No AI follow-up

No CRM hygiene

No meeting prep

No relationship model (Sales Cortex)

5. ZoomInfo (Engage + Intent + InboxAI)
Positioning
ZoomInfo sells data.
 Cirrus understands relationships.
Where They’re Strong
Contact databases

Firmographic enrichment

Intent data

Where Cirrus Wins
Intent ≠ relationship context

They don’t analyze real conversations

No meeting prep, transcripts, coaching, AI follow-up

Workflows require toggling between multiple ZoomInfo modules

Data + signals → no execution layer

6. Apollo.io
Positioning
Apollo accelerates outbound.
 Cirrus accelerates every meeting and every interaction.
Cirrus Wins
Apollo has no meeting prep

No live coaching

No follow-up automation

No CRM hygiene

No transcript analysis

No relationship model

7. Groove
Positioning
Groove is a Salesforce productivity tool.
 Cirrus is an AI Sales Operating System.
Where They’re Strong
Salesforce sidebar

Basic email/calendar sync

Cadences

Where Cirrus Wins
No AI prep

No live coaching

No transcript analysis

No CRM hygiene intelligence

No follow-up automation

8. Ebsta
Positioning
Ebsta analyzes pipeline.
 Cirrus powers every interaction that creates pipeline.
Cirrus Wins
No prep

No live coaching

No meeting AI

Weak execution layer

Disconnected analytics

9. Revenue.io (RingDNA)
Positioning
Revenue.io coaches calls.
 Cirrus coaches relationships.
Cirrus Wins
No email prep

No calendar prep

No CRM hygiene

No unified follow-up automation

Narrow in-call coaching, telephony-first

10. LeanData
Positioning
LeanData routes leads.
 Cirrus routes AND prepares, AND coaches, AND follows up.
Cirrus Wins
LeanData ≠ meeting intelligence

No live coaching

No transcripts

No follow-up automation

11. Chili Piper',
    'generation',
    2
FROM mining_profiles p WHERE p.name = 'marketing';

INSERT INTO profile_knowledge (profile_id, name, display_name, content, usage, sort_order)
SELECT p.id, 'value_modules', 'Cirrus Value Modules',
    E'Value Modules
1. Schema for the Cirrus Value Library (Module 1)
For each module, we store:
ID – short handle (e.g., SELL_SMARTER_CI)

Pillar – Build Pipeline / Manage Pipeline / Win Every Meeting / Sell Smarter

ProblemName – e.g., “CRM Doesn’t Provide Insight”

ProblemStatement – 2–3 sentences in your voice

WhyItMatters – 3 bullets

CirrusSolution – 3–6 sentence description tying together the relevant features

KeyFeatures – list of feature names

Differentiators – 3–5 bullets

BusinessImpact – 3–5 bullets (non-numeric for now; we’ll layer ROI numbers later)

PersonaEmphasis – one line each for Executive, RevOps, Sales Leader, Seller

This gives the proposal-GPT “Lego blocks” it can snap together based on what it finds in the transcripts.
2. Cirrus Value Library (Module 1)
MODULE 1 – SELL SMARTER: Conversation & Revenue Insight
ID: SELL_SMARTER_INSIGHT
 Pillar: Sell Smarter
ProblemName: CRM Doesn’t Natively Provide Meaningful Insight
ProblemStatement:
 Legacy CRM is a filing cabinet pretending to be software. You spend heavily, your reps feed it data, but you still can’t see what actually drives revenue. You end up bolting on BI tools and spreadsheets while sellers feel like data-entry interns to their own success.
WhyItMatters:
Leaders are flying blind on what really drives won vs. lost deals.

RevOps burns time stitching together reports from emails, meetings, and CRM.

Reps don’t get feedback loops that help them improve their conversations.

CirrusSolution:
 Cirrus plugs directly into the places where relationships actually happen—email, calendar, and meetings—and turns every interaction into structured insight. It analyzes conversations for talk ratios, topics, sentiment, objections, and key moments; layers in activity and buyer engagement; and surfaces insights that actually explain why deals move or stall. Instead of static CRM reports, sellers and leaders get a living picture of what’s working across the entire revenue engine.
KeyFeatures:
Conversation Analytics

Activity Analytics

Buyer Signals Analytics

Retro Coaching

Differentiators:
Works from actual conversation + activity history, not just CRM fields.

Unifies email, meetings, and tasks into one insight layer.

Ties analytics directly to coaching and next steps, not just dashboards.

Built into the seller’s workflow, not a separate BI project.

BusinessImpact:
Clarity on which motions, messages, and channels actually win deals.

More accurate, trustworthy forecasting based on engagement, not guesses.

Continuous improvement loop for sellers and managers.

PersonaEmphasis:
Executive: “Get real visibility into what’s driving revenue—not just activity volume.”

RevOps: “One source of truth for activity and conversation data, no more stitching together tools.”

Sales Leader: “See which reps, messages, and motions actually close business so you can replicate success.”

Seller: “Know what’s working in your calls so every conversation gets better.”

MODULE 2 – BUILD PIPELINE: Smart Routing & Outreach
ID: BUILD_PIPELINE_ROUTING
 Pillar: Build Pipeline
ProblemName: Your Pipeline Is Drying Up
ProblemStatement:
 You can’t hit revenue targets if qualified buyers never make it to the right seller. Traditional routing and outbound tools create more admin work than meetings, and marketing-sourced leads still fall through the cracks.
WhyItMatters:
High-intent buyers wait too long or never get to the right AE.

Sellers waste time on scheduling ping-pong and manual lead assignment.

Marketing can’t prove pipeline impact when follow-up is inconsistent.

CirrusSolution:
 Cirrus Smart Scheduler connects buyers to the right seller the first time, using smart routing, round-robins, and handoff logic that consider availability, territory, and utilization. Combined with in-inbox Email Blast and Buyer Signals, Cirrus helps you wake up cold segments, follow up on warm interest, and make it painless for buyers to book time directly with your team.
KeyFeatures:
Smart Scheduler

Email Blast

Buyer Signals

Personal Scheduling

Team Scheduling

Differentiators:
Routing is tied to real calendar availability and utilization, not static rules alone.

Outreach, routing, and scheduling sit in the seller’s inbox, not a separate system.

Buyer Signals look at email + meeting + CRM, not just clicks or opens.

BusinessImpact:
More meetings with the right prospects, faster.

Less time wasted on manual routing and scheduling coordination.

Higher pipeline generation from existing database and inbound traffic.

PersonaEmphasis:
Executive: “More qualified meetings on the calendar with less spend.”

RevOps: “Routing, sequencing, and booking that don’t require manual babysitting.”

Sales Leader: “Reps focus on conversations instead of managing calendars and leads.”

Seller: “Meetings just show up on the calendar with the right people.”

MODULE 3 – BUILD PIPELINE: Auto-Capture & Contact Intelligence
ID: BUILD_PIPELINE_CONTACTS
 Pillar: Build Pipeline
ProblemName: Your CRM Doesn’t Know Who You’re Really Selling To
ProblemStatement:
 New stakeholders show up to meetings, intros happen over email, and half the buying committee never makes it into CRM. As a result, pipeline, coverage, and relationship strength are all guesswork.
WhyItMatters:
Leaders can’t see if deals are single-threaded or multi-threaded.

RevOps has to chase reps for missing contacts.

Sellers lose track of warm relationships when stakeholders change jobs.

CirrusSolution:
 Cirrus continuously monitors meetings and emails to detect new people engaged in each deal, then auto-creates or enriches contacts and associates them with the right accounts and opportunities. Every new attendee, CC, or key participant becomes a tracked relationship without any extra work from the seller.
KeyFeatures:
Contact Management

CRM Auto-Updates

Buyer Signals

Differentiators:
Works across email + calendar, not just logged CRM activities.

Learns which people are truly involved in a deal (not just mass-sequence recipients).

Updates CRM in the background with no “please update Salesforce” nagging.

BusinessImpact:
Clear picture of the full buying committee and coverage gaps.

Reduced risk of deals being over-reported or under-resourced.

Reps spend time engaging people, not keying them into CRM.

PersonaEmphasis:
Executive: “Know whether we’re truly connected to the right decision makers.”

RevOps: “Clean, complete contact data without constant chasing.”

Sales Leader: “See which deals are single-threaded and fix it before it’s too late.”

Seller: “Never lose track of who’s actually in the deal.”

MODULE 4 – WIN EVERY MEETING: AI Meeting Prep
ID: WIN_MEETING_PREP
 Pillar: Win Every Meeting
ProblemName: Selling Is Hard; Consistency Across Sellers Is Even Harder
ProblemStatement:
 Most reps walk into meetings under-prepared or spread too thin. They’re digging through emails, decks, and CRM notes to remember what happened last time, who’s who, and what to cover next. Every meeting becomes a fresh scramble instead of a consistent, repeatable motion.
WhyItMatters:
Weak discovery = weak pipeline quality.

Inconsistent prep = inconsistent win rates.

New reps take too long to get up to speed.

CirrusSolution:
 Cirrus auto-generates clean, focused meeting briefs for every conversation. It pulls from Salesforce, past emails, meeting history, firmographic and demographic details, and deal stage context to tell the seller: who’s on the call, what they care about, what’s been said already, and what needs to happen next. Reps show up prepared in minutes, not hours.
KeyFeatures:
Meeting Prep

Meeting Summaries

Meeting Transcripts (as input)

Differentiators:
Uses actual relationship history, not just static CRM fields.

Works across all meetings on the calendar, not just those the rep remembers to tag.

Built to be consumed quickly—a practical brief, not a data dump.

BusinessImpact:
Higher conversion from first meeting to next step.

Better discovery and qualification.

Reduced ramp time for new reps.

PersonaEmphasis:
Executive: “Every customer conversation is high quality, not hit-or-miss.”

RevOps: “Standardized prep motion without creating yet another checklist.”

Sales Leader: “Reps walk in prepared in a repeatable way.”

Seller: “I don’t have to dig through old threads to remember what’s going on.”

MODULE 5 – WIN EVERY MEETING: Live Coaching & Competitive Positioning
ID: WIN_MEETING_COACHING
 Pillar: Win Every Meeting
ProblemName: Reps Freeze in the Moment
ProblemStatement:
 Even good reps miss signals in the moment. They skip key discovery questions, fumble objections, or get pulled into feature wars when competitors are mentioned. Managers can’t be on every call, and post-mortems are too late.
WhyItMatters:
Missed opportunities to differentiate.

Deals stall because stakeholders and risks aren’t surfaced early.

Coaching happens after the loss, not before the win.

CirrusSolution:
 During the call, Cirrus listens in the background and provides real-time cues to the seller only. It surfaces key questions to ask, reminds them to revisit outcomes, flags competitor mentions, and provides crisp positioning guidance drawn from your playbooks and battlecards. It also tracks which parts of the playbook you’ve covered and where gaps remain.
KeyFeatures:
Live Coaching

Competitive Positioning

Meeting Transcripts

Differentiators:
Coaching is live and contextual, not just post-call.

Competitor guidance is simple and outcome-oriented, not feature-by-feature.

Draws from your own playbooks and battlecards.

BusinessImpact:
Stronger discovery and objection handling in real time.

Higher win rates on competitive deals.

Less reliance on managers joining every critical call.

PersonaEmphasis:
Executive: “Increase win rates by making every rep feel like your best rep.”

RevOps: “Operationalize playbooks without relying on slides and one-time training.”

Sales Leader: “See which reps are following the playbook and where to coach.”

Seller: “Have a quiet partner in every call, helping you stay sharp.”

MODULE 6 – WIN EVERY MEETING: Proposals, ROI & Deal Room
ID: WIN_MEETING_PROPOSAL
 Pillar: Win Every Meeting
ProblemName: Great Conversations Die in the Follow-Up
ProblemStatement:
 Reps leave good meetings with pages of notes and a vague promise to “send something over.” Proposals take days, are built from generic templates, and rarely tie back cleanly to the customer’s actual goals and pain.
WhyItMatters:
Deals lose momentum while reps build manual proposals.

Decision makers see generic decks instead of tailored business cases.

Buying committees struggle to stay aligned across threads and attachments.

CirrusSolution:
 Cirrus turns meetings, emails, and CRM data into tailored proposals and ROI narratives automatically. It generates a clear executive summary, aligns Cirrus capabilities to the customer’s stated pains, and articulates expected impact. All of this can be shared and iterated with the customer in a central Deal Room where both sides collaborate on documents, questions, and next steps.
KeyFeatures:
Proposal & ROI Drafting

Deal Room

Meeting Transcripts

Activity Analytics (for context)

Differentiators:
Proposal content is driven by actual interaction history, not guesswork.

ROI narrative speaks to outcomes, not feature lists.

Deal Room keeps both sides aligned in one place.

BusinessImpact:
Faster turnaround from meeting to decision-ready proposal.

Stronger executive alignment around value and ROI.

Fewer deals going dark between “great call” and “signed contract.”

PersonaEmphasis:
Executive: “Get proposals that clearly tie investment to outcomes you care about.”

RevOps: “Proposal templates stay consistent while still being tailored by AI.”

Sales Leader: “Reps spend time selling, not formatting documents.”

Seller: “I click a button and get a smart starting point instead of a blank page.”

MODULE 7 – NO ADMIN BS: Automated CRM Hygiene
ID: NO_ADMIN_CRM_HYGIENE
 Pillar: Sell Smarter / No Administrative BS
ProblemName: You’re Working for Your Software Instead of It Working for You
ProblemStatement:
 Legacy CRM needs constant feeding. Reps log emails, meetings, tasks, and contacts by hand just to keep reports from breaking. RevOps layers on even more fields and processes to plug gaps. Everyone resents the system, but leadership can’t live without the data.
WhyItMatters:
Sellers lose hours every week to manual updates.

CRM is still incomplete and out of date.

Forecasts and analytics suffer from garbage-in, garbage-out.

CirrusSolution:
 Cirrus quietly automates the busywork. It syncs email, calendar events, and tasks with Salesforce; detects missing contacts and activity; and auto-updates CRM with the right people, context, and associations. The Salesforce Sidebar puts everything sellers need in their inbox, so they can work from where conversations actually happen while Cirrus keeps CRM clean in the background.
KeyFeatures:
Salesforce Calendar Sync

Salesforce Email Sync

Salesforce Task Sync

Salesforce Sidebar

CRM Auto-Updates

Contact Management

Differentiators:
Bottom-up automation from real interactions, not admin checklists.

Strong, mature sync across Outlook/Gmail + Salesforce.

Designed to reduce admin load first, not just improve reports.

BusinessImpact:
Reps get hours back every week.

CRM becomes a trustworthy system of record.

Leaders and RevOps get the data they need without adding friction.

PersonaEmphasis:
Executive: “Get reliable CRM data without burning out your sellers.”

RevOps: “Stop being the CRM nag—let automation do it.”

Sales Leader: “Less time updating Salesforce, more time in front of customers.”

Seller: “No more double work. If I send the email or take the meeting, Cirrus logs it.”

MODULE 8 – SELL SMARTER: Cirrus Next (Prioritized Actions / Relationship OS)
ID: SELL_SMARTER_CIRRUS_NEXT
 Pillar: Sell Smarter
ProblemName: Sellers Drown in To-Dos, Tabs, and Tools
ProblemStatement:
 Reps bounce between inbox, CRM, call recordings, notes, cadences, and task lists just to figure out what to do next. Important follow-ups fall through the cracks; coaching and playbooks never quite make it into daily execution.
WhyItMatters:
Inconsistent follow-up kills otherwise good deals.

Managers can’t easily see whether reps are working the right things.

Sellers feel overwhelmed instead of empowered by tools.

CirrusSolution:
 Cirrus Next is the daily command center for relationship work. It pulls in emails, meetings, transcripts, CRM, playbooks, battlecards, and content—and turns them into a prioritized list of next best actions. Each item comes with a drafted email or artifact, recommended attachments, and clear reasoning so reps can review, tweak, and send from one place.
KeyFeatures:
Next Steps / Cirrus Next

Buyer Signals

Activity Analytics

Proposal & ROI Drafting (as needed)

Differentiators:
Operates at the relationship level, not just record or inbox level.

Combines context + prioritization + document generation.

Shows its work: why each action matters and how it was sourced.

BusinessImpact:
More consistent, higher-quality follow-up.

Better use of seller time across all deals.

Stronger pipeline hygiene and momentum.

PersonaEmphasis:
Executive: “See a system that actually drives execution, not just reports on it.”

RevOps: “Turn all our data and content into an operating system, not noise.”

Sales Leader: “Know your reps are working the right things, every day.”

Seller: “One place that tells me what to do next and helps me do it.”',
    'both',
    3
FROM mining_profiles p WHERE p.name = 'marketing';

INSERT INTO profile_knowledge (profile_id, name, display_name, content, usage, sort_order)
SELECT p.id, 'feature_inventory', 'Feature Inventory & Frameworks',
    E'Cirrus Feature Inventory
Cirrus Feature Inventory (the MENU) — with definitions
GPT needs a grounding list of what Cirrus actually does.
 This includes:
Salesforce Sidebar

Calendar Sync

Email Sync

Smart Scheduler

Meeting Prep

Transcripts

Live Coaching

Follow-Up AI

CRM Hygiene

Analytics

Buyer Signals

Scheduling Features

Sales Cadences

➡ This prevents ChatGPT from inventing features.
Sales Cortex Framework
Sales Cortex Framework
This single concept is the heart of Cirrus’ differentiation.
GPT needs:
What the Sales Cortex is

What data goes into it

How it learns

How it affects meeting prep, coaching, follow-up, analytics

Why competitors don''t have anything like it

➡ Without this, GPT cannot reliably separate Cirrus from Gong, Clari, Outreach, Calendly, etc.
The End-to-End “Meeting Lifecycle” Narrative
The End-to-End “Meeting Lifecycle” Narrative
This is your superpower.
GPT needs a clear, structured explanation of:
Before the Meeting → automated prep

During the Meeting → real-time coaching + transcript

After the Meeting → follow-up + collateral + CRM updates

Always → analytics + hygiene + relationship intel

➡ This enables GPT to build objection handling, demo scripts, persona messaging, etc.
Cirrus AI Roadmap
Cirrus AI Roadmap (Vision-Level, 1 Page)
Keep this high-level:
How Cirrus shifts from “CRM sync tool” → “AI Sales Operating System”

How Cirrus uses relationship context to power AI

The unified inbox → meeting → follow-up workflow

The role of consumption-based pricing

Why Cirrus is the perfect AI partner for enterprises like Walmart

➡ GPT uses this to answer future-leaning prospect questions confidently without overpromising.',
    'both',
    4
FROM mining_profiles p WHERE p.name = 'marketing';

INSERT INTO profile_knowledge (profile_id, name, display_name, content, usage, sort_order)
SELECT p.id, 'cirrus_flex', 'Cirrus Flex Pricing Model',
    E'Cirrus Flex & Pricing Table
Cirrus Flex & Pricing Table
Canonical Pricing & Licensing Reference
1. Cirrus Flex Overview
Cirrus Flex is the economic engine behind the Cirrus platform.
It is not a tiered plan, bundle, or upgrade path.
 It is a customer-aligned pricing model designed to eliminate shelfware, remove friction, and align spend directly to value creation.
Core Principles
Every feature is available to every customer

No feature gating

No seat rationing

No forced upgrades

No surprise invoices

Pay only for the exact capacity required per feature, nothing else

Rewards for commitment, never penalties for adoption

Customers configure features, AI usage, and commitment terms independently.
2. Cirrus Flex Licensing (Canonical Definition)
Billing & Invoicing
Users are licensed as a contracted base quantity per feature and invoiced at a fixed amount

User activity is used only to measure value alignment, not to trigger automatic charges

Exceeding licensed user quantities does not result in automatic overages, true-ups, or variable invoices

Sustained over-utilization may prompt a commercial discussion, at the customer’s discretion

Cirrus Flex is not metered billing, pay-as-you-go pricing, or usage-based invoicing.
2.1 Usage Tracking (Definition)
For measurement purposes only:
Active Users are users who trigger defined value events for a specific feature during a billing period.
This definition exists solely to ensure customers license the right capacity, not to determine billing.
Billing Rules
Billing is based solely on mutually agreed Order Forms

Users are not pre-allocated or capped

Each feature independently tracks activity

A user may be active for one feature and inactive for another

Access Rules
All users may access all features

Only users who trigger value events are counted for measurement

Feature usage may be mixed and matched across users, teams, or divisions

Economic Characteristics
Activity-measured capacity pricing

No shelfware

Spend scales with adoption — never automatically

Best Fit
Growth organizations

Field sales teams

Seasonal or variable headcount

Teams with uneven feature adoption

Customers who value maximum flexibility

3. Value Events (Examples)
User activity is determined by value creation, not logins.
Examples include (non-exhaustive):
Meetings booked or analyzed

Emails synced or sent

Records updated or enriched

AI pages generated or viewed

Sequences executed

Signals triggered and viewed

Exact event definitions are managed by Cirrus and do not require customer configuration.
4. AI Usage Pricing (Monthly, Org-Level Pooled)
AI usage is not priced per user.
 All AI hours are pooled at the organization level.
Meeting Transcription
Live Coaching (Real-Time Streaming AI)
5. Feature Pricing (Per Month)
Feature prices apply per licensed user capacity.
6. Discounts
6.1 Term Length Discounts
6.2 Billing Frequency Discounts
6.3 Additional Commercial Considerations
Discounts may be influenced by:
User quantity volume

Speed to purchase

Willingness to engage with the Cirrus product team

Multi-departmental usage

All discounts must be explicitly approved and documented.
7. Discount Application Rules (Strict)
Total Cost =
 (Base AI Usage + Feature Cost)
 – Term Discount
 – Billing Discount
Rules:
All eligible discounts stack

Discounts apply to the total amount

No unlisted discounts permitted

GPT must not invent discounts

GPT must not round unless instructed

8. Pricing Calculation Guardrails (For GPT)
GPT may calculate pricing only when all of the following are provided:
Feature list + quantities

Term length

Billing frequency

If any input is missing:
GPT must ask clarifying questions

GPT must not guess configuration

GPT must not invent features, tiers, or discounts

9. Comparison & Quoting Rules
When presenting multiple quote options, GPT must:
Headline the variable being compared

Use identical feature sets

Clearly state usage assumptions

Show totals before and after discounts

Avoid “cheaper vs. more expensive” language

10. Platform Access & Flex Rights
All users may access the platform regardless of licensed capacity

All features remain visible and usable for evaluation

Over-utilization does not obligate payment

Add-ons or changes must be mutually agreed upon

Cirrus may disable unlicensed features if necessary

11. Summary
Cirrus Flex replaces outdated SaaS economics with a model aligned to how teams actually work.
Full access

Transparent pricing

Fair economics

No penalties for adoption

No friction to explore

No surprises

Customers choose how they pay.
Cirrus ensures they only pay when value is created.
CHM Play Value Reconfig',
    'generation',
    5
FROM mining_profiles p WHERE p.name = 'marketing';
