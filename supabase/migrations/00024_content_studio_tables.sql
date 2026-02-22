-- Migration 00024: Content Studio tables with org_id + RLS
-- Creates all Content Studio tables in the unified project with multi-tenancy from the start.
-- Follows the exact RLS pattern from 00001_multi_tenancy_foundation.sql.

-- ============================================================
-- Platform enum (if not already exists)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE platform_type AS ENUM ('gong', 'zoom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM ('idle', 'running', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE content_status AS ENUM ('draft', 'reviewed', 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Meetings
-- ============================================================
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    platform platform_type NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    host_name TEXT,
    host_email TEXT,
    meeting_url TEXT,
    raw_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, platform, external_id)
);

CREATE INDEX idx_meetings_org ON meetings(org_id);
CREATE INDEX idx_meetings_platform ON meetings(platform);
CREATE INDEX idx_meetings_started_at ON meetings(started_at);

CREATE TRIGGER meetings_updated_at
    BEFORE UPDATE ON meetings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON meetings
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Participants
-- ============================================================
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    company TEXT,
    role TEXT,
    is_customer BOOLEAN DEFAULT false,
    speaker_id TEXT,
    raw_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_participants_meeting ON participants(meeting_id);
CREATE INDEX idx_participants_email ON participants(email);

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON participants
  FOR ALL USING (
    meeting_id IN (SELECT id FROM meetings WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
  );

-- ============================================================
-- Transcripts
-- ============================================================
CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
    full_text TEXT,
    segments JSONB DEFAULT '[]'::jsonb,
    word_count INTEGER,
    language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transcripts_meeting ON transcripts(meeting_id);
CREATE INDEX idx_transcripts_fulltext ON transcripts USING gin(to_tsvector('english', full_text));

CREATE TRIGGER transcripts_updated_at
    BEFORE UPDATE ON transcripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON transcripts
  FOR ALL USING (
    meeting_id IN (SELECT id FROM meetings WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
  );

-- ============================================================
-- Media
-- ============================================================
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    format TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_media_meeting ON media(meeting_id);

ALTER TABLE media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON media
  FOR ALL USING (
    meeting_id IN (SELECT id FROM meetings WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
  );

-- ============================================================
-- Sync State (PK: org_id + platform)
-- ============================================================
CREATE TABLE sync_state (
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    platform platform_type NOT NULL,
    last_synced_at TIMESTAMPTZ,
    last_cursor TEXT,
    total_synced INTEGER DEFAULT 0,
    status sync_status DEFAULT 'idle',
    error_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (org_id, platform)
);

CREATE TRIGGER sync_state_updated_at
    BEFORE UPDATE ON sync_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON sync_state
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Mining Profiles (unique on org_id + name)
-- ============================================================
CREATE TABLE mining_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    extraction_system_prompt TEXT NOT NULL,
    extraction_user_prompt TEXT NOT NULL,
    themes JSONB DEFAULT '[]'::jsonb,
    extraction_tool_schema JSONB,
    generation_system_prompt TEXT NOT NULL,
    confidence_threshold FLOAT DEFAULT 0.5,
    is_active BOOLEAN DEFAULT true,
    personas JSONB DEFAULT '[]'::jsonb,
    approval_stages JSONB DEFAULT '[]'::jsonb,
    approvers JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, name)
);

CREATE INDEX idx_mining_profiles_org ON mining_profiles(org_id);

CREATE TRIGGER mining_profiles_updated_at
    BEFORE UPDATE ON mining_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE mining_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON mining_profiles
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Profile Content Types
-- ============================================================
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

CREATE INDEX idx_profile_content_types_profile ON profile_content_types(profile_id);

ALTER TABLE profile_content_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON profile_content_types
  FOR ALL USING (
    profile_id IN (SELECT id FROM mining_profiles WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
  );

-- ============================================================
-- Profile Knowledge
-- ============================================================
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

CREATE INDEX idx_profile_knowledge_profile ON profile_knowledge(profile_id);

ALTER TABLE profile_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON profile_knowledge
  FOR ALL USING (
    profile_id IN (SELECT id FROM mining_profiles WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
  );

-- ============================================================
-- Extracted Stories
-- ============================================================
CREATE TABLE extracted_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES mining_profiles(id),
    title TEXT NOT NULL,
    summary TEXT,
    story_text TEXT,
    themes JSONB DEFAULT '[]'::jsonb,
    customer_name TEXT,
    customer_company TEXT,
    sentiment TEXT,
    confidence_score FLOAT,
    personas JSONB DEFAULT '[]'::jsonb,
    funnel_stage TEXT,
    raw_analysis JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_extracted_stories_org ON extracted_stories(org_id);
CREATE INDEX idx_extracted_stories_meeting ON extracted_stories(meeting_id);
CREATE INDEX idx_extracted_stories_profile ON extracted_stories(profile_id);

ALTER TABLE extracted_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON extracted_stories
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Generated Content
-- ============================================================
CREATE TABLE generated_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES extracted_stories(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES mining_profiles(id),
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    status content_status DEFAULT 'draft',
    platform_target TEXT,
    tone TEXT,
    custom_instructions TEXT,
    version INTEGER DEFAULT 1,
    parent_id UUID REFERENCES generated_content(id),
    status_note TEXT,
    campaign_id UUID,  -- FK added after campaigns table created
    brief_id UUID,     -- FK added after content_briefs table created
    personas JSONB DEFAULT '[]'::jsonb,
    funnel_stage TEXT,
    approval_chain JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_generated_content_org ON generated_content(org_id);
CREATE INDEX idx_generated_content_story ON generated_content(story_id);
CREATE INDEX idx_generated_content_profile ON generated_content(profile_id);
CREATE INDEX idx_generated_content_status ON generated_content(status);
CREATE INDEX idx_generated_content_parent ON generated_content(parent_id);

CREATE TRIGGER generated_content_updated_at
    BEFORE UPDATE ON generated_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE generated_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON generated_content
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Prompt Presets
-- ============================================================
CREATE TABLE prompt_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES mining_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tone TEXT,
    custom_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_prompt_presets_profile ON prompt_presets(profile_id);

ALTER TABLE prompt_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON prompt_presets
  FOR ALL USING (
    profile_id IN (SELECT id FROM mining_profiles WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
  );

-- ============================================================
-- Campaigns
-- ============================================================
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES mining_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    target_audience TEXT,
    status TEXT NOT NULL DEFAULT 'planning',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_campaigns_org ON campaigns(org_id);
CREATE INDEX idx_campaigns_profile ON campaigns(profile_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);

CREATE TRIGGER campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON campaigns
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Now add FK from generated_content to campaigns
ALTER TABLE generated_content
    ADD CONSTRAINT fk_generated_content_campaign
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX idx_generated_content_campaign ON generated_content(campaign_id);

-- ============================================================
-- Campaign Stories (junction)
-- ============================================================
CREATE TABLE campaign_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES extracted_stories(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (campaign_id, story_id)
);

CREATE INDEX idx_campaign_stories_campaign ON campaign_stories(campaign_id);
CREATE INDEX idx_campaign_stories_story ON campaign_stories(story_id);

ALTER TABLE campaign_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON campaign_stories
  FOR ALL USING (
    campaign_id IN (SELECT id FROM campaigns WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
  );

-- ============================================================
-- Content Briefs
-- ============================================================
CREATE TABLE content_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES mining_profiles(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    objective TEXT,
    key_messages JSONB DEFAULT '[]'::jsonb,
    target_personas JSONB DEFAULT '[]'::jsonb,
    tone_guidance TEXT,
    linked_story_ids JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_content_briefs_org ON content_briefs(org_id);
CREATE INDEX idx_content_briefs_profile ON content_briefs(profile_id);
CREATE INDEX idx_content_briefs_campaign ON content_briefs(campaign_id);

CREATE TRIGGER content_briefs_updated_at
    BEFORE UPDATE ON content_briefs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE content_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON content_briefs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Now add FK from generated_content to content_briefs
ALTER TABLE generated_content
    ADD CONSTRAINT fk_generated_content_brief
    FOREIGN KEY (brief_id) REFERENCES content_briefs(id) ON DELETE SET NULL;
CREATE INDEX idx_generated_content_brief ON generated_content(brief_id);
