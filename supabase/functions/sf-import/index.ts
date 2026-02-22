// supabase/functions/sf-import/index.ts
// One-time Salesforce data import.
// Queries Accounts, Contacts, Opportunities from SF REST API
// and upserts them into Supabase with org-scoped dedup keys.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SfQueryResult<T = Record<string, unknown>> {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
}

/** Execute a SOQL query against Salesforce, handling pagination. */
async function sfQuery<T = Record<string, unknown>>(
  instanceUrl: string,
  accessToken: string,
  soql: string
): Promise<T[]> {
  const allRecords: T[] = [];
  let url = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Salesforce query failed (${res.status}): ${body}`);
    }

    const data: SfQueryResult<T> = await res.json();
    allRecords.push(...data.records);
    url = data.nextRecordsUrl
      ? `${instanceUrl}${data.nextRecordsUrl}`
      : "";
  }

  return allRecords;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let importId: string | null = null;

  try {
    const { org_id } = await req.json();
    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "org_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create import tracking record
    const { data: importRec, error: importCreateErr } = await supabase
      .from("sf_imports")
      .insert({ org_id, status: "running", started_at: new Date().toISOString() })
      .select("id")
      .single();

    if (importCreateErr) throw importCreateErr;
    importId = importRec.id;

    // Fetch SF integration credentials
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("org_id", org_id)
      .eq("provider", "salesforce")
      .eq("is_active", true)
      .single();

    if (intError || !integration) {
      throw new Error("No active Salesforce integration found for this org");
    }

    const { access_token, instance_url } = integration.credentials;
    if (!access_token || !instance_url) {
      throw new Error("Salesforce access_token or instance_url missing. Re-authenticate.");
    }

    const errors: Array<{ entity: string; message: string; detail?: string }> = [];
    let importedAccounts = 0;
    let importedContacts = 0;
    let importedOpportunities = 0;

    // ---- Import Accounts ----
    try {
      const sfAccounts = await sfQuery(
        instance_url,
        access_token,
        "SELECT Id, Name, Industry, Website, Phone, BillingCity, BillingState, BillingCountry FROM Account ORDER BY CreatedDate DESC LIMIT 10000"
      );

      for (const acc of sfAccounts) {
        const { error } = await supabase
          .from("accounts")
          .upsert(
            {
              org_id,
              sf_account_id: acc.Id as string,
              name: acc.Name as string,
              sf_data: acc,
            },
            { onConflict: "org_id,sf_account_id" }
          );

        if (error) {
          errors.push({ entity: "account", message: error.message, detail: acc.Id as string });
        } else {
          importedAccounts++;
        }
      }
    } catch (err) {
      errors.push({ entity: "accounts_query", message: String(err) });
    }

    // ---- Import Contacts ----
    try {
      const sfContacts = await sfQuery(
        instance_url,
        access_token,
        "SELECT Id, FirstName, LastName, Title, Email, Phone, AccountId FROM Contact ORDER BY CreatedDate DESC LIMIT 10000"
      );

      // Build lookup of SF Account Id -> Supabase account UUID
      const { data: localAccounts } = await supabase
        .from("accounts")
        .select("id, sf_account_id")
        .eq("org_id", org_id)
        .not("sf_account_id", "is", null);

      const accountMap = new Map<string, string>();
      for (const la of localAccounts || []) {
        if (la.sf_account_id) accountMap.set(la.sf_account_id, la.id);
      }

      for (const con of sfContacts) {
        const accountId = con.AccountId
          ? accountMap.get(con.AccountId as string) || null
          : null;

        const { error } = await supabase
          .from("contacts")
          .upsert(
            {
              org_id,
              sf_contact_id: con.Id as string,
              first_name: (con.FirstName as string) || "",
              last_name: (con.LastName as string) || "",
              title: (con.Title as string) || null,
              email: (con.Email as string) || null,
              phone: (con.Phone as string) || null,
              account_id: accountId,
              sf_data: con,
            },
            { onConflict: "org_id,sf_contact_id" }
          );

        if (error) {
          errors.push({ entity: "contact", message: error.message, detail: con.Id as string });
        } else {
          importedContacts++;
        }
      }
    } catch (err) {
      errors.push({ entity: "contacts_query", message: String(err) });
    }

    // ---- Import Opportunities ----
    try {
      const sfOpps = await sfQuery(
        instance_url,
        access_token,
        "SELECT Id, Name, Amount, StageName, CloseDate, Probability, AccountId, ContactId FROM Opportunity ORDER BY CreatedDate DESC LIMIT 10000"
      );

      // Build lookup maps
      const { data: localAccounts } = await supabase
        .from("accounts")
        .select("id, sf_account_id")
        .eq("org_id", org_id)
        .not("sf_account_id", "is", null);

      const accountMap = new Map<string, string>();
      for (const la of localAccounts || []) {
        if (la.sf_account_id) accountMap.set(la.sf_account_id, la.id);
      }

      const { data: localContacts } = await supabase
        .from("contacts")
        .select("id, sf_contact_id")
        .eq("org_id", org_id)
        .not("sf_contact_id", "is", null);

      const contactMap = new Map<string, string>();
      for (const lc of localContacts || []) {
        if (lc.sf_contact_id) contactMap.set(lc.sf_contact_id, lc.id);
      }

      // Map SF stage names to our stage enum
      const stageMapping: Record<string, string> = {
        "Prospecting": "prospecting",
        "Qualification": "qualification",
        "Needs Analysis": "qualification",
        "Value Proposition": "proposal",
        "Id. Decision Makers": "proposal",
        "Perception Analysis": "proposal",
        "Proposal/Price Quote": "proposal",
        "Negotiation/Review": "negotiation",
        "Closed Won": "closed_won",
        "Closed Lost": "closed_lost",
      };

      for (const opp of sfOpps) {
        const sfStage = (opp.StageName as string) || "";
        const mappedStage = stageMapping[sfStage] || "prospecting";
        const accountId = opp.AccountId
          ? accountMap.get(opp.AccountId as string) || null
          : null;
        const contactId = opp.ContactId
          ? contactMap.get(opp.ContactId as string) || null
          : null;

        const { error } = await supabase
          .from("opportunities")
          .upsert(
            {
              org_id,
              sf_opportunity_id: opp.Id as string,
              name: opp.Name as string,
              amount: opp.Amount || 0,
              stage: mappedStage,
              close_date: opp.CloseDate || null,
              probability: opp.Probability || null,
              account_id: accountId,
              contact_id: contactId,
              sf_data: opp,
            },
            { onConflict: "org_id,sf_opportunity_id" }
          );

        if (error) {
          errors.push({ entity: "opportunity", message: error.message, detail: opp.Id as string });
        } else {
          importedOpportunities++;
        }
      }
    } catch (err) {
      errors.push({ entity: "opportunities_query", message: String(err) });
    }

    // Update import tracking record
    const finalStatus = errors.length > 0 ? "completed" : "completed";
    await supabase
      .from("sf_imports")
      .update({
        status: finalStatus,
        imported_accounts: importedAccounts,
        imported_contacts: importedContacts,
        imported_opportunities: importedOpportunities,
        error_log: errors.length > 0 ? errors : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", importId);

    // Update integration last_sync_at
    await supabase
      .from("integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("org_id", org_id)
      .eq("provider", "salesforce");

    return new Response(
      JSON.stringify({
        import_id: importId,
        status: finalStatus,
        imported_accounts: importedAccounts,
        imported_contacts: importedContacts,
        imported_opportunities: importedOpportunities,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    // Mark import as failed
    if (importId) {
      await supabase
        .from("sf_imports")
        .update({
          status: "failed",
          error_log: [{ entity: "global", message: String(err) }],
          completed_at: new Date().toISOString(),
        })
        .eq("id", importId);
    }

    return new Response(
      JSON.stringify({ error: "Import failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
