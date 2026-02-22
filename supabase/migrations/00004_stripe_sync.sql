-- Phase 2A: Stripe Product Catalog Sync
-- Phase 2B: Stripe Sandbox → Production Promotion

-- ============================================================
-- Stripe Price Map
-- ============================================================
CREATE TABLE stripe_price_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'quarterly', 'annual')),
  stripe_price_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_stripe_price_map
  BEFORE UPDATE ON stripe_price_map
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Stripe Sync Log
-- ============================================================
CREATE TABLE stripe_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  action TEXT NOT NULL,
  stripe_id TEXT,
  request_data JSONB,
  response_data JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Add Stripe columns to accounts
-- ============================================================
ALTER TABLE accounts ADD COLUMN stripe_customer_id_sandbox TEXT;
ALTER TABLE accounts ADD COLUMN stripe_customer_id_prod TEXT;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE stripe_price_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON stripe_price_map
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON stripe_sync_log
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );
