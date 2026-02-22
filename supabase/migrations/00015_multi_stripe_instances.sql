-- 00015_multi_stripe_instances.sql
-- Multi-instance Stripe hub with lineage tracking.
-- Replaces the fixed sandbox/production environment model with unlimited named instances.

-- ============================================================================
-- 1. New Table: stripe_instances
-- ============================================================================
CREATE TABLE stripe_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  stripe_account_id TEXT,
  credentials       JSONB NOT NULL DEFAULT '{}',
  is_active         BOOLEAN DEFAULT true,
  last_sync_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, name)
);

CREATE TRIGGER set_stripe_instances_updated_at
  BEFORE UPDATE ON stripe_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE stripe_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read" ON stripe_instances
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Admin insert" ON stripe_instances
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admin update" ON stripe_instances
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admin delete" ON stripe_instances
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 2. New Table: stripe_sync_lineage
-- ============================================================================
CREATE TABLE stripe_sync_lineage (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type          TEXT NOT NULL CHECK (entity_type IN ('product', 'price', 'coupon')),
  source_instance_id   UUID NOT NULL REFERENCES stripe_instances(id) ON DELETE CASCADE,
  source_stripe_id     TEXT NOT NULL,
  target_instance_id   UUID NOT NULL REFERENCES stripe_instances(id) ON DELETE CASCADE,
  target_stripe_id     TEXT NOT NULL,
  pushed_at            TIMESTAMPTZ DEFAULT NOW(),
  pushed_by            UUID REFERENCES auth.users(id),
  UNIQUE(org_id, entity_type, source_instance_id, source_stripe_id, target_instance_id),
  CONSTRAINT different_instances CHECK (source_instance_id != target_instance_id)
);

ALTER TABLE stripe_sync_lineage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON stripe_sync_lineage
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ============================================================================
-- 3. Add stripe_instance_id column to existing Stripe tables (nullable first)
-- ============================================================================
ALTER TABLE stripe_products ADD COLUMN stripe_instance_id UUID REFERENCES stripe_instances(id);
ALTER TABLE stripe_prices ADD COLUMN stripe_instance_id UUID REFERENCES stripe_instances(id);
ALTER TABLE stripe_coupons ADD COLUMN stripe_instance_id UUID REFERENCES stripe_instances(id);

-- ============================================================================
-- 4. Data Migration: Create stripe_instances from existing integrations
-- ============================================================================
INSERT INTO stripe_instances (org_id, name, credentials, is_active, last_sync_at)
SELECT
  i.org_id,
  CASE i.environment
    WHEN 'sandbox' THEN 'Sandbox'
    WHEN 'production' THEN 'Production'
    ELSE initcap(i.environment)
  END,
  i.credentials,
  i.is_active,
  i.last_sync_at
FROM integrations i
WHERE i.provider = 'stripe'
ON CONFLICT (org_id, name) DO NOTHING;

-- ============================================================================
-- 5. Backfill stripe_instance_id on existing rows
-- ============================================================================
UPDATE stripe_products sp
SET stripe_instance_id = si.id
FROM stripe_instances si
WHERE sp.org_id = si.org_id
  AND si.name = CASE sp.environment
    WHEN 'sandbox' THEN 'Sandbox'
    WHEN 'production' THEN 'Production'
    ELSE initcap(sp.environment)
  END
  AND sp.stripe_instance_id IS NULL;

UPDATE stripe_prices sp
SET stripe_instance_id = si.id
FROM stripe_instances si
WHERE sp.org_id = si.org_id
  AND si.name = CASE sp.environment
    WHEN 'sandbox' THEN 'Sandbox'
    WHEN 'production' THEN 'Production'
    ELSE initcap(sp.environment)
  END
  AND sp.stripe_instance_id IS NULL;

UPDATE stripe_coupons sc
SET stripe_instance_id = si.id
FROM stripe_instances si
WHERE sc.org_id = si.org_id
  AND si.name = CASE sc.environment
    WHEN 'sandbox' THEN 'Sandbox'
    WHEN 'production' THEN 'Production'
    ELSE initcap(sc.environment)
  END
  AND sc.stripe_instance_id IS NULL;

-- ============================================================================
-- 6. Set NOT NULL after backfill
-- ============================================================================
ALTER TABLE stripe_products ALTER COLUMN stripe_instance_id SET NOT NULL;
ALTER TABLE stripe_prices ALTER COLUMN stripe_instance_id SET NOT NULL;
ALTER TABLE stripe_coupons ALTER COLUMN stripe_instance_id SET NOT NULL;

-- ============================================================================
-- 7. Drop old unique constraints and add new ones
-- ============================================================================

-- Drop old unique constraints on (org_id, environment, stripe_id)
ALTER TABLE stripe_products DROP CONSTRAINT stripe_products_org_id_environment_stripe_id_key;
ALTER TABLE stripe_prices DROP CONSTRAINT stripe_prices_org_id_environment_stripe_id_key;
ALTER TABLE stripe_coupons DROP CONSTRAINT stripe_coupons_org_id_environment_stripe_id_key;

-- Add new unique constraints on (org_id, stripe_instance_id, stripe_id)
ALTER TABLE stripe_products ADD CONSTRAINT stripe_products_org_instance_stripe_id_key
  UNIQUE(org_id, stripe_instance_id, stripe_id);
ALTER TABLE stripe_prices ADD CONSTRAINT stripe_prices_org_instance_stripe_id_key
  UNIQUE(org_id, stripe_instance_id, stripe_id);
ALTER TABLE stripe_coupons ADD CONSTRAINT stripe_coupons_org_instance_stripe_id_key
  UNIQUE(org_id, stripe_instance_id, stripe_id);

-- ============================================================================
-- 8. Drop environment column from Stripe tables
-- ============================================================================

-- Drop indexes that reference environment
DROP INDEX IF EXISTS idx_stripe_products_org_env;
DROP INDEX IF EXISTS idx_stripe_products_org_env_active;
DROP INDEX IF EXISTS idx_stripe_prices_org_env;
DROP INDEX IF EXISTS idx_stripe_prices_org_env_active;
DROP INDEX IF EXISTS idx_stripe_prices_recurring;
DROP INDEX IF EXISTS idx_stripe_coupons_org_env;
DROP INDEX IF EXISTS idx_stripe_coupons_org_env_valid;

-- Drop environment check constraints and column
ALTER TABLE stripe_products DROP COLUMN environment;
ALTER TABLE stripe_prices DROP COLUMN environment;
ALTER TABLE stripe_coupons DROP COLUMN environment;

-- ============================================================================
-- 9. Remove Stripe rows from integrations (migrated to stripe_instances)
-- ============================================================================
DELETE FROM integrations WHERE provider = 'stripe';

-- ============================================================================
-- 10. New indexes for instance-based queries
-- ============================================================================
CREATE INDEX idx_stripe_products_instance ON stripe_products(org_id, stripe_instance_id);
CREATE INDEX idx_stripe_products_instance_active ON stripe_products(org_id, stripe_instance_id) WHERE active = true;
CREATE INDEX idx_stripe_prices_instance ON stripe_prices(org_id, stripe_instance_id);
CREATE INDEX idx_stripe_prices_instance_active ON stripe_prices(org_id, stripe_instance_id) WHERE active = true;
CREATE INDEX idx_stripe_prices_instance_recurring ON stripe_prices(org_id, stripe_instance_id, recurring_interval, recurring_interval_count) WHERE type = 'recurring';
CREATE INDEX idx_stripe_coupons_instance ON stripe_coupons(org_id, stripe_instance_id);
CREATE INDEX idx_stripe_coupons_instance_valid ON stripe_coupons(org_id, stripe_instance_id) WHERE valid = true;
CREATE INDEX idx_stripe_lineage_source ON stripe_sync_lineage(org_id, source_instance_id, entity_type);
CREATE INDEX idx_stripe_lineage_target ON stripe_sync_lineage(org_id, target_instance_id, entity_type);

-- ============================================================================
-- 11. RPC: get_instance_lineage
-- ============================================================================
CREATE OR REPLACE FUNCTION get_instance_lineage(p_org_id UUID, p_instance_id UUID)
RETURNS TABLE (
  id UUID,
  entity_type TEXT,
  source_instance_id UUID,
  source_instance_name TEXT,
  source_stripe_id TEXT,
  target_instance_id UUID,
  target_instance_name TEXT,
  target_stripe_id TEXT,
  pushed_at TIMESTAMPTZ,
  pushed_by UUID
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    l.id,
    l.entity_type,
    l.source_instance_id,
    si_source.name AS source_instance_name,
    l.source_stripe_id,
    l.target_instance_id,
    si_target.name AS target_instance_name,
    l.target_stripe_id,
    l.pushed_at,
    l.pushed_by
  FROM stripe_sync_lineage l
  JOIN stripe_instances si_source ON si_source.id = l.source_instance_id
  JOIN stripe_instances si_target ON si_target.id = l.target_instance_id
  WHERE l.org_id = p_org_id
    AND (l.source_instance_id = p_instance_id OR l.target_instance_id = p_instance_id)
  ORDER BY l.pushed_at DESC;
$$;
