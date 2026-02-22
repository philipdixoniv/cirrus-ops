-- Phase 5: Full SaaS Analytics

-- ============================================================
-- MRR Snapshots
-- ============================================================
CREATE TABLE mrr_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  subscription_id TEXT,
  mrr DECIMAL(12,2) NOT NULL DEFAULT 0,
  arr DECIMAL(12,2) NOT NULL DEFAULT 0,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('new', 'expansion', 'contraction', 'churn', 'reactivation')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Revenue Entries
-- ============================================================
CREATE TABLE revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  recognized_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  deferred_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('subscription', 'service')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Forecast Weights (per-org stage weights)
-- ============================================================
CREATE TABLE forecast_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  weight DECIMAL(5,4) NOT NULL DEFAULT 0,
  UNIQUE(org_id, stage)
);

-- Seed default forecast weights for existing orgs
INSERT INTO forecast_weights (org_id, stage, weight)
SELECT o.id, s.stage, s.weight
FROM organizations o
CROSS JOIN (VALUES
  ('prospecting', 0.10),
  ('qualification', 0.25),
  ('proposal', 0.50),
  ('negotiation', 0.75),
  ('closed_won', 1.00),
  ('closed_lost', 0.00)
) AS s(stage, weight);

-- ============================================================
-- Add forecast columns to opportunities
-- ============================================================
ALTER TABLE opportunities ADD COLUMN expected_close_date DATE;
ALTER TABLE opportunities ADD COLUMN forecast_category TEXT DEFAULT 'pipeline'
  CHECK (forecast_category IN ('pipeline', 'best_case', 'commit', 'closed'));

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE mrr_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON mrr_snapshots
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON revenue_entries
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON forecast_weights
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );
