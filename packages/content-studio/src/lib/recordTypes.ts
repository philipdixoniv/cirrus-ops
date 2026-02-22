// Record type constants and validation — ported from RevOps

export interface RecordType {
  id: string;
  label: string;
  description: string;
  color: string;
  customerRequired: boolean;
  stripeCustomerRequired: boolean;
  warnOnActiveSubscription: boolean;
  opportunityNameTemplate: string;
  revenueCategory: string;
  fulfillmentAction: string;
}

export interface ValidationResult {
  valid: boolean;
  warning?: string;
  suggestion?: string;
  suggestedRecordType?: string;
}

export const RECORD_TYPES: Record<string, RecordType> = {
  new_customer: {
    id: "new_customer",
    label: "New Customer",
    description: "Land a new customer who doesn't have an active subscription",
    color: "blue",
    customerRequired: false,
    stripeCustomerRequired: false,
    warnOnActiveSubscription: true,
    opportunityNameTemplate: "{account} - New Deal",
    revenueCategory: "new",
    fulfillmentAction: "create_subscription",
  },
  upsell: {
    id: "upsell",
    label: "Upsell",
    description: "Expand an existing customer with additional products or seats",
    color: "green",
    customerRequired: true,
    stripeCustomerRequired: true,
    warnOnActiveSubscription: false,
    opportunityNameTemplate: "{account} - Expansion",
    revenueCategory: "expansion",
    fulfillmentAction: "modify_subscription",
  },
  renewal: {
    id: "renewal",
    label: "Renewal",
    description: "Renew or extend an existing customer's contract",
    color: "purple",
    customerRequired: true,
    stripeCustomerRequired: true,
    warnOnActiveSubscription: false,
    opportunityNameTemplate: "{account} - Renewal",
    revenueCategory: "renewal",
    fulfillmentAction: "replace_subscription",
  },
};

export const RECORD_TYPE_LIST = Object.values(RECORD_TYPES);

export function validateCustomerForRecordType(
  recordTypeId: string,
  customer: { stripe_customer_id?: string; has_active_subscriptions?: boolean } | null,
): ValidationResult {
  const rt = RECORD_TYPES[recordTypeId];
  if (!rt) return { valid: false, warning: "Unknown record type" };

  if (!customer) {
    if (rt.customerRequired) {
      return { valid: false, warning: `${rt.label} requires selecting an existing customer` };
    }
    return { valid: true };
  }

  if (rt.stripeCustomerRequired && !customer.stripe_customer_id) {
    return {
      valid: false,
      warning: `${rt.label} requires a customer with a Stripe account`,
    };
  }

  if (rt.warnOnActiveSubscription && customer.has_active_subscriptions) {
    return {
      valid: true,
      warning: "This customer has active subscriptions. Consider creating an Upsell instead.",
      suggestion: "Switch to Upsell",
      suggestedRecordType: "upsell",
    };
  }

  return { valid: true };
}

export function generateOpportunityName(recordTypeId: string, accountName: string): string {
  const rt = RECORD_TYPES[recordTypeId];
  if (!rt) return `${accountName} - New Deal`;
  return rt.opportunityNameTemplate.replace("{account}", accountName);
}
