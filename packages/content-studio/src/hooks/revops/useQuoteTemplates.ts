import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useQuoteTemplates() {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ["quoteTemplates", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("quote_templates")
        .select(`
          *,
          quote_template_sections (
            *,
            quote_template_section_products ( * )
          )
        `)
        .eq("org_id", activeOrgId)
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;

      return (data || []).map((t: any) => ({
        ...t,
        quote_template_sections: (t.quote_template_sections || [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((s: any) => ({
            ...s,
            quote_template_section_products: (s.quote_template_section_products || []).sort(
              (a: any, b: any) => a.sort_order - b.sort_order,
            ),
          })),
      }));
    },
    enabled: !!activeOrgId,
  });

  const templates = templatesQuery.data || [];
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["quoteTemplates", activeOrgId] }),
    [queryClient, activeOrgId],
  );

  const getDefaultTemplate = useCallback(() => {
    const def = templates.find((t: any) => t.is_default);
    return def || templates[0] || null;
  }, [templates]);

  const resolveTemplate = useCallback(
    (template: any, stripeProducts: any[], stripePrices: any[]) => {
      if (!template) return null;

      const sections = (template.quote_template_sections || []).map((section: any) => {
        const products = (section.quote_template_section_products || [])
          .map((sp: any) => {
            const product = stripeProducts.find((p: any) => p.stripe_id === sp.stripe_product_stripe_id);
            if (!product) return null;

            const prices = stripePrices.filter(
              (p: any) => p.product_stripe_id === sp.stripe_product_stripe_id,
            );
            const displayName = sp.display_name || product.name;
            const unitLabel = sp.unit_label || product.unit_label || "Active User";

            if (section.section_type === "per_seat") {
              const monthlyPrice = prices.find(
                (p: any) => p.recurring_interval === "month" && p.recurring_interval_count === 1,
              );
              const annualPrice = prices.find(
                (p: any) => p.recurring_interval === "year" && p.recurring_interval_count === 1,
              );
              let amount = 0;
              if (monthlyPrice?.unit_amount != null) {
                amount = monthlyPrice.unit_amount / 100;
              } else if (annualPrice?.unit_amount != null) {
                amount = annualPrice.unit_amount / 100 / 12;
              }
              return { id: sp.stripe_product_stripe_id, name: displayName, monthlyPrice: amount, unitLabel };
            }

            if (section.section_type === "tiered") {
              const tieredPrice = prices.find((p: any) => p.billing_scheme === "tiered" && p.tiers);
              const resolvedTiers =
                tieredPrice && Array.isArray(tieredPrice.tiers)
                  ? tieredPrice.tiers.map((tier: any, i: number) => {
                      const prevMax = i > 0 ? tieredPrice.tiers[i - 1].up_to : 0;
                      return {
                        minHours: prevMax + 1,
                        maxHours: tier.up_to === null ? Infinity : tier.up_to,
                        rate: (tier.unit_amount != null ? tier.unit_amount : 0) / 100,
                      };
                    })
                  : [];
              return { id: sp.stripe_product_stripe_id, name: displayName, tiers: resolvedTiers, unitLabel };
            }

            if (section.section_type === "one_time") {
              const oneTimePrice = prices.find((p: any) => p.type === "one_time");
              return {
                id: sp.stripe_product_stripe_id,
                name: displayName,
                price: oneTimePrice ? oneTimePrice.unit_amount / 100 : 0,
                duration: product.unit_label || "",
                unitLabel,
              };
            }

            return null;
          })
          .filter(Boolean);

        return {
          id: section.id,
          name: section.name,
          type: section.section_type,
          discountApplicable: section.discount_applicable,
          sortOrder: section.sort_order,
          products,
        };
      });

      return {
        id: template.id,
        name: template.name,
        recordType: template.record_type || "new_customer",
        termLengths: template.term_lengths || [],
        billingFrequencies: template.billing_frequencies || [],
        paymentTerms: template.payment_terms || [],
        defaults: {
          termLength: template.default_term_length || "1_year",
          billingFrequency: template.default_billing_frequency || "annual",
          paymentTerms: template.default_payment_terms || 30,
        },
        termDiscounts: template.term_discounts || {},
        billingDiscounts: template.billing_discounts || {},
        termMonthsMap: template.term_months_map || {},
        allowAdditionalDiscount: template.allow_additional_discount || false,
        approvalRules: template.approval_rules || [],
        sections,
      };
    },
    [],
  );

  const getTemplatesForRecordType = useCallback(
    (recordType: string) => templates.filter((t: any) => (t.record_type || "new_customer") === recordType),
    [templates],
  );

  const getDefaultTemplateForRecordType = useCallback(
    (recordType: string) => {
      const filtered = getTemplatesForRecordType(recordType);
      return filtered.find((t: any) => t.is_default) || filtered[0] || null;
    },
    [getTemplatesForRecordType],
  );

  const createTemplate = useCallback(
    async (data: any) => {
      if (!activeOrgId) return null;
      const supabase = getSupabase();
      const { data: template, error } = await supabase
        .from("quote_templates")
        .insert({ org_id: activeOrgId, ...data })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      return template;
    },
    [activeOrgId, invalidate],
  );

  const updateTemplate = useCallback(
    async (id: string, data: any) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("quote_templates").update(data).eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("quote_templates").update({ is_active: false }).eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const setDefaultTemplate = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("quote_templates").update({ is_default: true }).eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const createSection = useCallback(
    async (templateId: string, data: any) => {
      if (!activeOrgId) return null;
      const supabase = getSupabase();
      const { data: section, error } = await supabase
        .from("quote_template_sections")
        .insert({ org_id: activeOrgId, template_id: templateId, ...data })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      return section;
    },
    [activeOrgId, invalidate],
  );

  const updateSection = useCallback(
    async (id: string, data: any) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("quote_template_sections").update(data).eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const deleteSection = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("quote_template_sections").delete().eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const reorderSections = useCallback(
    async (_templateId: string, orderedIds: string[]) => {
      const supabase = getSupabase();
      await Promise.all(
        orderedIds.map((id, i) =>
          supabase.from("quote_template_sections").update({ sort_order: i }).eq("id", id),
        ),
      );
      invalidate();
    },
    [invalidate],
  );

  const addProductToSection = useCallback(
    async (sectionId: string, data: any) => {
      if (!activeOrgId) return null;
      const supabase = getSupabase();
      const { data: product, error } = await supabase
        .from("quote_template_section_products")
        .insert({ org_id: activeOrgId, section_id: sectionId, ...data })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      return product;
    },
    [activeOrgId, invalidate],
  );

  const addProductsToSection = useCallback(
    async (sectionId: string, items: any[]) => {
      if (!activeOrgId || !items.length) return null;
      const supabase = getSupabase();
      const rows = items.map((item) => ({ org_id: activeOrgId, section_id: sectionId, ...item }));
      const { error } = await supabase.from("quote_template_section_products").insert(rows);
      if (error) throw error;
      invalidate();
      return true;
    },
    [activeOrgId, invalidate],
  );

  const removeProductFromSection = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("quote_template_section_products").delete().eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const reorderSectionProducts = useCallback(
    async (_sectionId: string, orderedIds: string[]) => {
      const supabase = getSupabase();
      await Promise.all(
        orderedIds.map((id, i) =>
          supabase.from("quote_template_section_products").update({ sort_order: i }).eq("id", id),
        ),
      );
      invalidate();
    },
    [invalidate],
  );

  return {
    templates,
    loading: templatesQuery.isLoading,
    error: templatesQuery.error?.message || null,
    getDefaultTemplate,
    getTemplatesForRecordType,
    getDefaultTemplateForRecordType,
    resolveTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    setDefaultTemplate,
    createSection,
    updateSection,
    deleteSection,
    reorderSections,
    addProductToSection,
    addProductsToSection,
    removeProductFromSection,
    reorderSectionProducts,
  };
}
