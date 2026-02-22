"""CRUD endpoints for mining profiles, content types, and knowledge docs."""

from fastapi import APIRouter, Depends, HTTPException

from cirrus_ops import db
from cirrus_ops.api.deps import get_org_id
from cirrus_ops.api.schemas import (
    ContentTypeCreate,
    ContentTypeResponse,
    ContentTypeUpdate,
    KnowledgeDocCreate,
    KnowledgeDocResponse,
    KnowledgeDocUpdate,
    ProfileCreate,
    ProfileListResponse,
    ProfileResponse,
    ProfileUpdate,
)

router = APIRouter()


# -- Profiles --


@router.get("", response_model=list[ProfileListResponse])
def list_profiles(org_id: str = Depends(get_org_id)):
    """List all mining profiles."""
    profiles = db.list_profiles(org_id=org_id)
    result = []
    for p in profiles:
        ct_count = len(db.get_profile_content_types(p["id"]))
        kd_count = len(db.get_profile_knowledge(p["id"]))
        result.append(
            ProfileListResponse(
                **p,
                content_type_count=ct_count,
                knowledge_doc_count=kd_count,
            )
        )
    return result


@router.post("", response_model=ProfileResponse, status_code=201)
def create_profile(data: ProfileCreate, org_id: str = Depends(get_org_id)):
    """Create a new mining profile."""
    existing = db.get_profile(data.name, org_id=org_id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Profile '{data.name}' already exists")
    profile_data = data.model_dump()
    profile_data["org_id"] = org_id
    profile = db.create_profile(profile_data)
    profile["content_types"] = []
    profile["knowledge"] = []
    return profile


@router.get("/{name}", response_model=ProfileResponse)
def get_profile(name: str, org_id: str = Depends(get_org_id)):
    """Get a profile with its content types and knowledge docs."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    profile["content_types"] = db.get_profile_content_types(profile["id"])
    profile["knowledge"] = db.get_profile_knowledge(profile["id"])
    return profile


@router.put("/{name}", response_model=ProfileResponse)
def update_profile(name: str, data: ProfileUpdate, org_id: str = Depends(get_org_id)):
    """Update a mining profile."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    updated = db.update_profile(profile["id"], update_data)
    updated["content_types"] = db.get_profile_content_types(updated["id"])
    updated["knowledge"] = db.get_profile_knowledge(updated["id"])
    return updated


@router.delete("/{name}", status_code=204)
def delete_profile(name: str, org_id: str = Depends(get_org_id)):
    """Delete a mining profile."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    db.delete_profile(profile["id"])


# -- Content Types --


@router.post("/{name}/content-types", response_model=ContentTypeResponse, status_code=201)
def create_content_type(name: str, data: ContentTypeCreate, org_id: str = Depends(get_org_id)):
    """Add a content type to a profile."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    existing = db.get_profile_content_type(profile["id"], data.name)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Content type '{data.name}' already exists in profile '{name}'",
        )
    ct = db.create_profile_content_type({**data.model_dump(), "profile_id": profile["id"]})
    return ct


@router.put("/{name}/content-types/{ct_name}", response_model=ContentTypeResponse)
def update_content_type(name: str, ct_name: str, data: ContentTypeUpdate, org_id: str = Depends(get_org_id)):
    """Update a content type."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    ct = db.get_profile_content_type(profile["id"], ct_name)
    if not ct:
        raise HTTPException(
            status_code=404,
            detail=f"Content type '{ct_name}' not found in profile '{name}'",
        )
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    return db.update_profile_content_type(ct["id"], update_data)


@router.delete("/{name}/content-types/{ct_name}", status_code=204)
def delete_content_type(name: str, ct_name: str, org_id: str = Depends(get_org_id)):
    """Delete a content type from a profile."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    ct = db.get_profile_content_type(profile["id"], ct_name)
    if not ct:
        raise HTTPException(
            status_code=404,
            detail=f"Content type '{ct_name}' not found in profile '{name}'",
        )
    db.delete_profile_content_type(ct["id"])


# -- Knowledge Docs --


@router.get("/{name}/knowledge", response_model=list[KnowledgeDocResponse])
def list_knowledge(name: str, usage: str | None = None, org_id: str = Depends(get_org_id)):
    """List knowledge docs for a profile, optionally filtered by usage."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    return db.get_profile_knowledge(profile["id"], usage=usage)


@router.post("/{name}/knowledge", response_model=KnowledgeDocResponse, status_code=201)
def create_knowledge(name: str, data: KnowledgeDocCreate, org_id: str = Depends(get_org_id)):
    """Add a knowledge doc to a profile."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    # Check for duplicate name
    existing = db.get_profile_knowledge(profile["id"])
    for k in existing:
        if k["name"] == data.name:
            raise HTTPException(
                status_code=409,
                detail=f"Knowledge doc '{data.name}' already exists in profile '{name}'",
            )
    return db.create_profile_knowledge({**data.model_dump(), "profile_id": profile["id"]})


@router.put("/{name}/knowledge/{doc_name}", response_model=KnowledgeDocResponse)
def update_knowledge(name: str, doc_name: str, data: KnowledgeDocUpdate, org_id: str = Depends(get_org_id)):
    """Update a knowledge doc."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    docs = db.get_profile_knowledge(profile["id"])
    target = next((d for d in docs if d["name"] == doc_name), None)
    if not target:
        raise HTTPException(
            status_code=404,
            detail=f"Knowledge doc '{doc_name}' not found in profile '{name}'",
        )
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    return db.update_profile_knowledge(target["id"], update_data)


@router.delete("/{name}/knowledge/{doc_name}", status_code=204)
def delete_knowledge(name: str, doc_name: str, org_id: str = Depends(get_org_id)):
    """Delete a knowledge doc from a profile."""
    profile = db.get_profile(name, org_id=org_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")
    docs = db.get_profile_knowledge(profile["id"])
    target = next((d for d in docs if d["name"] == doc_name), None)
    if not target:
        raise HTTPException(
            status_code=404,
            detail=f"Knowledge doc '{doc_name}' not found in profile '{name}'",
        )
    db.delete_profile_knowledge(target["id"])
