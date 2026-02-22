import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useProducts() {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ["products", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const [productsRes, tiersRes, discountsRes] = await Promise.all([
        supabase.from("products").select("*").eq("org_id", activeOrgId).eq("is_active", true).order("sort_order"),
        supabase.from("product_tiers").select("*").eq("org_id", activeOrgId).order("sort_order"),
        supabase.from("discount_schedules").select("*").eq("org_id", activeOrgId).order("sort_order"),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (tiersRes.error) throw tiersRes.error;
      if (discountsRes.error) throw discountsRes.error;
      return {
        products: productsRes.data || [],
        tiers: tiersRes.data || [],
        discountSchedules: discountsRes.data || [],
      };
    },
    enabled: !!activeOrgId,
  });

  const products = productsQuery.data?.products || [];
  const tiers = productsQuery.data?.tiers || [];
  const discountSchedules = productsQuery.data?.discountSchedules || [];

  const getFeatures = useCallback(() => products.filter((p: any) => p.type === "per_seat"), [products]);
  const getTieredProducts = useCallback(() => products.filter((p: any) => p.type === "tiered"), [products]);
  const getServices = useCallback(() => products.filter((p: any) => p.type === "one_time"), [products]);
  const getProductTiers = useCallback((productId: string) => tiers.filter((t: any) => t.product_id === productId), [tiers]);
  const getTermDiscounts = useCallback(() => discountSchedules.filter((d: any) => d.type === "term"), [discountSchedules]);
  const getBillingDiscounts = useCallback(() => discountSchedules.filter((d: any) => d.type === "billing"), [discountSchedules]);

  const toFeaturesArray = useCallback(
    () =>
      getFeatures().map((p: any) => ({
        id: p.slug,
        name: p.name,
        monthlyPrice: Number(p.monthly_price),
      })),
    [getFeatures],
  );

  const toMeetingIntelligenceTiers = useCallback(() => {
    const mi = products.find((p: any) => p.slug === "meeting_intelligence");
    if (!mi) return [];
    return getProductTiers(mi.id).map((t: any) => ({
      minHours: t.min_units,
      maxHours: t.max_units ?? Infinity,
      rate: Number(t.unit_rate),
    }));
  }, [products, getProductTiers]);

  const toLiveCoachingTiers = useCallback(() => {
    const lc = products.find((p: any) => p.slug === "live_coaching");
    if (!lc) return [];
    return getProductTiers(lc.id).map((t: any) => ({
      minHours: t.min_units,
      maxHours: t.max_units ?? Infinity,
      rate: Number(t.unit_rate),
    }));
  }, [products, getProductTiers]);

  const toServicesArray = useCallback(
    () =>
      getServices().map((p: any) => ({
        id: p.slug,
        name: p.name,
        duration: p.unit_label,
        price: Number(p.price),
        perHour: p.slug === "training",
      })),
    [getServices],
  );

  const toTermDiscountsMap = useCallback(() => {
    const map: Record<string, number> = {};
    for (const d of getTermDiscounts()) map[d.key] = Number(d.discount_pct);
    return map;
  }, [getTermDiscounts]);

  const toBillingDiscountsMap = useCallback(() => {
    const map: Record<string, number> = {};
    for (const d of getBillingDiscounts()) map[d.key] = Number(d.discount_pct);
    return map;
  }, [getBillingDiscounts]);

  const toTermMonthsMap = useCallback(() => {
    const map: Record<string, number> = {};
    for (const d of getTermDiscounts()) {
      if (d.term_months) map[d.key] = d.term_months;
    }
    return map;
  }, [getTermDiscounts]);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["products", activeOrgId] }),
    [queryClient, activeOrgId],
  );

  const createProduct = useCallback(
    async (data: any) => {
      if (!activeOrgId) return null;
      const supabase = getSupabase();
      const { data: product, error } = await supabase
        .from("products")
        .insert({ ...data, org_id: activeOrgId })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      return product;
    },
    [activeOrgId, invalidate],
  );

  const updateProduct = useCallback(
    async (id: string, data: any) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("products").update(data).eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("products").update({ is_active: false }).eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const saveTier = useCallback(
    async (data: any) => {
      if (!activeOrgId) return null;
      const supabase = getSupabase();
      if (data.id) {
        const { error } = await supabase
          .from("product_tiers")
          .update({
            min_units: data.min_units,
            max_units: data.max_units,
            unit_rate: data.unit_rate,
            sort_order: data.sort_order,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_tiers").insert({ ...data, org_id: activeOrgId });
        if (error) throw error;
      }
      invalidate();
    },
    [activeOrgId, invalidate],
  );

  const deleteTier = useCallback(
    async (tierId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("product_tiers").delete().eq("id", tierId);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const saveDiscountSchedule = useCallback(
    async (data: any) => {
      if (!activeOrgId) return null;
      const supabase = getSupabase();
      if (data.id) {
        const { error } = await supabase
          .from("discount_schedules")
          .update({
            key: data.key,
            label: data.label,
            type: data.type,
            discount_pct: data.discount_pct,
            term_months: data.term_months || null,
            sort_order: data.sort_order,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("discount_schedules").insert({ ...data, org_id: activeOrgId });
        if (error) throw error;
      }
      invalidate();
    },
    [activeOrgId, invalidate],
  );

  const deleteDiscountSchedule = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("discount_schedules").delete().eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  return {
    products,
    tiers,
    discountSchedules,
    loading: productsQuery.isLoading,
    error: productsQuery.error?.message || null,
    getFeatures,
    getTieredProducts,
    getServices,
    getProductTiers,
    getTermDiscounts,
    getBillingDiscounts,
    toFeaturesArray,
    toMeetingIntelligenceTiers,
    toLiveCoachingTiers,
    toServicesArray,
    toTermDiscountsMap,
    toBillingDiscountsMap,
    toTermMonthsMap,
    createProduct,
    updateProduct,
    deleteProduct,
    saveTier,
    deleteTier,
    saveDiscountSchedule,
    deleteDiscountSchedule,
  };
}
