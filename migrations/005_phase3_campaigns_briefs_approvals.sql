-- Phase 3: Campaigns, Content Briefs, Persona Tagging, and Approval Chains

-- Campaigns table
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES mining_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    target_audience TEXT,
    status TEXT NOT NULL DEFAULT 'planning',  -- planning, active, completed
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_campaigns_profile ON campaigns(profile_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Campaign <-> Story junction (many-to-many)
CREATE TABLE campaign_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES extracted_stories(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (campaign_id, story_id)
);
CREATE INDEX idx_campaign_stories_campaign ON campaign_stories(campaign_id);
CREATE INDEX idx_campaign_stories_story ON campaign_stories(story_id);

-- Content briefs table
CREATE TABLE content_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES mining_profiles(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    objective TEXT,
    key_messages JSONB DEFAULT '[]'::jsonb,
    target_personas JSONB DEFAULT '[]'::jsonb,
    tone_guidance TEXT,
    linked_story_ids JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',  -- draft, ready, completed
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_content_briefs_profile ON content_briefs(profile_id);
CREATE INDEX idx_content_briefs_campaign ON content_briefs(campaign_id);
CREATE TRIGGER content_briefs_updated_at BEFORE UPDATE ON content_briefs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Persona/funnel on stories
ALTER TABLE extracted_stories
    ADD COLUMN IF NOT EXISTS personas JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS funnel_stage TEXT;

-- Campaign, brief, persona/funnel, approval on content
ALTER TABLE generated_content
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES content_briefs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS personas JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS funnel_stage TEXT,
    ADD COLUMN IF NOT EXISTS approval_chain JSONB DEFAULT '[]'::jsonb;
CREATE INDEX idx_generated_content_campaign ON generated_content(campaign_id);
CREATE INDEX idx_generated_content_brief ON generated_content(brief_id);

-- Personas and approval config on profiles
ALTER TABLE mining_profiles
    ADD COLUMN IF NOT EXISTS personas JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS approval_stages JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS approvers JSONB DEFAULT '[]'::jsonb;
