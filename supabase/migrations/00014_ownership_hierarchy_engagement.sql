-- Phase 8: Ownership, Reporting Hierarchy & Engagement Tracking

-- ============================================================
-- Add display_name, email, reports_to to org_members
-- ============================================================
ALTER TABLE org_members ADD COLUMN display_name TEXT;
ALTER TABLE org_members ADD COLUMN email TEXT;
ALTER TABLE org_members ADD COLUMN reports_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Constraint: cannot report to yourself
ALTER TABLE org_members ADD CONSTRAINT chk_no_self_report CHECK (reports_to != user_id);

-- Backfill display_name and email from auth.users
UPDATE org_members om SET
  display_name = COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ),
  email = u.email
FROM auth.users u
WHERE u.id = om.user_id;

-- ============================================================
-- Add owner_id to accounts, contacts, opportunities, quotes
-- ============================================================
ALTER TABLE accounts ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill owner_id from created_by
UPDATE accounts SET owner_id = created_by WHERE owner_id IS NULL AND created_by IS NOT NULL;
UPDATE contacts SET owner_id = created_by WHERE owner_id IS NULL AND created_by IS NOT NULL;
UPDATE opportunities SET owner_id = created_by WHERE owner_id IS NULL AND created_by IS NOT NULL;
UPDATE quotes SET owner_id = created_by WHERE owner_id IS NULL AND created_by IS NOT NULL;

-- ============================================================
-- Add performed_by to activities
-- ============================================================
ALTER TABLE activities ADD COLUMN performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_activities_performed_by ON activities (org_id, performed_by, activity_date);
CREATE INDEX idx_opportunities_owner ON opportunities (org_id, owner_id);
CREATE INDEX idx_quotes_owner ON quotes (org_id, owner_id);
CREATE INDEX idx_accounts_owner ON accounts (org_id, owner_id);
CREATE INDEX idx_org_members_reports_to ON org_members (org_id, reports_to);

-- ============================================================
-- RPC: get_team_subtree
-- Returns all user_ids in a manager's downward tree (including self)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_team_subtree(p_org_id UUID, p_user_id UUID)
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH RECURSIVE subtree AS (
    -- Base case: the manager themselves
    SELECT user_id
    FROM org_members
    WHERE org_id = p_org_id AND user_id = p_user_id

    UNION

    -- Recursive case: anyone who reports to a member of the subtree
    SELECT om.user_id
    FROM org_members om
    INNER JOIN subtree s ON om.reports_to = s.user_id
    WHERE om.org_id = p_org_id
  )
  SELECT ARRAY(SELECT user_id FROM subtree);
$$;

-- ============================================================
-- RPC: get_engagement_summary
-- Aggregates activity counts + document counts + share link views per user
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_engagement_summary(
  p_org_id UUID,
  p_user_ids UUID[],
  p_since TIMESTAMPTZ
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
  SELECT json_agg(row_data) INTO result
  FROM (
    SELECT
      u.user_id,
      COALESCE(act.meetings, 0) AS meetings,
      COALESCE(act.calls, 0) AS calls,
      COALESCE(act.emails, 0) AS emails,
      COALESCE(act.tasks, 0) AS tasks,
      COALESCE(doc.documents_shared, 0) AS documents_shared,
      COALESCE(sl.share_link_views, 0) AS share_link_views
    FROM unnest(p_user_ids) AS u(user_id)
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE type = 'meeting') AS meetings,
        COUNT(*) FILTER (WHERE type = 'call') AS calls,
        COUNT(*) FILTER (WHERE type = 'email') AS emails,
        COUNT(*) FILTER (WHERE type = 'task') AS tasks
      FROM activities a
      WHERE a.org_id = p_org_id
        AND a.performed_by = u.user_id
        AND a.activity_date >= p_since
    ) act ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS documents_shared
      FROM quote_documents qd
      JOIN quotes q ON q.id = qd.quote_id
      WHERE qd.org_id = p_org_id
        AND q.created_by = u.user_id
        AND qd.created_at >= p_since
    ) doc ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(qsl.view_count), 0) AS share_link_views
      FROM quote_share_links qsl
      JOIN quotes q ON q.id = qsl.quote_id
      WHERE qsl.org_id = p_org_id
        AND q.created_by = u.user_id
        AND qsl.created_at >= p_since
    ) sl ON true
  ) row_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================
-- Update get_user_orgs to include display_name
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_orgs(p_user_id UUID)
RETURNS SETOF JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT json_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug,
    'role', om.role,
    'display_name', om.display_name
  )
  FROM org_members om
  JOIN organizations o ON o.id = om.org_id
  WHERE om.user_id = p_user_id
  ORDER BY om.created_at;
$$;
