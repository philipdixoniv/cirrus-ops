-- 00021_allow_additional_discount.sql
-- Adds a toggle to quote templates for enabling the additional discount field.

ALTER TABLE quote_templates
  ADD COLUMN IF NOT EXISTS allow_additional_discount BOOLEAN NOT NULL DEFAULT false;
