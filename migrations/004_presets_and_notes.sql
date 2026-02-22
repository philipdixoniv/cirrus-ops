-- Phase 2: Prompt presets table and approval notes column

CREATE TABLE prompt_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES mining_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tone TEXT,
    custom_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_prompt_presets_profile ON prompt_presets(profile_id);

ALTER TABLE generated_content ADD COLUMN IF NOT EXISTS status_note TEXT;
