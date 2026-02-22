-- 00018_stripe_full_parity.sql
-- Final columns needed for exact Stripe API parity (current, non-legacy).
-- Adds package_dimensions/shippable to products, currency_options to prices & coupons.

-- ============================================================================
-- 1. stripe_products: physical goods support
-- ============================================================================
ALTER TABLE stripe_products
  ADD COLUMN IF NOT EXISTS shippable BOOLEAN;

ALTER TABLE stripe_products
  ADD COLUMN IF NOT EXISTS package_dimensions JSONB;
  -- Expected shape: { "height": float, "length": float, "weight": float, "width": float }

-- ============================================================================
-- 2. stripe_prices: multi-currency pricing
-- ============================================================================
ALTER TABLE stripe_prices
  ADD COLUMN IF NOT EXISTS currency_options JSONB;
  -- Expected shape: { "eur": { "unit_amount": 1000, ... }, "gbp": { ... } }

-- ============================================================================
-- 3. stripe_coupons: multi-currency fixed-amount discounts
-- ============================================================================
ALTER TABLE stripe_coupons
  ADD COLUMN IF NOT EXISTS currency_options JSONB;
  -- Expected shape: { "eur": { "amount_off": 500 }, "gbp": { "amount_off": 450 } }
