-- RPC function to create an org + add the creator as owner in one step.
-- Uses SECURITY DEFINER to bypass RLS for this bootstrapping operation.
-- Callable by authenticated users OR anon (for dev bypass mode).

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
  -- Use provided user_id or fall back to auth.uid()
  effective_user_id := COALESCE(owner_user_id, auth.uid());

  IF effective_user_id IS NULL THEN
    RAISE EXCEPTION 'No user ID provided and no authenticated session';
  END IF;

  -- Create the organization
  INSERT INTO organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING id INTO new_org_id;

  -- Add creator as owner
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (new_org_id, effective_user_id, 'owner');

  RETURN json_build_object(
    'id', new_org_id,
    'name', org_name,
    'slug', org_slug
  );
END;
$$;
