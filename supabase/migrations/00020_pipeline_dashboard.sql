-- Phase 20: Pipeline Dashboard RPCs
-- Provides aggregation functions for the manager pipeline dashboard.

-- ============================================================
-- RPC: get_pipeline_by_account
-- One row per account with contact count, activity count,
-- open quote count, total pipeline value, and latest dates.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pipeline_by_account(
  p_org_id UUID,
  p_owner_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_data ORDER BY row_data->>'total_pipeline_value' DESC) INTO result
  FROM (
    SELECT
      a.id AS account_id,
      a.name AS account_name,
      a.owner_id,
      COALESCE(c_count.cnt, 0) AS contact_count,
      COALESCE(act_count.cnt, 0) AS activity_count,
      COALESCE(q_agg.open_quote_count, 0) AS open_quote_count,
      COALESCE(q_agg.total_pipeline_value, 0) AS total_pipeline_value,
      q_agg.latest_quote_date,
      act_count.latest_activity_date,
      COALESCE(q_agg.owner_ids, ARRAY[]::UUID[]) AS owner_ids
    FROM accounts a
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS cnt
      FROM contacts ct
      WHERE ct.account_id = a.id AND ct.org_id = p_org_id
    ) c_count ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::INT AS cnt,
        MAX(act.activity_date) AS latest_activity_date
      FROM activities act
      JOIN contacts ct ON ct.id = act.contact_id
      WHERE ct.account_id = a.id AND act.org_id = p_org_id
    ) act_count ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::INT AS open_quote_count,
        COALESCE(SUM(q.tcv), 0)::NUMERIC AS total_pipeline_value,
        MAX(q.created_at) AS latest_quote_date,
        ARRAY_AGG(DISTINCT q.owner_id) FILTER (WHERE q.owner_id IS NOT NULL) AS owner_ids
      FROM opportunities o
      JOIN quotes q ON q.opportunity_id = o.id
      WHERE o.account_id = a.id
        AND o.org_id = p_org_id
        AND q.status IN ('draft', 'sent')
    ) q_agg ON true
    WHERE a.org_id = p_org_id
      AND (
        p_owner_ids IS NULL
        OR a.owner_id = ANY(p_owner_ids)
        OR q_agg.owner_ids && p_owner_ids
      )
      -- Only include accounts with open pipeline
      AND COALESCE(q_agg.open_quote_count, 0) > 0
  ) row_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================
-- RPC: get_stale_quotes
-- Quotes older than N days with no recent activity.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_stale_quotes(
  p_org_id UUID,
  p_stale_days INT DEFAULT 14,
  p_owner_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result JSON;
  cutoff TIMESTAMPTZ;
BEGIN
  cutoff := NOW() - (p_stale_days || ' days')::INTERVAL;

  SELECT json_agg(row_data ORDER BY row_data->>'age_days' DESC) INTO result
  FROM (
    SELECT
      q.id AS quote_id,
      q.status,
      q.mrr,
      q.tcv,
      q.owner_id,
      q.created_at,
      o.name AS opportunity_name,
      a.name AS account_name,
      a.id AS account_id,
      EXTRACT(DAY FROM NOW() - q.created_at)::INT AS age_days,
      COALESCE(last_act.latest, q.created_at) AS last_activity_date
    FROM quotes q
    JOIN opportunities o ON o.id = q.opportunity_id
    JOIN accounts a ON a.id = o.account_id
    LEFT JOIN LATERAL (
      SELECT MAX(act.activity_date) AS latest
      FROM activities act
      JOIN contacts ct ON ct.id = act.contact_id
      WHERE ct.account_id = a.id AND act.org_id = p_org_id
    ) last_act ON true
    WHERE q.org_id = p_org_id
      AND q.status IN ('draft', 'sent')
      AND q.created_at < cutoff
      AND (p_owner_ids IS NULL OR q.owner_id = ANY(p_owner_ids))
  ) row_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================
-- RPC: get_pipeline_waterfall
-- Weekly new pipeline creation totals for waterfall chart.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pipeline_waterfall(
  p_org_id UUID,
  p_weeks INT DEFAULT 12,
  p_owner_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_data ORDER BY row_data->>'week_start') INTO result
  FROM (
    SELECT
      DATE_TRUNC('week', q.created_at)::DATE AS week_start,
      COUNT(*)::INT AS quote_count,
      COALESCE(SUM(q.tcv), 0)::NUMERIC AS total_tcv,
      COUNT(*) FILTER (WHERE q.status = 'draft')::INT AS draft_count,
      COUNT(*) FILTER (WHERE q.status = 'sent')::INT AS sent_count,
      COUNT(*) FILTER (WHERE q.status = 'accepted')::INT AS accepted_count,
      COUNT(*) FILTER (WHERE q.status = 'rejected')::INT AS rejected_count
    FROM quotes q
    WHERE q.org_id = p_org_id
      AND q.created_at >= (NOW() - (p_weeks || ' weeks')::INTERVAL)
      AND (p_owner_ids IS NULL OR q.owner_id = ANY(p_owner_ids))
    GROUP BY DATE_TRUNC('week', q.created_at)
  ) row_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================
-- Indexes to support pipeline queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quotes_org_status_created
  ON quotes (org_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_account
  ON opportunities (account_id, org_id);
