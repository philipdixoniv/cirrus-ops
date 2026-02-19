-- Cirrus Ops Database Schema
-- Apply to Supabase via SQL Editor or psql

-- Platform enum
CREATE TYPE platform_type AS ENUM ('gong', 'zoom');

-- Sync status enum
CREATE TYPE sync_status AS ENUM ('idle', 'running', 'error');

-- Content status enum
CREATE TYPE content_status AS ENUM ('draft', 'reviewed', 'published');

-- ============================================================
-- Core tables
-- ============================================================

CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    UNIQUE (platform, external_id)
);

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

-- ============================================================
-- Sync tracking
-- ============================================================

CREATE TABLE sync_state (
    platform platform_type PRIMARY KEY,
    last_synced_at TIMESTAMPTZ,
    last_cursor TEXT,
    total_synced INTEGER DEFAULT 0,
    status sync_status DEFAULT 'idle',
    error_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Initialize sync state rows
INSERT INTO sync_state (platform) VALUES ('gong'), ('zoom');

-- ============================================================
-- Content mining tables
-- ============================================================

CREATE TABLE extracted_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT,
    story_text TEXT,
    themes JSONB DEFAULT '[]'::jsonb,
    customer_name TEXT,
    customer_company TEXT,
    sentiment TEXT,
    confidence_score FLOAT,
    raw_analysis JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE generated_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES extracted_stories(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    status content_status DEFAULT 'draft',
    platform_target TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_meetings_platform ON meetings(platform);
CREATE INDEX idx_meetings_started_at ON meetings(started_at);
CREATE INDEX idx_meetings_platform_external ON meetings(platform, external_id);
CREATE INDEX idx_participants_meeting ON participants(meeting_id);
CREATE INDEX idx_participants_email ON participants(email);
CREATE INDEX idx_transcripts_meeting ON transcripts(meeting_id);
CREATE INDEX idx_media_meeting ON media(meeting_id);
CREATE INDEX idx_extracted_stories_meeting ON extracted_stories(meeting_id);
CREATE INDEX idx_generated_content_story ON generated_content(story_id);
CREATE INDEX idx_generated_content_status ON generated_content(status);

-- Full-text search on transcripts
CREATE INDEX idx_transcripts_fulltext ON transcripts USING gin(to_tsvector('english', full_text));

-- ============================================================
-- Updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meetings_updated_at
    BEFORE UPDATE ON meetings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER transcripts_updated_at
    BEFORE UPDATE ON transcripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sync_state_updated_at
    BEFORE UPDATE ON sync_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER generated_content_updated_at
    BEFORE UPDATE ON generated_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
