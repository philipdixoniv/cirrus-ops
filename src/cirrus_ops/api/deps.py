"""Shared dependencies for the Cirrus Ops API."""

import json

from fastapi import Header, HTTPException, Depends
from supabase import create_client, Client

from cirrus_ops import db
from cirrus_ops.config import settings


def get_db():
    """Return the DB module. Placeholder for future dependency injection."""
    return db


async def get_current_user_id(authorization: str = Header(default="")) -> str | None:
    """Extract user ID from the JWT token.

    For system/sync endpoints that don't require auth, this returns None.
    For user-facing endpoints, use get_org_id which validates membership.
    """
    if not authorization:
        return None

    jwt = authorization.removeprefix("Bearer ").strip()
    if not jwt:
        return None

    try:
        import base64
        parts = jwt.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        payload += "=" * (4 - len(payload) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(payload))
        return decoded.get("sub")
    except Exception:
        return None


async def get_user_client(authorization: str = Header(default="")) -> Client | None:
    """Create a Supabase client using the user's JWT (RLS enforced).

    Returns None if no authorization header is provided (allows fallback to admin client).
    """
    if not authorization:
        return None

    jwt = authorization.removeprefix("Bearer ").strip()
    if not jwt or not settings.supabase_anon_key:
        return None

    return create_client(
        settings.supabase_url,
        settings.supabase_anon_key,
        options={"headers": {"Authorization": f"Bearer {jwt}"}},
    )


async def get_org_id(
    x_org_id: str = Header(default="", alias="X-Org-Id"),
    user_id: str | None = Depends(get_current_user_id),
) -> str:
    """Validate user belongs to the requested org and return org_id.

    Raises 401 if no user, 403 if user is not a member of the org.
    """
    if not x_org_id:
        raise HTTPException(status_code=400, detail="X-Org-Id header required")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin = db.client()
    result = (
        admin
        .table("org_members")
        .select("id")
        .eq("org_id", x_org_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    return x_org_id


async def get_optional_org_id(
    x_org_id: str = Header(default="", alias="X-Org-Id"),
    user_id: str | None = Depends(get_current_user_id),
) -> str | None:
    """Like get_org_id but returns None if no auth headers are present.

    Allows backwards-compatible usage where unauthenticated requests still work.
    """
    if not x_org_id or not user_id:
        return None

    admin = db.client()
    result = (
        admin
        .table("org_members")
        .select("id")
        .eq("org_id", x_org_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None

    return x_org_id
