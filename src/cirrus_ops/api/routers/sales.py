"""Sales endpoints: quotes and orders CRUD with status transitions."""

from fastapi import APIRouter, HTTPException, Query

from cirrus_ops import db
from cirrus_ops.api.schemas import (
    OrderCreate,
    OrderResponse,
    OrderUpdate,
    PaginatedResponse,
    SalesQuoteCreate,
    SalesQuoteDetailResponse,
    SalesQuoteItemResponse,
    SalesQuoteResponse,
    SalesQuoteUpdate,
)

router = APIRouter()

# Valid status transitions for sales quotes
_QUOTE_TRANSITIONS = {
    "draft": {"sent"},
    "sent": {"accepted", "rejected"},
    "accepted": set(),
    "rejected": set(),
    "expired": set(),
}

_ORDER_STATUSES = {"pending", "processing", "fulfilled", "cancelled"}


# -- Sales Quotes --


@router.get("/quotes", response_model=PaginatedResponse)
def list_sales_quotes(
    status: str | None = None,
    customer_company: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List sales quotes with optional filters."""
    rows, total = db.list_sales_quotes(
        status=status,
        customer_company=customer_company,
        limit=limit,
        offset=offset,
    )
    items = [SalesQuoteResponse(**r) for r in rows]
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/quotes", response_model=SalesQuoteDetailResponse, status_code=201)
def create_sales_quote(data: SalesQuoteCreate):
    """Create a new sales quote with optional line items."""
    quote_data = data.model_dump(exclude={"items"})
    quote = db.create_sales_quote(quote_data)

    items = []
    if data.items:
        item_rows = [item.model_dump() for item in data.items]
        items = db.upsert_sales_quote_items(quote["id"], item_rows)
        quote = db.recalculate_sales_quote_totals(quote["id"])

    return SalesQuoteDetailResponse(
        **quote,
        items=[SalesQuoteItemResponse(**i) for i in items],
    )


@router.get("/quotes/{quote_id}", response_model=SalesQuoteDetailResponse)
def get_sales_quote(quote_id: str):
    """Get a sales quote with its line items."""
    quote = db.get_sales_quote(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Sales quote not found: {quote_id}")
    items = db.get_sales_quote_items(quote_id)
    return SalesQuoteDetailResponse(
        **quote,
        items=[SalesQuoteItemResponse(**i) for i in items],
    )


@router.put("/quotes/{quote_id}", response_model=SalesQuoteDetailResponse)
def update_sales_quote(quote_id: str, data: SalesQuoteUpdate):
    """Update a sales quote (only draft or sent)."""
    quote = db.get_sales_quote(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Sales quote not found: {quote_id}")
    if quote["status"] not in ("draft", "sent"):
        raise HTTPException(status_code=400, detail=f"Cannot edit quote in '{quote['status']}' status")

    update_data = data.model_dump(exclude_none=True, exclude={"items"})
    if update_data:
        quote = db.update_sales_quote(quote_id, update_data)

    if data.items is not None:
        item_rows = [item.model_dump() for item in data.items]
        db.upsert_sales_quote_items(quote_id, item_rows)
        quote = db.recalculate_sales_quote_totals(quote_id)

    items = db.get_sales_quote_items(quote_id)
    return SalesQuoteDetailResponse(
        **quote,
        items=[SalesQuoteItemResponse(**i) for i in items],
    )


@router.delete("/quotes/{quote_id}", status_code=204)
def delete_sales_quote(quote_id: str):
    """Delete a sales quote."""
    quote = db.get_sales_quote(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Sales quote not found: {quote_id}")
    db.delete_sales_quote(quote_id)
    return None


def _transition_quote(quote_id: str, target_status: str) -> dict:
    """Validate and perform a status transition on a sales quote."""
    quote = db.get_sales_quote(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Sales quote not found: {quote_id}")
    allowed = _QUOTE_TRANSITIONS.get(quote["status"], set())
    if target_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{quote['status']}' to '{target_status}'",
        )
    return db.update_sales_quote(quote_id, {"status": target_status})


@router.post("/quotes/{quote_id}/send", response_model=SalesQuoteResponse)
def send_sales_quote(quote_id: str):
    """Transition quote from draft to sent. Requires at least one line item."""
    items = db.get_sales_quote_items(quote_id)
    if not items:
        raise HTTPException(status_code=400, detail="Cannot send a quote with no line items")
    return _transition_quote(quote_id, "sent")


@router.post("/quotes/{quote_id}/accept", response_model=SalesQuoteResponse)
def accept_sales_quote(quote_id: str):
    """Transition quote from sent to accepted."""
    return _transition_quote(quote_id, "accepted")


@router.post("/quotes/{quote_id}/reject", response_model=SalesQuoteResponse)
def reject_sales_quote(quote_id: str):
    """Transition quote from sent to rejected."""
    return _transition_quote(quote_id, "rejected")


@router.post("/quotes/{quote_id}/convert-to-order", response_model=OrderResponse)
def convert_quote_to_order(quote_id: str):
    """Convert an accepted quote into an order."""
    quote = db.get_sales_quote(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Sales quote not found: {quote_id}")
    if quote["status"] != "accepted":
        raise HTTPException(status_code=400, detail="Only accepted quotes can be converted to orders")
    order = db.create_order({
        "quote_id": quote_id,
        "customer_name": quote["customer_name"],
        "customer_company": quote.get("customer_company"),
        "customer_email": quote.get("customer_email"),
        "total": quote.get("total"),
        "notes": quote.get("notes"),
    })
    return order


# -- Orders --


@router.get("/orders", response_model=PaginatedResponse)
def list_orders(
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List orders with optional filters."""
    rows, total = db.list_orders(status=status, limit=limit, offset=offset)
    items = [OrderResponse(**r) for r in rows]
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(order_id: str):
    """Get an order by ID."""
    order = db.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail=f"Order not found: {order_id}")
    return order


@router.put("/orders/{order_id}", response_model=OrderResponse)
def update_order(order_id: str, data: OrderUpdate):
    """Update order status or notes."""
    order = db.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail=f"Order not found: {order_id}")
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if data.status and data.status not in _ORDER_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid order status: {data.status}")
    updated = db.update_order(order_id, update_data)
    return updated
