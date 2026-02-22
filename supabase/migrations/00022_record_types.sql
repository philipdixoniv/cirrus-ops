-- Record types on quote templates, quotes, and orders
-- Supports: new_customer, upsell, renewal

ALTER TABLE quote_templates
  ADD COLUMN IF NOT EXISTS record_type TEXT DEFAULT 'new_customer'
    CHECK (record_type IN ('new_customer', 'upsell', 'renewal'));

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS record_type TEXT DEFAULT 'new_customer'
    CHECK (record_type IN ('new_customer', 'upsell', 'renewal'));

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS record_type TEXT
    CHECK (record_type IN ('new_customer', 'upsell', 'renewal'));

CREATE INDEX IF NOT EXISTS idx_quote_templates_record_type
  ON quote_templates(org_id, record_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quotes_record_type
  ON quotes(org_id, record_type);
