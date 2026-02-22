-- Phase 0A: Multi-Tenancy Foundation
-- Organizations, memberships, integrations, org_id on all tables, RLS overhaul

-- ============================================================
-- Organizations (tenants)
-- ============================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- User <-> Org membership with roles
-- ============================================================
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- ============================================================
-- Org-scoped integration credentials
-- ============================================================
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'salesforce')),
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  credentials JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_integrations
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Add org_id to all existing tables
-- ============================================================
ALTER TABLE accounts ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE contacts ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE opportunities ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE quotes ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE quote_line_items ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE quote_services ADD COLUMN org_id UUID REFERENCES organizations(id);

-- ============================================================
-- Data migration: create default org, backfill org_id
-- ============================================================
DO $$
DECLARE
  default_org_id UUID;
  first_user_id UUID;
BEGIN
  -- Create default org
  INSERT INTO organizations (name, slug) VALUES ('Cirrus', 'cirrus')
  RETURNING id INTO default_org_id;

  -- Backfill all existing rows
  UPDATE accounts SET org_id = default_org_id WHERE org_id IS NULL;
  UPDATE contacts SET org_id = default_org_id WHERE org_id IS NULL;
  UPDATE opportunities SET org_id = default_org_id WHERE org_id IS NULL;
  UPDATE quotes SET org_id = default_org_id WHERE org_id IS NULL;
  UPDATE quote_line_items SET org_id = default_org_id WHERE org_id IS NULL;
  UPDATE quote_services SET org_id = default_org_id WHERE org_id IS NULL;

  -- Make first user (if any) the owner of the default org
  SELECT id INTO first_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF first_user_id IS NOT NULL THEN
    INSERT INTO org_members (org_id, user_id, role)
    VALUES (default_org_id, first_user_id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- Add NOT NULL constraints after backfill
-- ============================================================
ALTER TABLE accounts ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE opportunities ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE quotes ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE quote_line_items ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE quote_services ALTER COLUMN org_id SET NOT NULL;

-- ============================================================
-- Drop ALL old RLS policies
-- ============================================================
DROP POLICY IF EXISTS "Allow all for authenticated users" ON accounts;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON contacts;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON opportunities;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON quotes;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON quote_line_items;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON quote_services;

DROP POLICY IF EXISTS "Allow anon access" ON accounts;
DROP POLICY IF EXISTS "Allow anon access" ON contacts;
DROP POLICY IF EXISTS "Allow anon access" ON opportunities;
DROP POLICY IF EXISTS "Allow anon access" ON quotes;
DROP POLICY IF EXISTS "Allow anon access" ON quote_line_items;
DROP POLICY IF EXISTS "Allow anon access" ON quote_services;

-- ============================================================
-- New org-scoped RLS policies
-- ============================================================

-- Organizations: members can view their orgs
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their orgs" ON organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners can update their org" ON organizations
  FOR UPDATE USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Authenticated users can create orgs" ON organizations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Org members: users see memberships in their orgs
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org memberships" ON org_members
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage members" ON org_members
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "Admins can update members" ON org_members
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "Admins can remove members" ON org_members
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Integrations: admins can manage
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage integrations" ON integrations
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Org isolation on all data tables
CREATE POLICY "Org isolation" ON accounts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON contacts
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON opportunities
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON quotes
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON quote_line_items
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON quote_services
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );
