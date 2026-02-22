-- 00019_quote_templates.sql
-- Dynamic quote configuration templates: allows orgs to define custom quote structures
-- driven by their Stripe catalog instead of hardcoded product definitions.

-- ============================================================================
-- quote_templates — top-level quote configuration template
-- ============================================================================
CREATE TABLE quote_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  is_default      BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,

  -- Deal terms (which options appear in dropdowns)
  term_lengths         JSONB NOT NULL DEFAULT '["monthly","quarterly","1_year","2_year","3_year"]',
  billing_frequencies  JSONB NOT NULL DEFAULT '["monthly","quarterly","annual"]',
  payment_terms        JSONB NOT NULL DEFAULT '[30,45,60]',
  default_term_length       TEXT DEFAULT '1_year',
  default_billing_frequency TEXT DEFAULT 'annual',
  default_payment_terms     INTEGER DEFAULT 30,

  -- Discount rules (pricing.js-compatible maps)
  term_discounts    JSONB NOT NULL DEFAULT '{}',
  billing_discounts JSONB NOT NULL DEFAULT '{}',
  term_months_map   JSONB NOT NULL DEFAULT '{}',

  -- Approval thresholds
  approval_rules    JSONB NOT NULL DEFAULT '[]',

  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- quote_template_sections — sections within a template (per_seat, tiered, one_time)
-- ============================================================================
CREATE TABLE quote_template_sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES quote_templates(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  section_type    TEXT NOT NULL DEFAULT 'per_seat'
    CHECK (section_type IN ('per_seat', 'tiered', 'one_time')),
  discount_applicable BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- quote_template_section_products — product assignments within sections
-- ============================================================================
CREATE TABLE quote_template_section_products (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_id               UUID NOT NULL REFERENCES quote_template_sections(id) ON DELETE CASCADE,
  stripe_product_stripe_id TEXT NOT NULL,
  stripe_instance_id       UUID REFERENCES stripe_instances(id),
  display_name             TEXT,
  unit_label               TEXT DEFAULT 'Active User',
  sort_order               INTEGER DEFAULT 0,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, stripe_product_stripe_id)
);

-- ============================================================================
-- Alterations to existing tables
-- ============================================================================
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES quote_templates(id) ON DELETE SET NULL;
ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS section_name TEXT;
ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS section_type TEXT;
ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS stripe_product_stripe_id TEXT;

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX idx_quote_templates_org ON quote_templates(org_id);
CREATE INDEX idx_quote_templates_org_active ON quote_templates(org_id) WHERE is_active = true;
CREATE INDEX idx_quote_templates_org_default ON quote_templates(org_id) WHERE is_default = true;

CREATE INDEX idx_quote_template_sections_template ON quote_template_sections(template_id);
CREATE INDEX idx_quote_template_sections_org ON quote_template_sections(org_id);

CREATE INDEX idx_quote_template_section_products_section ON quote_template_section_products(section_id);
CREATE INDEX idx_quote_template_section_products_org ON quote_template_section_products(org_id);

CREATE INDEX idx_quotes_template ON quotes(template_id) WHERE template_id IS NOT NULL;

-- ============================================================================
-- updated_at triggers
-- ============================================================================
CREATE TRIGGER set_quote_templates_updated_at
  BEFORE UPDATE ON quote_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_quote_template_sections_updated_at
  BEFORE UPDATE ON quote_template_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Single-default constraint: only one is_default=true per org
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE quote_templates
    SET is_default = false
    WHERE org_id = NEW.org_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_single_default_quote_template
  BEFORE INSERT OR UPDATE ON quote_templates
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION enforce_single_default_template();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_template_section_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON quote_templates
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON quote_template_sections
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org isolation" ON quote_template_section_products
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );
