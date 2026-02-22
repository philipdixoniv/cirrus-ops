-- Fix Stripe credential storage + add product columns for price book

-- Normalize existing credentials: test_secret_key -> api_key/secret_key
UPDATE integrations
SET credentials = credentials || jsonb_build_object(
  'api_key', credentials->>'test_secret_key',
  'secret_key', credentials->>'test_secret_key'
)
WHERE provider = 'stripe'
  AND credentials ? 'test_secret_key'
  AND NOT (credentials ? 'api_key');

-- Also normalize live_secret_key for any production rows
UPDATE integrations
SET credentials = credentials || jsonb_build_object(
  'api_key', credentials->>'live_secret_key',
  'secret_key', credentials->>'live_secret_key'
)
WHERE provider = 'stripe'
  AND credentials ? 'live_secret_key'
  AND NOT (credentials ? 'api_key');

-- Add description and stripe_metadata to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stripe_metadata JSONB DEFAULT '{}';
