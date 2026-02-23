"""Auth router — user info and organization management."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from cirrus_ops import db
from cirrus_ops.api.deps import get_current_user_id

router = APIRouter()


class OrgCreate(BaseModel):
    name: str


class OrgResponse(BaseModel):
    id: str
    name: str
    role: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str | None = None
    name: str | None = None


@router.get("/me", response_model=UserResponse)
async def get_me(user_id: str | None = Depends(get_current_user_id)):
    """Return current user info from Supabase auth.users metadata."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin = db.client()
    result = admin.auth.admin.get_user_by_id(user_id)
    user = result.user
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    metadata = user.user_metadata or {}
    return UserResponse(
        id=user.id,
        email=user.email,
        name=metadata.get("full_name") or metadata.get("name"),
    )


@router.get("/orgs", response_model=list[OrgResponse])
async def list_orgs(user_id: str | None = Depends(get_current_user_id)):
    """Return organizations the current user belongs to."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin = db.client()
    result = (
        admin
        .table("org_members")
        .select("org_id, role, organizations(id, name)")
        .eq("user_id", user_id)
        .execute()
    )

    orgs = []
    for row in result.data or []:
        org_data = row.get("organizations")
        if org_data:
            orgs.append(OrgResponse(
                id=org_data["id"],
                name=org_data["name"],
                role=row.get("role"),
            ))
    return orgs


@router.post("/orgs", response_model=OrgResponse)
async def create_org(
    body: OrgCreate,
    user_id: str | None = Depends(get_current_user_id),
):
    """Create a new organization and make the current user the owner."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin = db.client()

    # Try to use the RPC if available, otherwise do it manually
    try:
        result = admin.rpc(
            "create_org_with_owner",
            {"org_name": body.name, "owner_id": user_id},
        ).execute()
        if result.data:
            return OrgResponse(id=result.data, name=body.name, role="owner")
    except Exception:
        pass

    # Fallback: insert org + membership manually
    org_result = (
        admin.table("organizations").insert({"name": body.name}).execute()
    )
    if not org_result.data:
        raise HTTPException(status_code=500, detail="Failed to create organization")

    org = org_result.data[0]
    admin.table("org_members").insert({
        "org_id": org["id"],
        "user_id": user_id,
        "role": "owner",
    }).execute()

    return OrgResponse(id=org["id"], name=org["name"], role="owner")
