-- 00017_stripe_api_parity.sql
-- Add missing columns discovered by querying the live Stripe API directly.
-- Brings stripe_products, stripe_prices, and stripe_coupons to full parity
-- with Stripe's actual API response shape.

-- ============================================================================
-- 1. stripe_products: add "type" (service vs good)
-- ============================================================================
ALTER TABLE stripe_products
  ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('service', 'good')) DEFAULT 'service';

-- ============================================================================
-- 2. stripe_prices: add recurring sub-fields
-- ============================================================================
ALTER TABLE stripe_prices
  ADD COLUMN IF NOT EXISTS recurring_aggregate_usage TEXT
    CHECK (recurring_aggregate_usage IN ('sum', 'last_during_period', 'last_ever', 'max') OR recurring_aggregate_usage IS NULL);

ALTER TABLE stripe_prices
  ADD COLUMN IF NOT EXISTS recurring_trial_period_days INTEGER;

-- ============================================================================
-- 3. stripe_coupons: add created timestamp and precise percent_off
-- ============================================================================
ALTER TABLE stripe_coupons
  ADD COLUMN IF NOT EXISTS stripe_created BIGINT;

ALTER TABLE stripe_coupons
  ADD COLUMN IF NOT EXISTS percent_off_precise DOUBLE PRECISION;
