// Quote calculation engine — ported from RevOps

export interface Feature {
  id: string;
  name: string;
  monthlyPrice: number;
}

export interface Tier {
  minHours: number;
  maxHours: number;
  rate: number;
}

export interface Service {
  id: string;
  name: string;
  duration: string;
  price: number;
  perHour?: boolean;
}

export interface QuoteResult {
  featureMonthlyCost: number;
  termDiscount: number;
  billingDiscount: number;
  additionalDiscount: number;
  totalDiscountPct: number;
  afterDiscount: number;
  miRate: number;
  miMonthlyCost: number;
  lcRate: number;
  lcMonthlyCost: number;
  servicesCost: number;
  mrr: number;
  arr: number;
  tcv: number;
  termMonths: number;
}

export interface DynamicQuoteSection {
  sectionId: string;
  sectionName: string;
  sectionType: string;
  discountApplicable: boolean;
  monthlyCost: number;
  discountedMonthlyCost: number;
  oneTimeCost: number;
  lineItems: DynamicLineItem[];
}

export interface DynamicLineItem {
  productId: string;
  productName: string;
  unitLabel: string;
  quantity: number;
  unitPrice: number;
  monthlyCost: number;
  oneTimeCost: number;
}

export interface DynamicQuoteResult {
  sections: DynamicQuoteSection[];
  mrr: number;
  arr: number;
  tcv: number;
  termMonths: number;
  termDiscount: number;
  billingDiscount: number;
  additionalDiscount: number;
  totalDiscountPct: number;
}

export interface ApprovalRule {
  type: string;
  operator: string;
  value: number;
  message: string;
}

export interface TriggeredApprovalRule extends ApprovalRule {
  interpolatedMessage: string;
}

export const TERM_DISCOUNTS: Record<string, number> = {
  monthly: 0,
  quarterly: 0.05,
  "1_year": 0.1,
  "2_year": 0.2,
  "3_year": 0.3,
};

export const BILLING_DISCOUNTS: Record<string, number> = {
  monthly: 0,
  quarterly: 0,
  annual: 0.1,
};

export const FEATURES: Feature[] = [
  { id: "sidebar", name: "Salesforce Sidebar", monthlyPrice: 11.0 },
  { id: "calendar_sync", name: "Salesforce Calendar Sync", monthlyPrice: 11.0 },
  { id: "email_sync", name: "Salesforce Email Sync", monthlyPrice: 5.0 },
  { id: "fast_sync", name: "Fast Sync", monthlyPrice: 5.0 },
  { id: "task_sync", name: "Salesforce Task Sync", monthlyPrice: 2.5 },
  { id: "personal_scheduling", name: "Personal Scheduling", monthlyPrice: 7.0 },
  { id: "meeting_prep", name: "Meeting Prep", monthlyPrice: 13.0 },
  { id: "team_scheduling", name: "Team Scheduling", monthlyPrice: 7.0 },
  { id: "smart_scheduler", name: "Smart Scheduler", monthlyPrice: 20.0 },
  { id: "conversation_analytics", name: "Conversation Analytics", monthlyPrice: 35.0 },
  { id: "sales_sequences", name: "Sales Sequences", monthlyPrice: 75.0 },
  { id: "email_templates", name: "Email Templates", monthlyPrice: 7.0 },
  { id: "email_blast", name: "Email Blast", monthlyPrice: 12.0 },
  { id: "buyer_signals", name: "Buyer Signals", monthlyPrice: 10.0 },
];

export const MEETING_INTELLIGENCE_TIERS: Tier[] = [
  { minHours: 1, maxHours: 24, rate: 12.0 },
  { minHours: 25, maxHours: 49, rate: 10.5 },
  { minHours: 50, maxHours: 99, rate: 9.5 },
  { minHours: 100, maxHours: 249, rate: 8.5 },
  { minHours: 250, maxHours: 499, rate: 7.5 },
  { minHours: 500, maxHours: 999, rate: 6.5 },
  { minHours: 1000, maxHours: 2499, rate: 5.5 },
  { minHours: 2500, maxHours: 4999, rate: 5.0 },
  { minHours: 5000, maxHours: 9999, rate: 4.5 },
  { minHours: 10000, maxHours: Infinity, rate: 4.0 },
];

export const LIVE_COACHING_TIERS: Tier[] = [
  { minHours: 1, maxHours: 24, rate: 22.0 },
  { minHours: 25, maxHours: 49, rate: 20.0 },
  { minHours: 50, maxHours: 99, rate: 18.0 },
  { minHours: 100, maxHours: 249, rate: 16.0 },
  { minHours: 250, maxHours: 499, rate: 14.0 },
  { minHours: 500, maxHours: 999, rate: 12.0 },
  { minHours: 1000, maxHours: 2499, rate: 10.0 },
  { minHours: 2500, maxHours: 4999, rate: 9.0 },
  { minHours: 5000, maxHours: 9999, rate: 8.0 },
  { minHours: 10000, maxHours: Infinity, rate: 7.0 },
];

export const SERVICES: Service[] = [
  { id: "deploy_30", name: "Enterprise Deployment & Configuration", duration: "30 Day", price: 2500.0 },
  { id: "deploy_60", name: "Enterprise Deployment & Configuration", duration: "60 Day", price: 5000.0 },
  { id: "deploy_90", name: "Enterprise Deployment & Configuration", duration: "90 Day", price: 7500.0 },
  { id: "training", name: "Technical Setup or Training", duration: "1 Hour", price: 250.0, perHour: true },
];

export function getTierRate(tiers: Tier[], hours: number): { rate: number; tier: Tier | null } {
  if (!hours || hours <= 0) return { rate: 0, tier: null };
  const tier = tiers.find((t) => hours >= t.minHours && hours <= t.maxHours);
  return tier
    ? { rate: tier.rate, tier }
    : { rate: tiers[tiers.length - 1].rate, tier: tiers[tiers.length - 1] };
}

export function getTermMonths(termLength: string, termMonthsMap?: Record<string, number>): number {
  if (termMonthsMap && termMonthsMap[termLength] !== undefined) {
    return termMonthsMap[termLength];
  }
  const months: Record<string, number> = {
    monthly: 1,
    quarterly: 3,
    "1_year": 12,
    "2_year": 24,
    "3_year": 36,
  };
  return months[termLength] || 12;
}

export function calculateQuote(params: {
  featureQuantities: Record<string, number>;
  termLength: string;
  billingFrequency: string;
  meetingIntelligenceHours: number;
  liveCoachingHours: number;
  selectedDeployment?: string | null;
  additionalDiscount?: number;
  features?: Feature[] | null;
  miTiers?: Tier[] | null;
  lcTiers?: Tier[] | null;
  services?: Service[] | null;
  termDiscounts?: Record<string, number> | null;
  billingDiscounts?: Record<string, number> | null;
  termMonthsMap?: Record<string, number> | null;
}): QuoteResult {
  const effectiveFeatures = params.features || FEATURES;
  const effectiveMiTiers = params.miTiers || MEETING_INTELLIGENCE_TIERS;
  const effectiveLcTiers = params.lcTiers || LIVE_COACHING_TIERS;
  const effectiveServices = params.services || SERVICES;
  const effectiveTermDiscounts = params.termDiscounts || TERM_DISCOUNTS;
  const effectiveBillingDiscounts = params.billingDiscounts || BILLING_DISCOUNTS;
  const additionalDiscount = params.additionalDiscount || 0;

  const termDiscount = effectiveTermDiscounts[params.termLength] || 0;
  const billingDiscount = effectiveBillingDiscounts[params.billingFrequency] || 0;
  const termMonths = getTermMonths(params.termLength, params.termMonthsMap || undefined);

  const featureMonthlyCost = effectiveFeatures.reduce((sum, feature) => {
    const qty = (params.featureQuantities && params.featureQuantities[feature.id]) || 0;
    return sum + feature.monthlyPrice * qty;
  }, 0);

  const totalDiscountPct = termDiscount + billingDiscount + additionalDiscount / 100;
  const afterDiscount = featureMonthlyCost * (1 - totalDiscountPct);

  const miRate = getTierRate(effectiveMiTiers, params.meetingIntelligenceHours);
  const lcRate = getTierRate(effectiveLcTiers, params.liveCoachingHours);

  const miMonthlyCost = params.meetingIntelligenceHours * miRate.rate;
  const lcMonthlyCost = params.liveCoachingHours * lcRate.rate;

  const deploymentService = params.selectedDeployment
    ? effectiveServices.find((s) => s.id === params.selectedDeployment)
    : null;
  const servicesCost = deploymentService ? deploymentService.price : 0;

  const mrr = afterDiscount + miMonthlyCost + lcMonthlyCost;
  const arr = mrr * 12;
  const tcv = mrr * termMonths + servicesCost;

  return {
    featureMonthlyCost,
    termDiscount,
    billingDiscount,
    additionalDiscount,
    totalDiscountPct,
    afterDiscount,
    miRate: miRate.rate,
    miMonthlyCost,
    lcRate: lcRate.rate,
    lcMonthlyCost,
    servicesCost,
    mrr,
    arr,
    tcv,
    termMonths,
  };
}

export function calculateDynamicQuote(params: {
  template: {
    termDiscounts?: Record<string, number>;
    billingDiscounts?: Record<string, number>;
    termMonthsMap?: Record<string, number>;
    sections?: Array<{
      id: string;
      name: string;
      type: string;
      discountApplicable: boolean;
      products: Array<{
        id: string;
        name: string;
        monthlyPrice?: number;
        tiers?: Tier[];
        price?: number;
        unitLabel?: string;
      }>;
    }>;
  };
  sectionQuantities?: Record<string, Record<string, number>>;
  termLength: string;
  billingFrequency: string;
  additionalDiscount?: number;
}): DynamicQuoteResult {
  const { template, sectionQuantities = {}, termLength, billingFrequency } = params;
  const additionalDiscount = params.additionalDiscount || 0;
  const termDiscount = (template.termDiscounts && template.termDiscounts[termLength]) || 0;
  const billingDiscount = (template.billingDiscounts && template.billingDiscounts[billingFrequency]) || 0;
  const totalDiscountPct = termDiscount + billingDiscount + additionalDiscount / 100;
  const termMonths = getTermMonths(termLength, template.termMonthsMap);

  let totalMrr = 0;
  let totalOneTime = 0;

  const sections: DynamicQuoteSection[] = (template.sections || []).map((section) => {
    const sectionQtys = sectionQuantities[section.id] || {};
    let monthlyCost = 0;
    let oneTimeCost = 0;

    const lineItems: DynamicLineItem[] = section.products.map((product) => {
      const qty = sectionQtys[product.id] || 0;
      let unitPrice = 0;
      let lineMonthly = 0;
      let lineOneTime = 0;

      if (section.type === "per_seat") {
        unitPrice = product.monthlyPrice || 0;
        lineMonthly = qty * unitPrice;
      } else if (section.type === "tiered") {
        const tierResult = getTierRate(product.tiers || [], qty);
        unitPrice = tierResult.rate;
        lineMonthly = qty * unitPrice;
      } else if (section.type === "one_time") {
        unitPrice = product.price || 0;
        lineOneTime = qty * unitPrice;
      }

      monthlyCost += lineMonthly;
      oneTimeCost += lineOneTime;

      return {
        productId: product.id,
        productName: product.name,
        unitLabel: product.unitLabel || "Active User",
        quantity: qty,
        unitPrice,
        monthlyCost: lineMonthly,
        oneTimeCost: lineOneTime,
      };
    });

    let discountedMonthlyCost = monthlyCost;
    if (section.discountApplicable && monthlyCost > 0) {
      discountedMonthlyCost = monthlyCost * (1 - totalDiscountPct);
    }

    totalMrr += discountedMonthlyCost;
    totalOneTime += oneTimeCost;

    return {
      sectionId: section.id,
      sectionName: section.name,
      sectionType: section.type,
      discountApplicable: section.discountApplicable,
      monthlyCost,
      discountedMonthlyCost,
      oneTimeCost,
      lineItems,
    };
  });

  const mrr = totalMrr;
  const arr = mrr * 12;
  const tcv = mrr * termMonths + totalOneTime;

  return {
    sections,
    mrr,
    arr,
    tcv,
    termMonths,
    termDiscount,
    billingDiscount,
    additionalDiscount,
    totalDiscountPct,
  };
}

export function evaluateApprovalRules(
  rules: ApprovalRule[] | null | undefined,
  context: Record<string, any> | null | undefined,
): TriggeredApprovalRule[] {
  if (!rules || !Array.isArray(rules) || !context) return [];

  return rules
    .filter((rule) => {
      const contextValue = context[rule.type];
      if (contextValue === undefined || contextValue === null) return false;

      switch (rule.operator) {
        case ">=": return contextValue >= rule.value;
        case ">": return contextValue > rule.value;
        case "<=": return contextValue <= rule.value;
        case "<": return contextValue < rule.value;
        case "==": return contextValue === rule.value;
        default: return false;
      }
    })
    .map((rule) => {
      let message = rule.message || "";
      for (const [key, val] of Object.entries(context)) {
        message = message.replace(`{${key}}`, String(val));
      }
      return { ...rule, interpolatedMessage: message };
    });
}
