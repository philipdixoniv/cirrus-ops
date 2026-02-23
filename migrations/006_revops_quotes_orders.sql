-- Migration 006: RevOps Sales Quotes & Orders
-- Creates tables for sales quoting and order management

-- ============================================================
-- Sales Quotes
-- ============================================================

CREATE TABLE sales_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_company TEXT,
    customer_email TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(12,2),
    discount_pct NUMERIC(5,2) DEFAULT 0,
    total NUMERIC(12,2),
    notes TEXT,
    valid_until DATE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sales_quotes_status ON sales_quotes(status);
CREATE INDEX idx_sales_quotes_customer_company ON sales_quotes(customer_company);
CREATE INDEX idx_sales_quotes_created_at ON sales_quotes(created_at);

CREATE TRIGGER sales_quotes_updated_at
    BEFORE UPDATE ON sales_quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Sales Quote Line Items
-- ============================================================

CREATE TABLE sales_quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES sales_quotes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10,2) DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL,
    total NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    sort_order INT DEFAULT 0
);

CREATE INDEX idx_sales_quote_items_quote ON sales_quote_items(quote_id);

-- ============================================================
-- Orders
-- ============================================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES sales_quotes(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_company TEXT,
    customer_email TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    total NUMERIC(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_quote ON orders(quote_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);

CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
