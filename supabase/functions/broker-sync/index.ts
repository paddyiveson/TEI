// Supabase Edge Function: sync Trading 212 positions + cash into Wealth OS.
// PILOT -- adviser's own accounts only (see supabase/migrations/023_broker_sync_t212.sql).
//
// Two ways in:
//   1. Scheduled: pg_cron -> wealth_os.trigger_broker_sync() sends the
//      x-price-job-secret header (Vault secret price_job_secret, shared with
//      refresh-us-prices). Syncs every connection with auto_sync on.
//   2. "Sync now": the browser calls with the user's own Supabase JWT and
//      { "accountId": "<uuid>" }. wealth_os.request_broker_sync() runs AS that
//      user, so the adviser + own-account checks live in SQL, not here.
// Deployed with verify_jwt off because route 1 has no user JWT.
//
// Read-only against Trading 212: GET /equity/account/summary and
// GET /equity/positions. Nothing here can place or cancel an order.
//
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// by the runtime. API keys never leave Vault except into this function's memory.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const T212 = "https://live.trading212.com/api/v0";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

class SyncError extends Error {}

async function t212Get(path: string, credentials: string) {
  const res = await fetch(T212 + path, { headers: { Authorization: "Basic " + btoa(credentials) } });
  if (res.status === 401 || res.status === 403) {
    throw new SyncError("Trading 212 rejected the key. Check it was created on the ISA/Invest account with Account data and Portfolio permissions, and has not been revoked.");
  }
  if (res.status === 429) throw new SyncError("Trading 212 rate limit hit, try again in a minute.");
  if (!res.ok) throw new SyncError(`Trading 212 returned ${res.status} for ${path}.`);
  return await res.json();
}

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

// "ONDS_US_EQ" -> "ONDS"; "VODl_EQ" -> "VOD" (lower-case exchange suffix).
function baseTicker(ref: string) {
  return (ref.split("_")[0] || ref).replace(/[a-z]+$/, "");
}

async function syncOne(db: SupabaseClient, t: { connection_id: string; credentials: string }) {
  try {
    const summary = await t212Get("/equity/account/summary", t.credentials);
    const positions = await t212Get("/equity/positions", t.credentials);
    if (!Array.isArray(positions)) throw new SyncError("Unexpected positions response from Trading 212.");

    // Cash = Trading 212's own account total minus its investments, so the
    // Wealth OS figure matches the app exactly. Adding the cash buckets up
    // ourselves came out ~£8 high on the first live test (12 Nov 2026).
    const cash = summary?.cash || {};
    const total = num(summary?.totalValue), invested = num(summary?.investments?.currentValue);
    const cashTotal = total != null && invested != null
      ? total - invested
      : (num(cash.availableToTrade) || 0) + (num(cash.inPies) || 0) + (num(cash.reservedForOrders) || 0);

    const rows = positions
      .filter((p: any) => p?.instrument?.ticker && num(p.quantity) && p.quantity > 0)
      .map((p: any) => {
        const ref = String(p.instrument.ticker);
        // Prices come in the instrument's currency; LSE lines are quoted in
        // pence (GBX). Wealth OS stores pounds for GBP lines and the native
        // price for everything else (same as the US auto-pricing).
        const fx = String(p.instrument.currency || "").toUpperCase() === "GBX" ? 0.01 : 1;
        const wi = p.walletImpact || {};
        if (wi.currency && wi.currency !== summary.currency) {
          throw new SyncError(`Position ${ref} is valued in ${wi.currency}, expected ${summary.currency}.`);
        }
        return {
          ref,
          base: baseTicker(ref),
          name: p.instrument.name || null,
          units: p.quantity,
          avgOpen: num(p.averagePricePaid) != null ? +(p.averagePricePaid * fx).toFixed(6) : null,
          lastPrice: num(p.currentPrice) != null ? +(p.currentPrice * fx).toFixed(6) : null,
          cost: num(wi.totalCost),
          value: num(wi.currentValue),
        };
      });

    const { data, error } = await db.schema("wealth_os").rpc("apply_broker_sync", {
      p_connection_id: t.connection_id,
      p_summary: { currency: summary.currency, cash: Math.round(cashTotal * 100) / 100 },
      p_positions: rows,
    });
    if (error) throw new SyncError(error.message);
    return { connectionId: t.connection_id, ok: true, result: data };
  } catch (err) {
    const message = err instanceof SyncError ? err.message : "Sync failed: " + (err as Error).message;
    await db.schema("wealth_os").rpc("mark_broker_sync_error", { p_connection_id: t.connection_id, p_error: message });
    return { connectionId: t.connection_id, ok: false, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let connectionId: string | null = null;
  const jobSecret = req.headers.get("x-price-job-secret");
  if (jobSecret) {
    const { data: ok } = await db.schema("wealth_os").rpc("check_price_job_secret", { p_secret: jobSecret });
    if (!ok) return json({ error: "Unauthorized" }, 401);
  } else {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    if (!body?.accountId) return json({ error: "accountId required" }, 400);
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data, error } = await asUser.schema("wealth_os").rpc("request_broker_sync", { p_account_id: body.accountId });
    if (error || !data) return json({ error: error?.message || "Not allowed" }, 403);
    connectionId = data as string;
  }

  const { data: targets, error } = await db.schema("wealth_os").rpc("broker_sync_targets", { p_connection_id: connectionId });
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const t of targets || []) results.push(await syncOne(db, t)); // sequential: rate limits are per account
  return json({ results });
});
