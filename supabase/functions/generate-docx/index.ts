// supabase/functions/generate-docx/index.ts
// Generates a DOCX quote document by merging quote data into a template.
// Uses docxtemplater + pizzip to process .docx templates stored in Supabase Storage.
// Stores the result back in Storage and creates a quote_documents record.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Docxtemplater from "https://esm.sh/docxtemplater@3.47.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { quote_id, template_id } = await req.json();

    if (!quote_id || !template_id) {
      return new Response(
        JSON.stringify({ error: "quote_id and template_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the template record
    const { data: template, error: tplError } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", template_id)
      .single();

    if (tplError || !template) {
      return new Response(
        JSON.stringify({ error: "Template not found", details: tplError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!template.storage_path) {
      return new Response(
        JSON.stringify({ error: "Template has no storage_path. Upload a .docx template first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the quote with all related data
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(`
        *,
        quote_line_items(*),
        quote_services(*),
        opportunities(
          id, name, amount, stage, close_date,
          accounts(id, name),
          contacts(id, first_name, last_name, title, email, phone)
        )
      `)
      .eq("id", quote_id)
      .single();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({ error: "Quote not found", details: quoteError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = quote.org_id;

    // Fetch org details
    const { data: org } = await supabase
      .from("organizations")
      .select("name, slug")
      .eq("id", orgId)
      .single();

    // Download the template file from storage
    const { data: templateFile, error: downloadError } = await supabase.storage
      .from("documents")
      .download(template.storage_path);

    if (downloadError || !templateFile) {
      return new Response(
        JSON.stringify({ error: "Failed to download template", details: downloadError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const templateBuffer = await templateFile.arrayBuffer();

    // Build the template data context
    const opportunity = quote.opportunities;
    const account = opportunity?.accounts;
    const contact = opportunity?.contacts;

    const lineItems = (quote.quote_line_items || [])
      .filter((li: Record<string, unknown>) => !li.hidden)
      .map((li: Record<string, unknown>) => ({
        feature_name: li.feature_name,
        feature_id: li.feature_id,
        quantity: li.quantity,
        unit_price: parseFloat(li.unit_price as string).toFixed(2),
        line_total: parseFloat(li.line_total as string).toFixed(2),
      }));

    const services = (quote.quote_services || [])
      .filter((svc: Record<string, unknown>) => !svc.hidden)
      .map((svc: Record<string, unknown>) => ({
        service_name: svc.service_name,
        service_id: svc.service_id,
        duration: svc.duration || "",
        quantity: svc.quantity,
        price: parseFloat(svc.price as string).toFixed(2),
      }));

    const templateData = {
      // Organization
      org_name: org?.name || "",
      org_slug: org?.slug || "",

      // Quote
      quote_id: quote.id,
      quote_short_id: quote.id.substring(0, 8).toUpperCase(),
      quote_version: quote.version_number,
      quote_status: quote.status,
      quote_date: new Date(quote.created_at).toLocaleDateString("en-US"),
      term_length: quote.term_length,
      billing_frequency: quote.billing_frequency,
      seat_count: quote.seat_count,
      plan: quote.plan,
      payment_terms_net: quote.payment_terms_net,
      additional_discount: quote.additional_discount || "0",
      mrr: quote.mrr ? parseFloat(quote.mrr).toFixed(2) : "0.00",
      arr: quote.arr ? parseFloat(quote.arr).toFixed(2) : "0.00",
      tcv: quote.tcv ? parseFloat(quote.tcv).toFixed(2) : "0.00",
      meeting_intelligence_hours: quote.meeting_intelligence_hours || 0,
      live_coaching_hours: quote.live_coaching_hours || 0,

      // Account
      account_name: account?.name || "",

      // Contact
      contact_first_name: contact?.first_name || "",
      contact_last_name: contact?.last_name || "",
      contact_full_name: contact
        ? `${contact.first_name} ${contact.last_name}`
        : "",
      contact_title: contact?.title || "",
      contact_email: contact?.email || "",
      contact_phone: contact?.phone || "",

      // Opportunity
      opportunity_name: opportunity?.name || "",
      opportunity_amount: opportunity?.amount
        ? parseFloat(opportunity.amount).toFixed(2)
        : "0.00",
      opportunity_stage: opportunity?.stage || "",
      opportunity_close_date: opportunity?.close_date || "",

      // Tables
      line_items: lineItems,
      services: services,

      // Computed
      today: new Date().toLocaleDateString("en-US"),
      current_year: new Date().getFullYear().toString(),
    };

    // Process the template with docxtemplater
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Silently handle missing tags rather than throwing
      nullGetter: () => "",
    });

    doc.render(templateData);

    const outputBuffer = doc.getZip().generate({
      type: "uint8array",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    // Upload generated document to storage
    const fileName = `quote-${quote.id.substring(0, 8)}-v${quote.version_number}-${template.type}.docx`;
    const storagePath = `${orgId}/documents/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, outputBuffer, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    if (uploadError) {
      // Try creating the bucket first
      await supabase.storage.createBucket("documents", {
        public: false,
        fileSizeLimit: 10485760,
      });

      const { error: retryError } = await supabase.storage
        .from("documents")
        .upload(storagePath, outputBuffer, {
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });

      if (retryError) {
        throw new Error(`Storage upload failed: ${retryError.message}`);
      }
    }

    // Create quote_documents record
    await supabase.from("quote_documents").insert({
      org_id: orgId,
      quote_id: quote.id,
      template_id: template.id,
      document_type: "docx",
      storage_path: storagePath,
      file_name: fileName,
    });

    // Generate signed download URL
    const { data: signedUrl } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 3600);

    return new Response(
      JSON.stringify({
        file_name: fileName,
        storage_path: storagePath,
        download_url: signedUrl?.signedUrl || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "DOCX generation failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
