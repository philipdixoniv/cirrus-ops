import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";
import { useStripeInstances } from "@/contexts/StripeInstanceContext";
import { useProducts } from "./useProducts";

export const BILLING_INTERVAL_MAP: Record<
  string,
  { interval: string; interval_count: number; multiplier: number }
> = {
  monthly: { interval: "month", interval_count: 1, multiplier: 1 },
  quarterly: { interval: "month", interval_count: 3, multiplier: 3 },
  annual: { interval: "year", interval_count: 1, multiplier: 12 },
};

export function useStripePricebook() {
  const { activeOrgId } = useOrg();
  const { activeInstanceId } = useStripeInstances();
  const queryClient = useQueryClient();
  const {
    toFeaturesArray,
    toMeetingIntelligenceTiers,
    toLiveCoachingTiers,
    toServicesArray,
    toTermDiscountsMap,
    toBillingDiscountsMap,
    toTermMonthsMap,
  } = useProducts();

  const pricebookQuery = useQuery({
    queryKey: ["stripePricebook", activeOrgId, activeInstanceId],
    queryFn: async () => {
      const supabase = getSupabase();
      const [productsRes, pricesRes, couponsRes] = await Promise.all([
        supabase
          .from("stripe_products")
          .select("*")
          .eq("org_id", activeOrgId)
          .eq("instance_id", activeInstanceId)
          .order("created_at"),
        supabase
          .from("stripe_prices")
          .select("*")
          .eq("org_id", activeOrgId)
          .eq("instance_id", activeInstanceId)
          .order("created_at"),
        supabase
          .from("stripe_coupons")
          .select("*")
          .eq("org_id", activeOrgId)
          .eq("instance_id", activeInstanceId)
          .order("created_at"),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (pricesRes.error) throw pricesRes.error;
      if (couponsRes.error) throw couponsRes.error;

      return {
        products: productsRes.data || [],
        prices: pricesRes.data || [],
        coupons: couponsRes.data || [],
      };
    },
    enabled: !!activeOrgId && !!activeInstanceId,
  });

  const stripeProducts = pricebookQuery.data?.products || [];
  const stripePrices = pricebookQuery.data?.prices || [];
  const stripeCoupons = pricebookQuery.data?.coupons || [];

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ["stripePricebook", activeOrgId, activeInstanceId],
      }),
    [queryClient, activeOrgId, activeInstanceId],
  );

  const inferProductType = useCallback((product: any): string => {
    const meta = product.metadata || {};
    if (meta.product_type) return meta.product_type;
    if (product.name?.toLowerCase().includes("deployment")) return "one_time";
    if (product.name?.toLowerCase().includes("training")) return "one_time";
    return "per_seat";
  }, []);

  const getFeatures = useCallback(
    () =>
      stripeProducts.filter(
        (p: any) => inferProductType(p) === "per_seat" && p.is_active,
      ),
    [stripeProducts, inferProductType],
  );

  const getTieredProducts = useCallback(
    () =>
      stripeProducts.filter(
        (p: any) => inferProductType(p) === "tiered" && p.is_active,
      ),
    [stripeProducts, inferProductType],
  );

  const getServices = useCallback(
    () =>
      stripeProducts.filter(
        (p: any) => inferProductType(p) === "one_time" && p.is_active,
      ),
    [stripeProducts, inferProductType],
  );

  const getProductPrices = useCallback(
    (stripeProductId: string) =>
      stripePrices.filter(
        (p: any) => p.product_stripe_id === stripeProductId && p.is_active,
      ),
    [stripePrices],
  );

  const toFeaturesArrayFromStripe = useCallback(() => {
    return getFeatures().map((p: any) => {
      const prices = getProductPrices(p.stripe_id);
      const monthlyPrice = prices.find(
        (pr: any) =>
          pr.recurring_interval === "month" &&
          pr.recurring_interval_count === 1,
      );
      return {
        id: p.stripe_id,
        name: p.name,
        monthlyPrice: monthlyPrice
          ? (monthlyPrice.unit_amount || 0) / 100
          : 0,
      };
    });
  }, [getFeatures, getProductPrices]);

  const toMeetingIntelligenceTiersFromStripe = useCallback(() => {
    const mi = stripeProducts.find(
      (p: any) =>
        p.metadata?.cirrus_slug === "meeting_intelligence" ||
        p.name?.toLowerCase().includes("meeting intelligence"),
    );
    if (!mi) return [];
    const prices = getProductPrices(mi.stripe_id);
    const tieredPrice = prices.find(
      (p: any) => p.billing_scheme === "tiered" && p.tiers,
    );
    if (!tieredPrice || !Array.isArray(tieredPrice.tiers)) return [];
    return tieredPrice.tiers.map((tier: any, i: number) => {
      const prevMax = i > 0 ? tieredPrice.tiers[i - 1].up_to : 0;
      return {
        minHours: prevMax + 1,
        maxHours: tier.up_to === null ? Infinity : tier.up_to,
        rate: (tier.unit_amount || 0) / 100,
      };
    });
  }, [stripeProducts, getProductPrices]);

  const toLiveCoachingTiersFromStripe = useCallback(() => {
    const lc = stripeProducts.find(
      (p: any) =>
        p.metadata?.cirrus_slug === "live_coaching" ||
        p.name?.toLowerCase().includes("live coaching"),
    );
    if (!lc) return [];
    const prices = getProductPrices(lc.stripe_id);
    const tieredPrice = prices.find(
      (p: any) => p.billing_scheme === "tiered" && p.tiers,
    );
    if (!tieredPrice || !Array.isArray(tieredPrice.tiers)) return [];
    return tieredPrice.tiers.map((tier: any, i: number) => {
      const prevMax = i > 0 ? tieredPrice.tiers[i - 1].up_to : 0;
      return {
        minHours: prevMax + 1,
        maxHours: tier.up_to === null ? Infinity : tier.up_to,
        rate: (tier.unit_amount || 0) / 100,
      };
    });
  }, [stripeProducts, getProductPrices]);

  const toServicesArrayFromStripe = useCallback(() => {
    return getServices().map((p: any) => {
      const prices = getProductPrices(p.stripe_id);
      const oneTimePrice = prices.find((pr: any) => pr.type === "one_time");
      return {
        id: p.stripe_id,
        name: p.name,
        duration: p.unit_label || "",
        price: oneTimePrice ? (oneTimePrice.unit_amount || 0) / 100 : 0,
        perHour: p.name?.toLowerCase().includes("training"),
      };
    });
  }, [getServices, getProductPrices]);

  const toTermDiscountsMapFromStripe = useCallback(() => {
    const map: Record<string, number> = {};
    for (const coupon of stripeCoupons) {
      if (coupon.metadata?.discount_type === "term" && coupon.metadata?.key) {
        map[coupon.metadata.key] = (coupon.percent_off || 0) / 100;
      }
    }
    return map;
  }, [stripeCoupons]);

  const toBillingDiscountsMapFromStripe = useCallback(() => {
    const map: Record<string, number> = {};
    for (const coupon of stripeCoupons) {
      if (
        coupon.metadata?.discount_type === "billing" &&
        coupon.metadata?.key
      ) {
        map[coupon.metadata.key] = (coupon.percent_off || 0) / 100;
      }
    }
    return map;
  }, [stripeCoupons]);

  const toTermMonthsMapFromStripe = useCallback(() => {
    const map: Record<string, number> = {};
    for (const coupon of stripeCoupons) {
      if (
        coupon.metadata?.discount_type === "term" &&
        coupon.metadata?.key &&
        coupon.metadata?.term_months
      ) {
        map[coupon.metadata.key] = Number(coupon.metadata.term_months);
      }
    }
    return map;
  }, [stripeCoupons]);

  const getStripePriceId = useCallback(
    (productStripeId: string, billingInterval: string) => {
      const mapping = BILLING_INTERVAL_MAP[billingInterval];
      if (!mapping) return null;
      const price = stripePrices.find(
        (p: any) =>
          p.product_stripe_id === productStripeId &&
          p.recurring_interval === mapping.interval &&
          p.recurring_interval_count === mapping.interval_count &&
          p.is_active,
      );
      return price?.stripe_price_id || null;
    },
    [stripePrices],
  );

  const getOneTimePriceId = useCallback(
    (productStripeId: string) => {
      const price = stripePrices.find(
        (p: any) =>
          p.product_stripe_id === productStripeId &&
          p.type === "one_time" &&
          p.is_active,
      );
      return price?.stripe_price_id || null;
    },
    [stripePrices],
  );

  // CRUD operations
  const createProduct = useCallback(
    async (data: any) => {
      if (!activeOrgId || !activeInstanceId) return null;
      const supabase = getSupabase();
      const { data: product, error } = await supabase
        .from("stripe_products")
        .insert({
          ...data,
          org_id: activeOrgId,
          instance_id: activeInstanceId,
        })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      return product;
    },
    [activeOrgId, activeInstanceId, invalidate],
  );

  const updateProduct = useCallback(
    async (id: string, data: any) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("stripe_products")
        .update(data)
        .eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const deactivateProduct = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("stripe_products")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const createPrice = useCallback(
    async (data: any) => {
      if (!activeOrgId || !activeInstanceId) return null;
      const supabase = getSupabase();
      const { data: price, error } = await supabase
        .from("stripe_prices")
        .insert({
          ...data,
          org_id: activeOrgId,
          instance_id: activeInstanceId,
        })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      return price;
    },
    [activeOrgId, activeInstanceId, invalidate],
  );

  const deactivatePrice = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("stripe_prices")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const createCoupon = useCallback(
    async (data: any) => {
      if (!activeOrgId || !activeInstanceId) return null;
      const supabase = getSupabase();
      const { data: coupon, error } = await supabase
        .from("stripe_coupons")
        .insert({
          ...data,
          org_id: activeOrgId,
          instance_id: activeInstanceId,
        })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      return coupon;
    },
    [activeOrgId, activeInstanceId, invalidate],
  );

  // Sync operations
  const importFromStripe = useCallback(async () => {
    if (!activeOrgId || !activeInstanceId) return null;
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke(
      "stripe-import-pricebook",
      {
        body: {
          org_id: activeOrgId,
          instance_id: activeInstanceId,
        },
      },
    );
    if (error) throw new Error(error.message || "Import failed");
    if (data?.error) throw new Error(data.error);
    invalidate();
    return data;
  }, [activeOrgId, activeInstanceId, invalidate]);

  const syncToStripe = useCallback(async () => {
    if (!activeOrgId || !activeInstanceId) return null;
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke(
      "stripe-sync-pricebook",
      {
        body: {
          org_id: activeOrgId,
          instance_id: activeInstanceId,
        },
      },
    );
    if (error) throw new Error(error.message || "Sync failed");
    if (data?.error) throw new Error(data.error);
    invalidate();
    return data;
  }, [activeOrgId, activeInstanceId, invalidate]);

  const syncSingleProduct = useCallback(
    async (productId: string) => {
      if (!activeOrgId || !activeInstanceId) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke(
        "stripe-sync-product",
        {
          body: {
            org_id: activeOrgId,
            instance_id: activeInstanceId,
            product_id: productId,
          },
        },
      );
      if (error) throw new Error(error.message || "Sync failed");
      if (data?.error) throw new Error(data.error);
      invalidate();
      return data;
    },
    [activeOrgId, activeInstanceId, invalidate],
  );

  const getProductLineage = useCallback(
    (stripeProductId: string) => {
      const product = stripeProducts.find(
        (p: any) => p.stripe_id === stripeProductId,
      );
      if (!product) return null;
      const prices = getProductPrices(stripeProductId);
      return { product, prices };
    },
    [stripeProducts, getProductPrices],
  );

  const pushToInstance = useCallback(
    async (targetInstanceId: string, productStripeIds: string[]) => {
      if (!activeOrgId || !activeInstanceId) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke(
        "stripe-push-products",
        {
          body: {
            org_id: activeOrgId,
            source_instance_id: activeInstanceId,
            target_instance_id: targetInstanceId,
            product_stripe_ids: productStripeIds,
          },
        },
      );
      if (error) throw new Error(error.message || "Push failed");
      if (data?.error) throw new Error(data.error);
      invalidate();
      return data;
    },
    [activeOrgId, activeInstanceId, invalidate],
  );

  return {
    stripeProducts,
    stripePrices,
    stripeCoupons,
    loading: pricebookQuery.isLoading,
    error: pricebookQuery.error?.message || null,
    inferProductType,
    getFeatures,
    getTieredProducts,
    getServices,
    getProductPrices,
    toFeaturesArray: toFeaturesArrayFromStripe,
    toMeetingIntelligenceTiers: toMeetingIntelligenceTiersFromStripe,
    toLiveCoachingTiers: toLiveCoachingTiersFromStripe,
    toServicesArray: toServicesArrayFromStripe,
    toTermDiscountsMap: toTermDiscountsMapFromStripe,
    toBillingDiscountsMap: toBillingDiscountsMapFromStripe,
    toTermMonthsMap: toTermMonthsMapFromStripe,
    // Fallback to DB-driven product catalog maps
    dbFeaturesArray: toFeaturesArray,
    dbMeetingIntelligenceTiers: toMeetingIntelligenceTiers,
    dbLiveCoachingTiers: toLiveCoachingTiers,
    dbServicesArray: toServicesArray,
    dbTermDiscountsMap: toTermDiscountsMap,
    dbBillingDiscountsMap: toBillingDiscountsMap,
    dbTermMonthsMap: toTermMonthsMap,
    getStripePriceId,
    getOneTimePriceId,
    createProduct,
    updateProduct,
    deactivateProduct,
    createPrice,
    deactivatePrice,
    createCoupon,
    importFromStripe,
    syncToStripe,
    syncSingleProduct,
    getProductLineage,
    pushToInstance,
    refetch: pricebookQuery.refetch,
  };
}
