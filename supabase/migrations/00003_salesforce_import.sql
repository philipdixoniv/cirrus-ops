-- Phase 1: Salesforce One-Time Import
-- Phase 1B: SF Activity Sync Bridge

-- ============================================================
-- Add SF columns to existing tables
-- ============================================================
ALTER TABLE accounts ADD COLUMN sf_account_id TEXT;
ALTER TABLE accounts ADD COLUMN sf_data JSONB;

ALTER TABLE contacts ADD COLUMN sf_contact_id TEXT;
ALTER TABLE contacts ADD COLUMN sf_data JSONB;
ALTER TABLE contacts ADD COLUMN phone TEXT;

ALTER TABLE opportunities ADD COLUMN sf_opportunity_id TEXT;
ALTER TABLE opportunities ADD COLUMN sf_data JSONB;
ALTER TABLE opportunities ADD COLUMN close_date DATE;
ALTER TABLE opportunities ADD COLUMN probability INTEGER;

-- Unique constraints scoped to org
CREATE UNIQUE INDEX uq_accounts_sf_id ON accounts (org_id, sf_account_id) WHERE sf_account_id IS NOT NULL;
CREATE UNIQUE INDEX uq_contacts_sf_id ON contacts (org_id, sf_contact_id) WHERE sf_contact_id IS NOT NULL;
CREATE UNIQUE INDEX uq_opportunities_sf_id ON opportunities (org_id, sf_opportunity_id) WHERE sf_opportunity_id IS NOT NULL;

-- ============================================================
-- SF Import tracking
-- ============================================================
CREATE TABLE sf_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  imported_accounts INTEGER DEFAULT 0,
  imported_contacts INTEGER DEFAULT 0,
  imported_opportunities INTEGER DEFAULT 0,
  error_log JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sf_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON sf_imports
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Activities table (Phase 1B)
-- ============================================================
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sf_activity_id TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'task')),
  subject TEXT,
  description TEXT,
  activity_date TIMESTAMPTZ,
  duration_minutes INTEGER,
  sf_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, sf_activity_id)
);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON activities
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );
