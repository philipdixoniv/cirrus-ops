-- Migration 003: Content Studio - versioning and regeneration support
-- Apply after 002_mining_profiles.sql

-- ============================================================
-- Add versioning + regeneration columns to generated_content
-- ============================================================

ALTER TABLE generated_content
    ADD COLUMN tone TEXT,                    -- 'professional','conversational','witty','serious','inspirational'
    ADD COLUMN custom_instructions TEXT,     -- free-text instructions for regeneration
    ADD COLUMN version INTEGER DEFAULT 1,   -- version number within a story+content_type
    ADD COLUMN parent_id UUID REFERENCES generated_content(id);  -- links to previous version

CREATE INDEX idx_generated_content_parent ON generated_content(parent_id);
