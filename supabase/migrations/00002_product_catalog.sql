-- Phase 0B: Product Catalog in Database (org-scoped)

-- ============================================================
-- Products
-- ============================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('per_seat', 'tiered', 'one_time')),
  unit_label TEXT DEFAULT 'Active User',
  monthly_price DECIMAL(10,2),
  price DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  stripe_product_id_sandbox TEXT,
  stripe_product_id_prod TEXT,
  stripe_synced_at TIMESTAMPTZ,
  stripe_sync_status TEXT,
  stripe_promoted_at TIMESTAMPTZ,
  stripe_promotion_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Product Tiers (for tiered pricing)
-- ============================================================
CREATE TABLE product_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_units INTEGER NOT NULL,
  max_units INTEGER,
  unit_rate DECIMAL(10,2) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  stripe_price_id_sandbox TEXT,
  stripe_price_id_prod TEXT
);

-- ============================================================
-- Discount Schedules
-- ============================================================
CREATE TABLE discount_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('term', 'billing')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  discount_pct DECIMAL(5,4) NOT NULL DEFAULT 0,
  term_months INTEGER,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(org_id, type, key)
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON products
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON product_tiers
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON discount_schedules
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- Seed default Cirrus org with hardcoded pricing data
-- ============================================================
DO $$
DECLARE
  cirrus_org_id UUID;
  p_id UUID;
BEGIN
  SELECT id INTO cirrus_org_id FROM organizations WHERE slug = 'cirrus' LIMIT 1;
  IF cirrus_org_id IS NULL THEN RETURN; END IF;

  -- Per-seat features
  INSERT INTO products (org_id, slug, name, type, unit_label, monthly_price, sort_order) VALUES
    (cirrus_org_id, 'sidebar', 'Salesforce Sidebar', 'per_seat', 'Active User', 11.00, 1),
    (cirrus_org_id, 'calendar_sync', 'Salesforce Calendar Sync', 'per_seat', 'Active User', 11.00, 2),
    (cirrus_org_id, 'email_sync', 'Salesforce Email Sync', 'per_seat', 'Active User', 5.00, 3),
    (cirrus_org_id, 'fast_sync', 'Fast Sync', 'per_seat', 'Active User', 5.00, 4),
    (cirrus_org_id, 'task_sync', 'Salesforce Task Sync', 'per_seat', 'Active User', 2.50, 5),
    (cirrus_org_id, 'personal_scheduling', 'Personal Scheduling', 'per_seat', 'Active User', 7.00, 6),
    (cirrus_org_id, 'meeting_prep', 'Meeting Prep', 'per_seat', 'Active User', 13.00, 7),
    (cirrus_org_id, 'team_scheduling', 'Team Scheduling', 'per_seat', 'Active User', 7.00, 8),
    (cirrus_org_id, 'smart_scheduler', 'Smart Scheduler', 'per_seat', 'Active User', 20.00, 9),
    (cirrus_org_id, 'conversation_analytics', 'Conversation Analytics', 'per_seat', 'Active User', 35.00, 10),
    (cirrus_org_id, 'sales_sequences', 'Sales Sequences', 'per_seat', 'Active User', 75.00, 11),
    (cirrus_org_id, 'email_templates', 'Email Templates', 'per_seat', 'Active User', 7.00, 12),
    (cirrus_org_id, 'email_blast', 'Email Blast', 'per_seat', 'Active User', 12.00, 13),
    (cirrus_org_id, 'buyer_signals', 'Buyer Signals', 'per_seat', 'Active User', 10.00, 14);

  -- Meeting Intelligence (tiered)
  INSERT INTO products (org_id, slug, name, type, unit_label, sort_order)
  VALUES (cirrus_org_id, 'meeting_intelligence', 'Meeting Intelligence', 'tiered', 'Hours', 15)
  RETURNING id INTO p_id;

  INSERT INTO product_tiers (org_id, product_id, min_units, max_units, unit_rate, sort_order) VALUES
    (cirrus_org_id, p_id, 1, 24, 12.00, 1),
    (cirrus_org_id, p_id, 25, 49, 10.50, 2),
    (cirrus_org_id, p_id, 50, 99, 9.50, 3),
    (cirrus_org_id, p_id, 100, 249, 8.50, 4),
    (cirrus_org_id, p_id, 250, 499, 7.50, 5),
    (cirrus_org_id, p_id, 500, 999, 6.50, 6),
    (cirrus_org_id, p_id, 1000, 2499, 5.50, 7),
    (cirrus_org_id, p_id, 2500, 4999, 5.00, 8),
    (cirrus_org_id, p_id, 5000, 9999, 4.50, 9),
    (cirrus_org_id, p_id, 10000, NULL, 4.00, 10);

  -- Live Coaching (tiered)
  INSERT INTO products (org_id, slug, name, type, unit_label, sort_order)
  VALUES (cirrus_org_id, 'live_coaching', 'Live Coaching', 'tiered', 'Hours', 16)
  RETURNING id INTO p_id;

  INSERT INTO product_tiers (org_id, product_id, min_units, max_units, unit_rate, sort_order) VALUES
    (cirrus_org_id, p_id, 1, 24, 22.00, 1),
    (cirrus_org_id, p_id, 25, 49, 20.00, 2),
    (cirrus_org_id, p_id, 50, 99, 18.00, 3),
    (cirrus_org_id, p_id, 100, 249, 16.00, 4),
    (cirrus_org_id, p_id, 250, 499, 14.00, 5),
    (cirrus_org_id, p_id, 500, 999, 12.00, 6),
    (cirrus_org_id, p_id, 1000, 2499, 10.00, 7),
    (cirrus_org_id, p_id, 2500, 4999, 9.00, 8),
    (cirrus_org_id, p_id, 5000, 9999, 8.00, 9),
    (cirrus_org_id, p_id, 10000, NULL, 7.00, 10);

  -- One-time services
  INSERT INTO products (org_id, slug, name, type, unit_label, price, sort_order) VALUES
    (cirrus_org_id, 'deploy_30', 'Enterprise Deployment & Configuration', 'one_time', '30 Day', 2500.00, 17),
    (cirrus_org_id, 'deploy_60', 'Enterprise Deployment & Configuration', 'one_time', '60 Day', 5000.00, 18),
    (cirrus_org_id, 'deploy_90', 'Enterprise Deployment & Configuration', 'one_time', '90 Day', 7500.00, 19),
    (cirrus_org_id, 'training', 'Technical Setup or Training', 'one_time', '1 Hour', 250.00, 20);

  -- Term discounts
  INSERT INTO discount_schedules (org_id, type, key, label, discount_pct, term_months, sort_order) VALUES
    (cirrus_org_id, 'term', 'monthly', 'Monthly', 0, 1, 1),
    (cirrus_org_id, 'term', 'quarterly', 'Quarterly', 0.05, 3, 2),
    (cirrus_org_id, 'term', '1_year', '1 Year', 0.10, 12, 3),
    (cirrus_org_id, 'term', '2_year', '2 Year', 0.20, 24, 4),
    (cirrus_org_id, 'term', '3_year', '3 Year', 0.30, 36, 5);

  -- Billing discounts
  INSERT INTO discount_schedules (org_id, type, key, label, discount_pct, sort_order) VALUES
    (cirrus_org_id, 'billing', 'monthly', 'Monthly', 0, 1),
    (cirrus_org_id, 'billing', 'quarterly', 'Quarterly', 0, 2),
    (cirrus_org_id, 'billing', 'annual', 'Annual', 0.10, 3);
END $$;
