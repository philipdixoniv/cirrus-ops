import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";
import { useStripeInstances } from "@/contexts/StripeInstanceContext";

interface ComparisonProduct {
  stripeId: string;
  name: string;
  sourceOnly: boolean;
  targetOnly: boolean;
  inBoth: boolean;
  diffs: string[];
}

interface ComparisonResult {
  sourceProducts: any[];
  targetProducts: any[];
  products: ComparisonProduct[];
  missingInTarget: ComparisonProduct[];
  missingInSource: ComparisonProduct[];
  matched: ComparisonProduct[];
  withDiffs: ComparisonProduct[];
}

export function useStripeCompare() {
  const { activeOrgId } = useOrg();
  const { instances } = useStripeInstances();
  const queryClient = useQueryClient();

  const [sourceInstanceId, setSourceInstanceId] = useState<string | null>(null);
  const [targetInstanceId, setTargetInstanceId] = useState<string | null>(null);

  const comparisonQuery = useQuery({
    queryKey: [
      "stripeCompare",
      activeOrgId,
      sourceInstanceId,
      targetInstanceId,
    ],
    queryFn: async () => {
      const supabase = getSupabase();

      const [sourceRes, targetRes, sourcePricesRes, targetPricesRes] =
        await Promise.all([
          supabase
            .from("stripe_products")
            .select("*")
            .eq("org_id", activeOrgId)
            .eq("instance_id", sourceInstanceId)
            .eq("is_active", true)
            .order("name"),
          supabase
            .from("stripe_products")
            .select("*")
            .eq("org_id", activeOrgId)
            .eq("instance_id", targetInstanceId)
            .eq("is_active", true)
            .order("name"),
          supabase
            .from("stripe_prices")
            .select("*")
            .eq("org_id", activeOrgId)
            .eq("instance_id", sourceInstanceId)
            .eq("is_active", true),
          supabase
            .from("stripe_prices")
            .select("*")
            .eq("org_id", activeOrgId)
            .eq("instance_id", targetInstanceId)
            .eq("is_active", true),
        ]);

      if (sourceRes.error) throw sourceRes.error;
      if (targetRes.error) throw targetRes.error;
      if (sourcePricesRes.error) throw sourcePricesRes.error;
      if (targetPricesRes.error) throw targetPricesRes.error;

      return {
        sourceProducts: sourceRes.data || [],
        targetProducts: targetRes.data || [],
        sourcePrices: sourcePricesRes.data || [],
        targetPrices: targetPricesRes.data || [],
      };
    },
    enabled: !!activeOrgId && !!sourceInstanceId && !!targetInstanceId,
  });

  const comparisonResults = useMemo((): ComparisonResult | null => {
    if (!comparisonQuery.data) return null;

    const { sourceProducts, targetProducts, sourcePrices, targetPrices } =
      comparisonQuery.data;

    const targetByStripeId = new Map<string, any>(
      targetProducts.map((p: any) => [p.stripe_id, p]),
    );
    const sourceByStripeId = new Map<string, any>(
      sourceProducts.map((p: any) => [p.stripe_id, p]),
    );

    const allStripeIds = new Set([
      ...sourceProducts.map((p: any) => p.stripe_id),
      ...targetProducts.map((p: any) => p.stripe_id),
    ]);

    const products: ComparisonProduct[] = [];

    for (const stripeId of allStripeIds) {
      const source = sourceByStripeId.get(stripeId);
      const target = targetByStripeId.get(stripeId);
      const sourceOnly = !!source && !target;
      const targetOnly = !source && !!target;
      const inBoth = !!source && !!target;

      const diffs: string[] = [];
      if (inBoth) {
        if (source.name !== target.name) {
          diffs.push(`Name: "${source.name}" vs "${target.name}"`);
        }

        const srcPrices = sourcePrices
          .filter((p: any) => p.product_stripe_id === stripeId)
          .sort((a: any, b: any) =>
            (a.stripe_price_id || "").localeCompare(b.stripe_price_id || ""),
          );
        const tgtPrices = targetPrices
          .filter((p: any) => p.product_stripe_id === stripeId)
          .sort((a: any, b: any) =>
            (a.stripe_price_id || "").localeCompare(b.stripe_price_id || ""),
          );

        if (srcPrices.length !== tgtPrices.length) {
          diffs.push(
            `Price count: ${srcPrices.length} vs ${tgtPrices.length}`,
          );
        } else {
          for (let i = 0; i < srcPrices.length; i++) {
            if (srcPrices[i].unit_amount !== tgtPrices[i].unit_amount) {
              diffs.push(
                `Price amount differs for ${srcPrices[i].recurring_interval || "one_time"}`,
              );
            }
          }
        }
      }

      products.push({
        stripeId,
        name: (source || target).name,
        sourceOnly,
        targetOnly,
        inBoth,
        diffs,
      });
    }

    return {
      sourceProducts,
      targetProducts,
      products,
      missingInTarget: products.filter((p) => p.sourceOnly),
      missingInSource: products.filter((p) => p.targetOnly),
      matched: products.filter((p) => p.inBoth),
      withDiffs: products.filter((p) => p.inBoth && p.diffs.length > 0),
    };
  }, [comparisonQuery.data]);

  const loadComparison = useCallback(
    (sourceId: string, targetId: string) => {
      setSourceInstanceId(sourceId);
      setTargetInstanceId(targetId);
      queryClient.invalidateQueries({
        queryKey: ["stripeCompare", activeOrgId, sourceId, targetId],
      });
    },
    [activeOrgId, queryClient],
  );

  const pushProducts = useCallback(
    async (productStripeIds: string[]) => {
      if (!activeOrgId || !sourceInstanceId || !targetInstanceId) {
        throw new Error("Source and target instances must be selected");
      }
      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke(
        "stripe-push-products",
        {
          body: {
            org_id: activeOrgId,
            source_instance_id: sourceInstanceId,
            target_instance_id: targetInstanceId,
            product_stripe_ids: productStripeIds,
          },
        },
      );
      if (error) throw new Error(error.message || "Push failed");
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({
        queryKey: [
          "stripeCompare",
          activeOrgId,
          sourceInstanceId,
          targetInstanceId,
        ],
      });
      return data;
    },
    [activeOrgId, sourceInstanceId, targetInstanceId, queryClient],
  );

  const pushAllMissing = useCallback(async () => {
    if (!comparisonResults) return null;
    const missingIds = comparisonResults.missingInTarget.map(
      (p) => p.stripeId,
    );
    if (missingIds.length === 0) return { pushed: 0 };
    return pushProducts(missingIds);
  }, [comparisonResults, pushProducts]);

  return {
    instances,
    sourceInstanceId,
    targetInstanceId,
    setSourceInstanceId,
    setTargetInstanceId,
    comparisonResults,
    loading: comparisonQuery.isLoading,
    error: comparisonQuery.error?.message || null,
    loadComparison,
    pushProducts,
    pushAllMissing,
    refetch: comparisonQuery.refetch,
  };
}
