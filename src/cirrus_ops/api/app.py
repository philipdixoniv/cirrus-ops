"""FastAPI application factory for the Cirrus Ops API."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from cirrus_ops.api.routers.auth import router as auth_router
from cirrus_ops.api.routers.profiles import router as profiles_router
from cirrus_ops.api.routers.mining import router as mining_router
from cirrus_ops.api.routers.browse import router as browse_router
from cirrus_ops.api.routers.campaigns import router as campaigns_router
from cirrus_ops.api.routers.sales import router as sales_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    # Startup: ensure DB client is initialized
    from cirrus_ops import db
    db.client()
    yield
    # Shutdown: nothing to clean up for now


app = FastAPI(
    title="Cirrus Ops API",
    version="0.1.0",
    description="REST API for managing mining profiles, extracting stories, and generating content.",
    lifespan=lifespan,
)

# CORS middleware for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(profiles_router, prefix="/api/profiles", tags=["profiles"])
app.include_router(mining_router, prefix="/api/mining", tags=["mining"])
app.include_router(browse_router, prefix="/api/browse", tags=["browse"])
app.include_router(campaigns_router, prefix="/api/campaigns", tags=["campaigns"])
app.include_router(sales_router, prefix="/api/sales", tags=["sales"])


@app.get("/health")
def health():
    return {"status": "ok"}
