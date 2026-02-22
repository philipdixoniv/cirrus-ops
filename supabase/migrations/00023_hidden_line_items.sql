-- Add hidden column to quote_line_items and quote_services
-- Hidden items are excluded from pricing and output but remain visible (dimmed) in the editor.

ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quote_services ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
