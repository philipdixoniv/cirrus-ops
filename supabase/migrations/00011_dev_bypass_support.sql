-- Dev bypass support: RPC functions that use SECURITY DEFINER to bypass RLS
-- These allow the app to function in dev mode without a real auth session.

-- Load orgs for a given user (bypasses RLS)
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
    'role', om.role
  )
  FROM org_members om
  JOIN organizations o ON o.id = om.org_id
  WHERE om.user_id = p_user_id
  ORDER BY om.created_at;
$$;

-- Dev-only: list all orgs (no user filter). For dev bypass mode.
CREATE OR REPLACE FUNCTION public.get_all_orgs_dev()
RETURNS SETOF JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT json_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug
  )
  FROM organizations o
  ORDER BY o.created_at;
$$;

-- Create org with owner (updated: skip membership if user_id is null)
CREATE OR REPLACE FUNCTION public.create_org_with_owner(
  org_name TEXT,
  org_slug TEXT,
  owner_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  effective_user_id UUID;
BEGIN
  effective_user_id := COALESCE(owner_user_id, auth.uid());

  -- Create the organization
  INSERT INTO organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING id INTO new_org_id;

  -- Add creator as owner if we have a valid user
  IF effective_user_id IS NOT NULL THEN
    INSERT INTO org_members (org_id, user_id, role)
    VALUES (new_org_id, effective_user_id, 'owner');
  END IF;

  RETURN json_build_object(
    'id', new_org_id,
    'name', org_name,
    'slug', org_slug
  );
END;
$$;
