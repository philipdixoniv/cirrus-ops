// supabase/functions/sf-activity-sync/index.ts
// Iterates all active Salesforce integrations, queries recent Tasks/Events,
// and upserts them into the activities table with type mapping.

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
      throw new Error(`SF query failed (${res.status}): ${body}`);
    }

    const data: SfQueryResult<T> = await res.json();
    allRecords.push(...data.records);
    url = data.nextRecordsUrl
      ? `${instanceUrl}${data.nextRecordsUrl}`
      : "";
  }

  return allRecords;
}

/** Map Salesforce Task/Event types to our activity type enum. */
function mapActivityType(sfType: string | null, sfSubject: string | null, isEvent: boolean): string {
  if (isEvent) return "meeting";

  const typeLower = (sfType || "").toLowerCase();
  const subjectLower = (sfSubject || "").toLowerCase();

  if (typeLower === "call" || subjectLower.includes("call")) return "call";
  if (typeLower === "email" || subjectLower.includes("email")) return "email";
  if (
    typeLower === "meeting" ||
    subjectLower.includes("meeting") ||
    subjectLower.includes("demo")
  ) {
    return "meeting";
  }

  return "task";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Optionally accept a specific org_id, otherwise process all active SF integrations
    let targetOrgId: string | null = null;
    try {
      const body = await req.json();
      targetOrgId = body.org_id || null;
    } catch {
      // No body or invalid JSON -- process all orgs
    }

    // Fetch active SF integrations
    let query = supabase
      .from("integrations")
      .select("*")
      .eq("provider", "salesforce")
      .eq("is_active", true);

    if (targetOrgId) {
      query = query.eq("org_id", targetOrgId);
    }

    const { data: integrations, error: intError } = await query;
    if (intError) throw intError;

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active Salesforce integrations found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      org_id: string;
      synced_tasks: number;
      synced_events: number;
      errors: string[];
    }> = [];

    for (const integration of integrations) {
      const orgId = integration.org_id;
      const { access_token, instance_url } = integration.credentials || {};
      const orgErrors: string[] = [];
      let syncedTasks = 0;
      let syncedEvents = 0;

      if (!access_token || !instance_url) {
        orgErrors.push("Missing access_token or instance_url");
        results.push({ org_id: orgId, synced_tasks: 0, synced_events: 0, errors: orgErrors });
        continue;
      }

      // Build lookup maps: SF Account/Contact/Opp IDs -> local UUIDs
      const { data: localAccounts } = await supabase
        .from("accounts")
        .select("id, sf_account_id")
        .eq("org_id", orgId)
        .not("sf_account_id", "is", null);

      const accountMap = new Map<string, string>();
      for (const la of localAccounts || []) {
        if (la.sf_account_id) accountMap.set(la.sf_account_id, la.id);
      }

      const { data: localContacts } = await supabase
        .from("contacts")
        .select("id, sf_contact_id")
        .eq("org_id", orgId)
        .not("sf_contact_id", "is", null);

      const contactMap = new Map<string, string>();
      for (const lc of localContacts || []) {
        if (lc.sf_contact_id) contactMap.set(lc.sf_contact_id, lc.id);
      }

      const { data: localOpps } = await supabase
        .from("opportunities")
        .select("id, sf_opportunity_id")
        .eq("org_id", orgId)
        .not("sf_opportunity_id", "is", null);

      const oppMap = new Map<string, string>();
      for (const lo of localOpps || []) {
        if (lo.sf_opportunity_id) oppMap.set(lo.sf_opportunity_id, lo.id);
      }

      // Determine sync window: last 7 days or since last_sync_at
      const sinceDate = integration.last_sync_at
        ? new Date(integration.last_sync_at).toISOString().split("T")[0]
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // ---- Sync Tasks ----
      try {
        const tasks = await sfQuery(
          instance_url,
          access_token,
          `SELECT Id, Subject, Description, Type, Status, ActivityDate, AccountId, WhoId, WhatId, CallDurationInSeconds FROM Task WHERE LastModifiedDate >= ${sinceDate}T00:00:00Z ORDER BY ActivityDate DESC LIMIT 5000`
        );

        for (const task of tasks) {
          const activityType = mapActivityType(
            task.Type as string | null,
            task.Subject as string | null,
            false
          );

          const accountId = task.AccountId
            ? accountMap.get(task.AccountId as string) || null
            : null;

          // WhoId can be a Contact
          const contactId = task.WhoId
            ? contactMap.get(task.WhoId as string) || null
            : null;

          // WhatId can be an Opportunity
          const opportunityId = task.WhatId
            ? oppMap.get(task.WhatId as string) || null
            : null;

          const durationMinutes = task.CallDurationInSeconds
            ? Math.round((task.CallDurationInSeconds as number) / 60)
            : null;

          const { error } = await supabase
            .from("activities")
            .upsert(
              {
                org_id: orgId,
                sf_activity_id: task.Id as string,
                account_id: accountId,
                contact_id: contactId,
                opportunity_id: opportunityId,
                type: activityType,
                subject: (task.Subject as string) || null,
                description: (task.Description as string) || null,
                activity_date: task.ActivityDate
                  ? new Date(task.ActivityDate as string).toISOString()
                  : null,
                duration_minutes: durationMinutes,
                sf_data: task,
              },
              { onConflict: "org_id,sf_activity_id" }
            );

          if (error) {
            orgErrors.push(`Task ${task.Id}: ${error.message}`);
          } else {
            syncedTasks++;
          }
        }
      } catch (err) {
        orgErrors.push(`Tasks query: ${String(err)}`);
      }

      // ---- Sync Events ----
      try {
        const events = await sfQuery(
          instance_url,
          access_token,
          `SELECT Id, Subject, Description, Type, StartDateTime, EndDateTime, DurationInMinutes, AccountId, WhoId, WhatId FROM Event WHERE LastModifiedDate >= ${sinceDate}T00:00:00Z ORDER BY StartDateTime DESC LIMIT 5000`
        );

        for (const evt of events) {
          const accountId = evt.AccountId
            ? accountMap.get(evt.AccountId as string) || null
            : null;

          const contactId = evt.WhoId
            ? contactMap.get(evt.WhoId as string) || null
            : null;

          const opportunityId = evt.WhatId
            ? oppMap.get(evt.WhatId as string) || null
            : null;

          const { error } = await supabase
            .from("activities")
            .upsert(
              {
                org_id: orgId,
                sf_activity_id: evt.Id as string,
                account_id: accountId,
                contact_id: contactId,
                opportunity_id: opportunityId,
                type: "meeting",
                subject: (evt.Subject as string) || null,
                description: (evt.Description as string) || null,
                activity_date: evt.StartDateTime
                  ? new Date(evt.StartDateTime as string).toISOString()
                  : null,
                duration_minutes: (evt.DurationInMinutes as number) || null,
                sf_data: evt,
              },
              { onConflict: "org_id,sf_activity_id" }
            );

          if (error) {
            orgErrors.push(`Event ${evt.Id}: ${error.message}`);
          } else {
            syncedEvents++;
          }
        }
      } catch (err) {
        orgErrors.push(`Events query: ${String(err)}`);
      }

      // Update last_sync_at
      await supabase
        .from("integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", integration.id);

      results.push({
        org_id: orgId,
        synced_tasks: syncedTasks,
        synced_events: syncedEvents,
        errors: orgErrors,
      });
    }

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Activity sync failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
