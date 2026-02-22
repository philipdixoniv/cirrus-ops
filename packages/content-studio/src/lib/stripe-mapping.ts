// Stripe API payload mappers — ported from RevOps

export interface StripeProductPayload {
  name: string;
  metadata: Record<string, string>;
}

export interface StripePricePayload {
  currency: string;
  unit_amount?: number;
  billing_scheme?: string;
  tiers_mode?: string;
  tiers?: Array<{ up_to: number | string; unit_amount: number }>;
  recurring?: { interval: string; interval_count: number };
  metadata: Record<string, string>;
}

export function mapProductToStripe(product: {
  id: string;
  name: string;
  org_id: string;
  slug: string;
  type: string;
}): StripeProductPayload {
  return {
    name: product.name,
    metadata: {
      cirrus_product_id: product.id,
      cirrus_org_id: product.org_id,
      cirrus_slug: product.slug,
      product_type: product.type,
    },
  };
}

export function mapPerSeatPriceToStripe(
  product: { id: string; monthly_price: number | string },
  interval: string,
): StripePricePayload {
  const intervalMap: Record<string, { interval: string; interval_count: number }> = {
    monthly: { interval: "month", interval_count: 1 },
    quarterly: { interval: "month", interval_count: 3 },
    annual: { interval: "year", interval_count: 1 },
  };

  const billing = intervalMap[interval] || intervalMap.monthly;
  const multiplier = interval === "annual" ? 12 : interval === "quarterly" ? 3 : 1;

  return {
    currency: "usd",
    unit_amount: Math.round(Number(product.monthly_price) * 100 * multiplier),
    recurring: {
      interval: billing.interval,
      interval_count: billing.interval_count,
    },
    metadata: {
      cirrus_product_id: product.id,
      billing_interval: interval,
    },
  };
}

export function mapTieredPriceToStripe(
  product: { id: string },
  productTiers: Array<{ max_units?: number | null; unit_rate: number | string }>,
  interval: string,
): StripePricePayload {
  const intervalMap: Record<string, { interval: string; interval_count: number }> = {
    monthly: { interval: "month", interval_count: 1 },
    quarterly: { interval: "month", interval_count: 3 },
    annual: { interval: "year", interval_count: 1 },
  };

  const billing = intervalMap[interval] || intervalMap.monthly;
  const multiplier = interval === "annual" ? 12 : interval === "quarterly" ? 3 : 1;

  const tiers = productTiers.map((t) => ({
    up_to: (t.max_units || "inf") as number | string,
    unit_amount: Math.round(Number(t.unit_rate) * 100 * multiplier),
  }));

  return {
    currency: "usd",
    billing_scheme: "tiered",
    tiers_mode: "volume",
    tiers,
    recurring: {
      interval: billing.interval,
      interval_count: billing.interval_count,
    },
    metadata: {
      cirrus_product_id: product.id,
      billing_interval: interval,
    },
  };
}

export function mapOneTimePriceToStripe(product: {
  id: string;
  price: number | string;
}): StripePricePayload {
  return {
    currency: "usd",
    unit_amount: Math.round(Number(product.price) * 100),
    metadata: {
      cirrus_product_id: product.id,
      product_type: "one_time",
    },
  };
}

export function mapAccountToStripeCustomer(
  account: { id: string; name: string },
  orgId: string,
): { name: string; metadata: Record<string, string> } {
  return {
    name: account.name,
    metadata: {
      cirrus_account_id: account.id,
      cirrus_org_id: orgId,
    },
  };
}

export function buildCheckoutLineItems(
  quoteLineItems: Array<{ product_id: string; quantity: number }>,
  _quoteServices: any[],
  stripePriceMap: Array<{
    product_id: string;
    billing_interval: string;
    is_active: boolean;
    stripe_price_id: string;
  }>,
  billingInterval: string,
): Array<{ price: string; quantity: number }> {
  const lineItems: Array<{ price: string; quantity: number }> = [];

  for (const li of quoteLineItems) {
    const priceMapping = stripePriceMap.find(
      (m) => m.product_id === li.product_id && m.billing_interval === billingInterval && m.is_active,
    );
    if (priceMapping) {
      lineItems.push({ price: priceMapping.stripe_price_id, quantity: li.quantity });
    }
  }

  return lineItems;
}

export function buildAddInvoiceItems(
  quoteServices: Array<{ product_id: string; quantity: number }>,
  stripePriceMap: Array<{
    product_id: string;
    is_active: boolean;
    stripe_price_id: string;
  }>,
): Array<{ price: string; quantity: number }> {
  const items: Array<{ price: string; quantity: number }> = [];

  for (const svc of quoteServices) {
    const priceMapping = stripePriceMap.find(
      (m) => m.product_id === svc.product_id && m.is_active,
    );
    if (priceMapping) {
      items.push({ price: priceMapping.stripe_price_id, quantity: svc.quantity });
    }
  }

  return items;
}

export function calculateCombinedDiscount(
  termDiscount: number,
  billingDiscount: number,
  additionalDiscount: number,
): number {
  const total = (termDiscount || 0) + (billingDiscount || 0) + (additionalDiscount || 0) / 100;
  return Math.min(total, 1);
}
