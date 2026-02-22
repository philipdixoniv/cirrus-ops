-- 00013_stripe_native_pricebook.sql
-- Stripe-native price book tables: 1:1 mirrors of Stripe Product, Price, and Coupon objects.
-- These tables sit alongside the existing products/product_tiers/stripe_price_map tables.
-- The new composable (useStripePricebook) reads from these; old composable (useProducts) is unchanged.

-- ============================================================================
-- stripe_products — 1:1 mirror of Stripe Product object
-- ============================================================================
CREATE TABLE IF NOT EXISTS stripe_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment     TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),

  -- Stripe fields
  stripe_id       TEXT NOT NULL,                          -- prod_xxx
  active          BOOLEAN NOT NULL DEFAULT true,
  name            TEXT NOT NULL,
  description     TEXT,
  default_price   TEXT,                                   -- price_xxx reference
  images          JSONB DEFAULT '[]'::jsonb,
  metadata        JSONB DEFAULT '{}'::jsonb,
  unit_label      TEXT,
  tax_code        TEXT,
  statement_descriptor TEXT,
  url             TEXT,
  marketing_features JSONB DEFAULT '[]'::jsonb,
  livemode        BOOLEAN DEFAULT false,
  stripe_created  BIGINT,                                 -- Stripe unix timestamp
  stripe_updated  BIGINT,                                 -- Stripe unix timestamp

  -- Sync tracking
  synced_at       TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, environment, stripe_id)
);

-- ============================================================================
-- stripe_prices — 1:1 mirror of Stripe Price object (replaces stripe_price_map)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stripe_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment     TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),

  -- Stripe fields
  stripe_id       TEXT NOT NULL,                          -- price_xxx
  product_stripe_id TEXT NOT NULL,                        -- prod_xxx (TEXT, not FK — avoids import ordering issues)
  active          BOOLEAN NOT NULL DEFAULT true,
  currency        TEXT NOT NULL DEFAULT 'usd',
  unit_amount     INTEGER,                                -- amount in cents
  unit_amount_decimal TEXT,                               -- for sub-cent precision
  billing_scheme  TEXT CHECK (billing_scheme IN ('per_unit', 'tiered')),
  type            TEXT NOT NULL CHECK (type IN ('one_time', 'recurring')),

  -- Recurring fields (flattened from Stripe recurring object for SQL filtering)
  recurring_interval       TEXT CHECK (recurring_interval IN ('day', 'week', 'month', 'year')),
  recurring_interval_count INTEGER,
  recurring_usage_type     TEXT CHECK (recurring_usage_type IN ('metered', 'licensed')),
  recurring_meter          TEXT,

  -- Tiered pricing
  tiers           JSONB,                                  -- [{up_to, flat_amount, flat_amount_decimal, unit_amount, unit_amount_decimal}]
  tiers_mode      TEXT CHECK (tiers_mode IN ('graduated', 'volume')),

  -- Other Stripe fields
  transform_quantity JSONB,                               -- {divide_by, round}
  lookup_key      TEXT,
  nickname        TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  tax_behavior    TEXT CHECK (tax_behavior IN ('exclusive', 'inclusive', 'unspecified') OR tax_behavior IS NULL),
  custom_unit_amount JSONB,                               -- {enabled, minimum, maximum, preset}
  livemode        BOOLEAN DEFAULT false,
  stripe_created  BIGINT,                                 -- Stripe unix timestamp

  -- Sync tracking
  synced_at       TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, environment, stripe_id)
);

-- ============================================================================
-- stripe_coupons — 1:1 mirror of Stripe Coupon object
-- ============================================================================
CREATE TABLE IF NOT EXISTS stripe_coupons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment     TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),

  -- Stripe fields
  stripe_id       TEXT NOT NULL,                          -- coupon ID
  name            TEXT,
  percent_off     DECIMAL(5,2),                           -- e.g. 25.50
  amount_off      INTEGER,                                -- in cents
  currency        TEXT,
  duration        TEXT NOT NULL CHECK (duration IN ('once', 'repeating', 'forever')),
  duration_in_months INTEGER,
  max_redemptions INTEGER,
  redeem_by       BIGINT,                                 -- Stripe unix timestamp
  times_redeemed  INTEGER DEFAULT 0,
  applies_to      JSONB,                                  -- {products: [prod_xxx, ...]}
  metadata        JSONB DEFAULT '{}'::jsonb,
  valid           BOOLEAN DEFAULT true,
  livemode        BOOLEAN DEFAULT false,

  -- Sync tracking
  synced_at       TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, environment, stripe_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- stripe_products indexes
CREATE INDEX idx_stripe_products_org_env ON stripe_products(org_id, environment);
CREATE INDEX idx_stripe_products_org_env_active ON stripe_products(org_id, environment) WHERE active = true;
CREATE INDEX idx_stripe_products_stripe_id ON stripe_products(stripe_id);

-- stripe_prices indexes
CREATE INDEX idx_stripe_prices_org_env ON stripe_prices(org_id, environment);
CREATE INDEX idx_stripe_prices_org_env_active ON stripe_prices(org_id, environment) WHERE active = true;
CREATE INDEX idx_stripe_prices_product ON stripe_prices(product_stripe_id);
CREATE INDEX idx_stripe_prices_stripe_id ON stripe_prices(stripe_id);
CREATE INDEX idx_stripe_prices_recurring ON stripe_prices(org_id, environment, recurring_interval, recurring_interval_count) WHERE type = 'recurring';

-- stripe_coupons indexes
CREATE INDEX idx_stripe_coupons_org_env ON stripe_coupons(org_id, environment);
CREATE INDEX idx_stripe_coupons_org_env_valid ON stripe_coupons(org_id, environment) WHERE valid = true;

-- ============================================================================
-- updated_at triggers (reuse existing pattern)
-- ============================================================================

CREATE TRIGGER set_stripe_products_updated_at
  BEFORE UPDATE ON stripe_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_stripe_prices_updated_at
  BEFORE UPDATE ON stripe_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_stripe_coupons_updated_at
  BEFORE UPDATE ON stripe_coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE stripe_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON stripe_products
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON stripe_prices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON stripe_coupons
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );
