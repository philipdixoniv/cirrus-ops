-- Phase 3: Stripe Checkout & Payment Links

-- ============================================================
-- Add checkout columns to quotes
-- ============================================================
ALTER TABLE quotes ADD COLUMN stripe_checkout_session_id TEXT;
ALTER TABLE quotes ADD COLUMN stripe_payment_link TEXT;
ALTER TABLE quotes ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE quotes ADD COLUMN payment_status TEXT DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed'));
ALTER TABLE quotes ADD COLUMN paid_at TIMESTAMPTZ;

-- ============================================================
-- Payment Events
-- ============================================================
CREATE TABLE payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  stripe_event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON payment_events
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );
