// supabase/functions/generate-pdf/index.ts
// Generates a PDF quote document using pdf-lib.
// Fetches quote data, renders it into a PDF, stores in Supabase Storage,
// creates a quote_documents record, and returns the download URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

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
    const { quote_id } = await req.json();

    if (!quote_id) {
      return new Response(
        JSON.stringify({ error: "quote_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the full quote with all related data
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(`
        *,
        quote_line_items(*),
        quote_services(*),
        opportunities(
          id, name, amount, stage,
          accounts(id, name),
          contacts(id, first_name, last_name, title, email)
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

    // Fetch org name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single();

    const orgName = org?.name || "Cirrus";
    const opportunity = quote.opportunities;
    const account = opportunity?.accounts;
    const contact = opportunity?.contacts;

    // ---- Build the PDF ----
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 612; // Letter size
    const pageHeight = 792;
    const margin = 50;
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawText = (
      text: string,
      x: number,
      yPos: number,
      size = 10,
      font = helvetica,
      color = rgb(0, 0, 0)
    ) => {
      page.drawText(text, { x, y: yPos, size, font, color });
    };

    const addNewPageIfNeeded = (requiredSpace: number) => {
      if (y < margin + requiredSpace) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    };

    // Header
    drawText(orgName, margin, y, 24, helveticaBold, rgb(0.1, 0.3, 0.6));
    y -= 15;
    drawText("QUOTE", margin, y, 12, helveticaBold, rgb(0.4, 0.4, 0.4));
    y -= 30;

    // Quote metadata
    drawText(`Quote #: ${quote.id.substring(0, 8).toUpperCase()}`, margin, y, 10, helveticaBold);
    drawText(
      `Date: ${new Date(quote.created_at).toLocaleDateString("en-US")}`,
      margin + 300,
      y,
      10
    );
    y -= 15;
    drawText(`Version: ${quote.version_number}`, margin, y, 10);
    drawText(`Status: ${quote.status.toUpperCase()}`, margin + 300, y, 10);
    y -= 15;
    drawText(`Term: ${quote.term_length}`, margin, y, 10);
    drawText(`Billing: ${quote.billing_frequency}`, margin + 300, y, 10);
    y -= 15;
    drawText(`Seats: ${quote.seat_count}`, margin, y, 10);
    drawText(`Payment Terms: Net ${quote.payment_terms_net}`, margin + 300, y, 10);
    y -= 25;

    // Divider
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 20;

    // Customer info
    if (account || contact) {
      drawText("PREPARED FOR", margin, y, 10, helveticaBold, rgb(0.4, 0.4, 0.4));
      y -= 15;

      if (account) {
        drawText(account.name, margin, y, 12, helveticaBold);
        y -= 15;
      }

      if (contact) {
        drawText(
          `${contact.first_name} ${contact.last_name}${contact.title ? `, ${contact.title}` : ""}`,
          margin,
          y,
          10
        );
        y -= 12;
        if (contact.email) {
          drawText(contact.email, margin, y, 10, helvetica, rgb(0.2, 0.4, 0.7));
          y -= 12;
        }
      }

      y -= 15;
    }

    // Opportunity
    if (opportunity) {
      drawText("OPPORTUNITY", margin, y, 10, helveticaBold, rgb(0.4, 0.4, 0.4));
      y -= 15;
      drawText(opportunity.name, margin, y, 10);
      y -= 20;
    }

    // Filter out hidden items
    const visibleLineItems = (quote.quote_line_items || []).filter((li: Record<string, unknown>) => !li.hidden);
    const visibleServices = (quote.quote_services || []).filter((svc: Record<string, unknown>) => !svc.hidden);

    // Line items table
    if (visibleLineItems.length > 0) {
      addNewPageIfNeeded(100);

      drawText("LINE ITEMS", margin, y, 10, helveticaBold, rgb(0.4, 0.4, 0.4));
      y -= 20;

      // Table header
      const colFeature = margin;
      const colQty = margin + 280;
      const colUnit = margin + 340;
      const colTotal = margin + 430;

      drawText("Feature", colFeature, y, 9, helveticaBold);
      drawText("Qty", colQty, y, 9, helveticaBold);
      drawText("Unit Price", colUnit, y, 9, helveticaBold);
      drawText("Total", colTotal, y, 9, helveticaBold);
      y -= 5;

      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 12;

      for (const li of visibleLineItems) {
        addNewPageIfNeeded(20);
        drawText(li.feature_name, colFeature, y, 9);
        drawText(String(li.quantity), colQty, y, 9);
        drawText(`$${parseFloat(li.unit_price).toFixed(2)}`, colUnit, y, 9);
        drawText(`$${parseFloat(li.line_total).toFixed(2)}`, colTotal, y, 9);
        y -= 14;
      }

      y -= 10;
    }

    // Services table
    if (visibleServices.length > 0) {
      addNewPageIfNeeded(80);

      drawText("PROFESSIONAL SERVICES", margin, y, 10, helveticaBold, rgb(0.4, 0.4, 0.4));
      y -= 20;

      const colService = margin;
      const colDuration = margin + 280;
      const colPrice = margin + 430;

      drawText("Service", colService, y, 9, helveticaBold);
      drawText("Duration", colDuration, y, 9, helveticaBold);
      drawText("Price", colPrice, y, 9, helveticaBold);
      y -= 5;

      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 12;

      for (const svc of visibleServices) {
        addNewPageIfNeeded(20);
        drawText(svc.service_name, colService, y, 9);
        drawText(svc.duration || "", colDuration, y, 9);
        drawText(`$${parseFloat(svc.price).toFixed(2)}`, colPrice, y, 9);
        y -= 14;
      }

      y -= 10;
    }

    // Totals section
    addNewPageIfNeeded(80);

    page.drawLine({
      start: { x: margin + 300, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 15;

    if (quote.additional_discount && parseFloat(quote.additional_discount) > 0) {
      drawText(
        `Discount: ${quote.additional_discount}%`,
        margin + 300,
        y,
        10,
        helvetica,
        rgb(0.7, 0.2, 0.2)
      );
      y -= 15;
    }

    if (quote.mrr) {
      drawText(`MRR: $${parseFloat(quote.mrr).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, margin + 300, y, 10, helveticaBold);
      y -= 15;
    }

    if (quote.arr) {
      drawText(`ARR: $${parseFloat(quote.arr).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, margin + 300, y, 10, helveticaBold);
      y -= 15;
    }

    if (quote.tcv) {
      drawText(
        `Total Contract Value: $${parseFloat(quote.tcv).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        margin + 300,
        y,
        12,
        helveticaBold,
        rgb(0.1, 0.3, 0.6)
      );
      y -= 20;
    }

    // Footer
    y = margin + 20;
    drawText(
      `Generated by ${orgName} on ${new Date().toLocaleDateString("en-US")}`,
      margin,
      y,
      8,
      helvetica,
      rgb(0.6, 0.6, 0.6)
    );

    // ---- Serialize and upload ----
    const pdfBytes = await pdfDoc.save();
    const fileName = `quote-${quote.id.substring(0, 8)}-v${quote.version_number}.pdf`;
    const storagePath = `${orgId}/documents/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      // Try creating the bucket first if it doesn't exist
      await supabase.storage.createBucket("documents", {
        public: false,
        fileSizeLimit: 10485760, // 10MB
      });

      const { error: retryError } = await supabase.storage
        .from("documents")
        .upload(storagePath, pdfBytes, {
          contentType: "application/pdf",
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
      document_type: "pdf",
      storage_path: storagePath,
      file_name: fileName,
    });

    // Generate signed download URL (valid for 1 hour)
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
      JSON.stringify({ error: "PDF generation failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
