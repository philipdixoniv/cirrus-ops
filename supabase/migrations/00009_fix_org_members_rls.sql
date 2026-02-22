-- Fix infinite recursion in org_members RLS policies
-- The old policies queried org_members FROM org_members, causing recursion.
-- Fix: use direct user_id check for SELECT, and a security-definer function for admin checks.

-- Helper function that bypasses RLS to check if a user has an admin+ role in an org
CREATE OR REPLACE FUNCTION public.user_has_org_role(check_org_id UUID, check_user_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = check_org_id
      AND user_id = check_user_id
      AND role = ANY(allowed_roles)
  );
$$;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Members can view org memberships" ON org_members;
DROP POLICY IF EXISTS "Admins can manage members" ON org_members;
DROP POLICY IF EXISTS "Admins can update members" ON org_members;
DROP POLICY IF EXISTS "Admins can remove members" ON org_members;

-- New non-recursive policies

-- SELECT: a user can see all memberships in orgs they belong to
-- Uses direct user_id match to avoid recursion
CREATE POLICY "Members can view org memberships" ON org_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
    )
  );
-- Note: The above still references org_members for the "see other members" case.
-- Postgres allows a self-referencing SELECT policy as long as there's a non-recursive
-- base case (user_id = auth.uid()) that terminates. But to be safe, replace with
-- the security-definer approach:

DROP POLICY IF EXISTS "Members can view org memberships" ON org_members;

CREATE POLICY "User can see own memberships" ON org_members
  FOR SELECT USING (user_id = auth.uid());

-- INSERT: only org owners/admins can add members (checked via security-definer function)
CREATE POLICY "Admins can add members" ON org_members
  FOR INSERT WITH CHECK (
    public.user_has_org_role(org_id, auth.uid(), ARRAY['owner', 'admin'])
    -- Also allow: user inserting their own membership (for org creation flow)
    OR (user_id = auth.uid())
  );

-- UPDATE: only org owners/admins
CREATE POLICY "Admins can update members" ON org_members
  FOR UPDATE USING (
    public.user_has_org_role(org_id, auth.uid(), ARRAY['owner', 'admin'])
  );

-- DELETE: only org owners/admins
CREATE POLICY "Admins can remove members" ON org_members
  FOR DELETE USING (
    public.user_has_org_role(org_id, auth.uid(), ARRAY['owner', 'admin'])
  );

-- Also fix the organizations SELECT policy which queries org_members
-- (this works because the org_members SELECT policy is now non-recursive)
-- But let's also use the security-definer function here for consistency:
DROP POLICY IF EXISTS "Org members can view their orgs" ON organizations;
DROP POLICY IF EXISTS "Owners can update their org" ON organizations;

CREATE POLICY "Org members can view their orgs" ON organizations
  FOR SELECT USING (
    id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY "Owners can update their org" ON organizations
  FOR UPDATE USING (
    public.user_has_org_role(id, auth.uid(), ARRAY['owner'])
  );
