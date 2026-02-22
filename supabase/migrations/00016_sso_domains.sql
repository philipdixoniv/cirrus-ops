-- 00016_sso_domains.sql
-- SSO domain-to-org routing table for enterprise SAML SSO.
-- Supabase owns SAML provider config (via `supabase sso add` CLI).
-- This table stores lightweight domain routing so the login flow can
-- detect whether an email domain has SSO configured and redirect accordingly.

-- ============================================================================
-- 1. New Table: sso_domains
-- ============================================================================
CREATE TABLE sso_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain          TEXT NOT NULL,
  sso_provider_id UUID NOT NULL,
  enforced        BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain)
);

CREATE TRIGGER set_sso_domains_updated_at
  BEFORE UPDATE ON sso_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. Indexes
-- ============================================================================
CREATE INDEX idx_sso_domains_org ON sso_domains(org_id);
CREATE INDEX idx_sso_domains_domain ON sso_domains(domain) WHERE is_active = true;

-- ============================================================================
-- 3. Row Level Security
-- ============================================================================
ALTER TABLE sso_domains ENABLE ROW LEVEL SECURITY;

-- SELECT open to all authenticated users (needed for login-time SSO detection)
CREATE POLICY "Authenticated users can read active domains" ON sso_domains
  FOR SELECT USING (is_active = true);

-- INSERT restricted to org admins/owners
CREATE POLICY "Admin insert" ON sso_domains
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- UPDATE restricted to org admins/owners
CREATE POLICY "Admin update" ON sso_domains
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- DELETE restricted to org admins/owners
CREATE POLICY "Admin delete" ON sso_domains
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 4. RPC: get_sso_for_domain
-- ============================================================================
-- Called from the login page to detect if an email domain has SSO configured.
-- Uses SECURITY DEFINER so unauthenticated users can check SSO availability.
CREATE OR REPLACE FUNCTION get_sso_for_domain(p_domain TEXT)
RETURNS TABLE (
  sso_provider_id UUID,
  org_id UUID,
  org_name TEXT,
  domain TEXT,
  enforced BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    sd.sso_provider_id,
    sd.org_id,
    o.name AS org_name,
    sd.domain,
    sd.enforced
  FROM sso_domains sd
  JOIN organizations o ON o.id = sd.org_id
  WHERE sd.domain = lower(p_domain)
    AND sd.is_active = true
  LIMIT 1;
$$;
