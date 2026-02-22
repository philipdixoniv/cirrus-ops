import { useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";
import { FEATURES, SERVICES } from "@/lib/pricing";
import { generateOpportunityName } from "@/lib/recordTypes";
import { useAccounts } from "./useAccounts";
import { useOpportunities } from "./useOpportunities";

export function useQuotes() {
  const { activeOrgId } = useOrg();
  const { findOrCreateAccount, findOrCreateContact } = useAccounts();
  const { createOpportunity, updateOpportunityAmount } = useOpportunities();

  async function getCurrentUserId() {
    const { data } = await getSupabase().auth.getSession();
    return data?.session?.user?.id ?? null;
  }

  async function insertLineItemsAndServices(
    quoteId: string,
    featureQuantities: Record<string, number>,
    selectedDeployment: string | null,
  ) {
    const supabase = getSupabase();
    const activeFeatures = Object.entries(featureQuantities || {}).filter(([, qty]) => qty > 0);
    if (activeFeatures.length > 0) {
      const lineItems = activeFeatures.map(([featureId, qty]) => {
        const feature = FEATURES.find((f) => f.id === featureId)!;
        return {
          quote_id: quoteId,
          feature_id: featureId,
          feature_name: feature.name,
          unit_price: feature.monthlyPrice,
          quantity: qty,
          line_total: feature.monthlyPrice * qty,
          org_id: activeOrgId,
        };
      });
      const { error } = await supabase.from("quote_line_items").insert(lineItems);
      if (error) throw error;
    }

    if (selectedDeployment) {
      const service = SERVICES.find((s) => s.id === selectedDeployment);
      if (service) {
        const { error } = await supabase.from("quote_services").insert({
          quote_id: quoteId,
          service_id: selectedDeployment,
          service_name: service.name,
          duration: service.duration,
          quantity: 1,
          price: service.price,
          org_id: activeOrgId,
        });
        if (error) throw error;
      }
    }
  }

  async function insertDynamicLineItems(quoteId: string, calculatedQuote: any, hiddenCtx: any) {
    const supabase = getSupabase();
    const { sectionQuantities, hiddenProducts, template } = hiddenCtx || {};

    for (const section of calculatedQuote.sections) {
      const activeItems = section.lineItems.filter((li: any) => li.quantity > 0);
      if (activeItems.length === 0) continue;

      if (section.sectionType === "one_time") {
        const services = activeItems.map((li: any) => ({
          quote_id: quoteId,
          service_id: li.productId,
          service_name: li.productName,
          duration: li.unitLabel,
          quantity: li.quantity,
          price: li.unitPrice,
          hidden: false,
          org_id: activeOrgId,
        }));
        const { error } = await supabase.from("quote_services").insert(services);
        if (error) throw error;
      } else {
        const lineItems = activeItems.map((li: any) => ({
          quote_id: quoteId,
          feature_id: li.productId,
          feature_name: li.productName,
          unit_price: li.unitPrice,
          quantity: li.quantity,
          line_total: li.monthlyCost,
          section_name: section.sectionName,
          section_type: section.sectionType,
          stripe_product_stripe_id: li.productId,
          hidden: false,
          org_id: activeOrgId,
        }));
        const { error } = await supabase.from("quote_line_items").insert(lineItems);
        if (error) throw error;
      }
    }

    if (hiddenProducts && template) {
      for (const section of template.sections) {
        const hiddenSet = hiddenProducts[section.id];
        if (!hiddenSet || hiddenSet.size === 0) continue;

        for (const productId of hiddenSet) {
          const product = section.products.find((p: any) => p.id === productId);
          if (!product) continue;
          const qty = sectionQuantities?.[section.id]?.[productId] || 0;

          if (section.type === "one_time") {
            const { error } = await supabase.from("quote_services").insert({
              quote_id: quoteId,
              service_id: productId,
              service_name: product.name,
              duration: product.duration || product.unitLabel,
              quantity: qty,
              price: product.price || 0,
              hidden: true,
              org_id: activeOrgId,
            });
            if (error) throw error;
          } else {
            const unitPrice =
              section.type === "tiered" ? product.tiers?.[0]?.rate || 0 : product.monthlyPrice || 0;
            const { error } = await supabase.from("quote_line_items").insert({
              quote_id: quoteId,
              feature_id: productId,
              feature_name: product.name,
              unit_price: unitPrice,
              quantity: qty,
              line_total: unitPrice * qty,
              section_name: section.name,
              section_type: section.type,
              stripe_product_stripe_id: productId,
              hidden: true,
              org_id: activeOrgId,
            });
            if (error) throw error;
          }
        }
      }
    }
  }

  async function deleteLineItemsAndServices(quoteId: string) {
    const supabase = getSupabase();
    await supabase.from("quote_line_items").delete().eq("quote_id", quoteId);
    await supabase.from("quote_services").delete().eq("quote_id", quoteId);
  }

  function buildQuoteRow(params: any) {
    return {
      status: params.status || "draft",
      term_length: params.termLength,
      billing_frequency: params.billingFrequency,
      seat_count: Math.max(0, ...Object.values(params.featureQuantities || ({} as Record<string, number>))),
      meeting_intelligence_hours: params.meetingIntelligenceHours,
      live_coaching_hours: params.liveCoachingHours,
      plan: params.plan || "cirrus_flex",
      payment_terms_net: params.paymentTermsNet,
      additional_discount: params.additionalDiscount,
      mrr: params.quote.mrr,
      arr: params.quote.arr,
      tcv: params.quote.tcv,
      template_id: params.templateId || null,
      record_type: params.recordType || "new_customer",
      stripe_customer_id: params.stripeCustomerId || null,
    };
  }

  const saveQuote = useCallback(
    async (params: any) => {
      if (!activeOrgId) throw new Error("No active organization");
      const supabase = getSupabase();
      const userId = await getCurrentUserId();

      const account = await findOrCreateAccount(params.customer.companyName);

      supabase.functions
        .invoke("stripe-link-customer", {
          body: {
            org_id: activeOrgId,
            account_id: account.id,
            account_name: account.name,
          },
        })
        .catch(() => {});

      const nameParts = (params.customer.contactName || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const contact = await findOrCreateContact({
        accountId: account.id,
        firstName,
        lastName,
        title: params.customer.contactTitle,
        email: params.customer.contactEmail,
      });

      const opportunity = await createOpportunity({
        accountId: account.id,
        contactId: contact.id,
        name: generateOpportunityName(params.recordType, account.name),
      });

      const quoteRow = {
        ...buildQuoteRow(params),
        opportunity_id: opportunity.id,
        is_primary: true,
        version_number: 1,
        created_by: userId,
        owner_id: userId,
        org_id: activeOrgId,
      };

      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .insert(quoteRow)
        .select()
        .single();
      if (quoteError) throw quoteError;

      if (params.calculatedQuote?.sections) {
        await insertDynamicLineItems(quoteData.id, params.calculatedQuote, {
          sectionQuantities: params.sectionQuantities,
          hiddenProducts: params.hiddenProducts,
          template: params.resolvedTemplate,
        });
      } else {
        await insertLineItemsAndServices(quoteData.id, params.featureQuantities, params.selectedDeployment);
      }
      await updateOpportunityAmount(opportunity.id, params.quote.tcv);

      return { quote: quoteData, opportunity };
    },
    [activeOrgId, findOrCreateAccount, findOrCreateContact, createOpportunity, updateOpportunityAmount],
  );

  const saveQuoteForOpportunity = useCallback(
    async (opportunityId: string, params: any) => {
      if (!activeOrgId) throw new Error("No active organization");
      const supabase = getSupabase();
      const userId = await getCurrentUserId();

      const { data: existing } = await supabase
        .from("quotes")
        .select("version_number")
        .eq("opportunity_id", opportunityId)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersion = (existing?.[0]?.version_number || 0) + 1;
      const isFirst = !existing || existing.length === 0;

      const quoteRow = {
        ...buildQuoteRow(params),
        opportunity_id: opportunityId,
        is_primary: isFirst,
        version_number: nextVersion,
        created_by: userId,
        owner_id: userId,
        org_id: activeOrgId,
      };

      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .insert(quoteRow)
        .select()
        .single();
      if (quoteError) throw quoteError;

      if (params.calculatedQuote?.sections) {
        await insertDynamicLineItems(quoteData.id, params.calculatedQuote, {
          sectionQuantities: params.sectionQuantities,
          hiddenProducts: params.hiddenProducts,
          template: params.resolvedTemplate,
        });
      } else {
        await insertLineItemsAndServices(quoteData.id, params.featureQuantities, params.selectedDeployment);
      }

      return quoteData;
    },
    [activeOrgId],
  );

  const updateQuote = useCallback(
    async (quoteId: string, params: any) => {
      const supabase = getSupabase();
      const quoteRow = buildQuoteRow(params);

      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .update(quoteRow)
        .eq("id", quoteId)
        .select()
        .single();
      if (quoteError) throw quoteError;

      await deleteLineItemsAndServices(quoteId);
      if (params.calculatedQuote?.sections) {
        await insertDynamicLineItems(quoteId, params.calculatedQuote, {
          sectionQuantities: params.sectionQuantities,
          hiddenProducts: params.hiddenProducts,
          template: params.resolvedTemplate,
        });
      } else {
        await insertLineItemsAndServices(quoteId, params.featureQuantities, params.selectedDeployment);
      }

      if (quoteData.is_primary && quoteData.opportunity_id) {
        await updateOpportunityAmount(quoteData.opportunity_id, params.quote.tcv);
      }

      return quoteData;
    },
    [updateOpportunityAmount],
  );

  const saveAsNewVersion = useCallback(
    async (existingQuoteId: string, params: any) => {
      const supabase = getSupabase();
      const { data: existingQuote } = await supabase
        .from("quotes")
        .select("opportunity_id")
        .eq("id", existingQuoteId)
        .single();

      if (!existingQuote?.opportunity_id) throw new Error("Quote has no opportunity");
      return await saveQuoteForOpportunity(existingQuote.opportunity_id, params);
    },
    [saveQuoteForOpportunity],
  );

  const promoteQuote = useCallback(
    async (quoteId: string) => {
      const supabase = getSupabase();
      const { data: quote } = await supabase
        .from("quotes")
        .select("opportunity_id, tcv")
        .eq("id", quoteId)
        .single();

      if (!quote?.opportunity_id) throw new Error("Quote has no opportunity");

      await supabase
        .from("quotes")
        .update({ is_primary: false })
        .eq("opportunity_id", quote.opportunity_id)
        .eq("is_primary", true);

      const { error } = await supabase.from("quotes").update({ is_primary: true }).eq("id", quoteId);
      if (error) throw error;

      await updateOpportunityAmount(quote.opportunity_id, quote.tcv);
      return true;
    },
    [updateOpportunityAmount],
  );

  const getQuote = useCallback(async (quoteId: string) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("quotes")
      .select(`
        *,
        opportunity:opportunities (
          id, name,
          accounts ( id, name ),
          contacts ( id, first_name, last_name, title, email )
        ),
        quote_line_items ( * ),
        quote_services ( * )
      `)
      .eq("id", quoteId)
      .single();

    if (error) throw error;
    return data;
  }, []);

  const getQuotes = useCallback(
    async (opts?: { ownerIds?: string[] }) => {
      if (!activeOrgId) return [];
      const supabase = getSupabase();

      let query = supabase
        .from("quotes")
        .select(`
          id, status, mrr, arr, tcv, is_primary, version_number, owner_id, created_at, record_type,
          opportunity:opportunities (
            id, name,
            accounts ( name )
          )
        `)
        .eq("org_id", activeOrgId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (opts?.ownerIds) {
        query = query.in("owner_id", opts.ownerIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((q: any) => ({
        id: q.id,
        accountName: q.opportunity?.accounts?.name || "N/A",
        opportunityName: q.opportunity?.name || "N/A",
        opportunityId: q.opportunity?.id,
        status: q.status,
        mrr: q.mrr,
        arr: q.arr,
        tcv: q.tcv,
        isPrimary: q.is_primary,
        versionNumber: q.version_number,
        ownerId: q.owner_id,
        createdAt: q.created_at,
      }));
    },
    [activeOrgId],
  );

  return {
    saveQuote,
    saveQuoteForOpportunity,
    updateQuote,
    saveAsNewVersion,
    promoteQuote,
    getQuote,
    getQuotes,
  };
}
