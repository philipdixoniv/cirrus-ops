// supabase/functions/mrr-snapshot/index.ts
// Iterates all orgs with active Stripe integrations,
// calculates MRR per account from active orders/subscriptions,
// compares with previous snapshot to determine movement_type,
// and inserts mrr_snapshots records.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const today = new Date().toISOString().split("T")[0];

    // Optionally accept a specific org_id
    let targetOrgId: string | null = null;
    try {
      const body = await req.json();
      targetOrgId = body.org_id || null;
    } catch {
      // No body -- process all orgs
    }

    // Fetch orgs with active Stripe integrations
    let intQuery = supabase
      .from("integrations")
      .select("org_id")
      .eq("provider", "stripe")
      .eq("is_active", true);

    if (targetOrgId) {
      intQuery = intQuery.eq("org_id", targetOrgId);
    }

    const { data: integrations, error: intError } = await intQuery;
    if (intError) throw intError;

    // Deduplicate org IDs (an org may have sandbox + production integrations)
    const orgIds = [...new Set((integrations || []).map((i) => i.org_id))];

    if (orgIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No orgs with active Stripe integrations" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      org_id: string;
      snapshots_created: number;
      errors: string[];
    }> = [];

    for (const orgId of orgIds) {
      const orgErrors: string[] = [];
      let snapshotsCreated = 0;

      try {
        // Fetch all active orders for this org, grouped by account
        const { data: activeOrders, error: orderError } = await supabase
          .from("orders")
          .select("id, account_id, stripe_subscription_id, mrr, arr, status")
          .eq("org_id", orgId)
          .eq("status", "active");

        if (orderError) {
          orgErrors.push(`Orders query: ${orderError.message}`);
          results.push({ org_id: orgId, snapshots_created: 0, errors: orgErrors });
          continue;
        }

        // Aggregate MRR per account
        const accountMrr = new Map<
          string,
          { mrr: number; arr: number; subscriptionIds: string[] }
        >();

        for (const order of activeOrders || []) {
          const accountId = order.account_id;
          if (!accountId) continue;

          const existing = accountMrr.get(accountId) || {
            mrr: 0,
            arr: 0,
            subscriptionIds: [],
          };

          existing.mrr += parseFloat(order.mrr) || 0;
          existing.arr += parseFloat(order.arr) || 0;
          if (order.stripe_subscription_id) {
            existing.subscriptionIds.push(order.stripe_subscription_id);
          }

          accountMrr.set(accountId, existing);
        }

        // Fetch the most recent previous snapshot for each account in this org
        // to determine movement_type
        const { data: previousSnapshots } = await supabase
          .from("mrr_snapshots")
          .select("account_id, mrr, snapshot_date")
          .eq("org_id", orgId)
          .lt("snapshot_date", today)
          .order("snapshot_date", { ascending: false });

        // Build a map of account_id -> most recent MRR
        const previousMrrByAccount = new Map<string, number>();
        const seenAccounts = new Set<string>();

        for (const snap of previousSnapshots || []) {
          if (snap.account_id && !seenAccounts.has(snap.account_id)) {
            seenAccounts.add(snap.account_id);
            previousMrrByAccount.set(snap.account_id, parseFloat(snap.mrr) || 0);
          }
        }

        // Create snapshot records for each account with current MRR
        for (const [accountId, current] of accountMrr.entries()) {
          const previousMrr = previousMrrByAccount.get(accountId);
          let movementType: string;

          if (previousMrr === undefined || previousMrr === null) {
            // No previous record -- this is new revenue
            movementType = "new";
          } else if (previousMrr === 0 && current.mrr > 0) {
            // Was churned, now back -- reactivation
            movementType = "reactivation";
          } else if (current.mrr > previousMrr) {
            movementType = "expansion";
          } else if (current.mrr < previousMrr) {
            movementType = "contraction";
          } else {
            // MRR unchanged -- still record a snapshot but skip if no change
            // We will still insert to have a complete timeline
            movementType = "new"; // Flat renewal; use 'new' as closest match
            // Only insert if mrr changed or this is the first of the day
          }

          const { error: insertError } = await supabase
            .from("mrr_snapshots")
            .insert({
              org_id: orgId,
              snapshot_date: today,
              account_id: accountId,
              subscription_id: current.subscriptionIds[0] || null,
              mrr: current.mrr,
              arr: current.arr,
              movement_type: movementType,
            });

          if (insertError) {
            orgErrors.push(
              `Snapshot for account ${accountId}: ${insertError.message}`
            );
          } else {
            snapshotsCreated++;
          }

          // Remove from previousMrr map so we can detect churned accounts
          previousMrrByAccount.delete(accountId);
        }

        // Any accounts remaining in previousMrrByAccount with non-zero MRR
        // that are NOT in current accountMrr have churned
        for (const [accountId, prevMrr] of previousMrrByAccount.entries()) {
          if (prevMrr > 0) {
            const { error: insertError } = await supabase
              .from("mrr_snapshots")
              .insert({
                org_id: orgId,
                snapshot_date: today,
                account_id: accountId,
                subscription_id: null,
                mrr: 0,
                arr: 0,
                movement_type: "churn",
              });

            if (insertError) {
              orgErrors.push(
                `Churn snapshot for account ${accountId}: ${insertError.message}`
              );
            } else {
              snapshotsCreated++;
            }
          }
        }
      } catch (err) {
        orgErrors.push(`Org processing error: ${String(err)}`);
      }

      results.push({
        org_id: orgId,
        snapshots_created: snapshotsCreated,
        errors: orgErrors,
      });
    }

    const totalSnapshots = results.reduce(
      (sum, r) => sum + r.snapshots_created,
      0
    );

    return new Response(
      JSON.stringify({
        snapshot_date: today,
        orgs_processed: results.length,
        total_snapshots: totalSnapshots,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "MRR snapshot failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
