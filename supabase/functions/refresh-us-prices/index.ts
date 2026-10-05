// Supabase Edge Function: scheduled repricing of US-listed Wealth OS holdings.
//
// Called every minute 13:00-21:59 UTC Mon-Fri by the pg_cron job
// wealth_os_us_price_refresh (see supabase/migrations/004_auto_us_pricing.sql).
// Exits with no Twelve Data call unless it's a weekday and within 15 minutes
// after one of the UK-time slots below. Inside a window, each call prices the
// next batch of auto_us tickers not yet attempted since the slot started,
// spending at most 8 credits (the free tier's per-minute cap): the USD/GBP
// rate once per slot, plus up to 7-8 tickers.
//
// Same maths as the adviser's manual refresh (api/prices.js +
// applyLivePriceToHolding in hub/wealth-os.html) -- the actual holding update
// happens in SQL (wealth_os.apply_us_prices).
//
// Auth: x-price-job-secret header, checked against the Vault secret
// price_job_secret. Deployed with verify_jwt off for that reason.
//
// Body (all optional, for manual testing -- still needs the secret):
//   { "force": true }                        skip the slot guard, slot start = now
//   { "force": true, "slotStart": "<ISO>" }  ...or an explicit slot start
//   { "force": true, "simulateFailure": true } use a bad API key, to test failure handling
//
// Secrets: TWELVE_DATA_API_KEY (set in dashboard). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the runtime.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SLOTS_UK = [15 * 60, 17 * 60, 19 * 60, 21 * 60 + 15]; // minutes past midnight, Europe/London
const WINDOW_MIN = 15;
const MAX_CREDITS = 8;
const FX_KEY = "USD/GBP";
const TD = "https://api.twelvedata.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Returns the UTC instant the current UK slot started, or null outside a window.
function currentSlotStart(now: Date): Date | null {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return null;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  for (const slot of SLOTS_UK) {
    const into = minutes - slot;
    if (into >= 0 && into < WINDOW_MIN) {
      const start = new Date(now);
      start.setUTCSeconds(0, 0);
      return new Date(start.getTime() - into * 60_000);
    }
  }
  return null;
}

// Twelve Data reports most errors as HTTP 200 with {status:"error", code}.
// Account-level codes mean the whole call failed (don't mark tickers attempted,
// so the next minute retries); anything else is a per-symbol problem.
const WHOLE_CALL_CODES = new Set([401, 403, 429, 500, 502, 503]);

async function fetchPrices(symbols: string[], apiKey: string) {
  const prices: Record<string, number> = {};
  const failures: Record<string, string> = {};
  const res = await fetch(`${TD}/price?symbol=${encodeURIComponent(symbols.join(","))}&apikey=${apiKey}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`Twelve Data HTTP ${res.status}`);
  if (data.status === "error" && WHOLE_CALL_CODES.has(Number(data.code))) {
    throw new Error(`Twelve Data ${data.code}: ${data.message || "error"}`);
  }
  // Flat {price} for a single symbol, keyed by symbol for 2+.
  const entries: Record<string, any> = symbols.length === 1 ? { [symbols[0]]: data } : data;
  for (const sym of symbols) {
    const e = entries[sym];
    if (!e) { failures[sym] = "No data returned"; continue; }
    if (e.status === "error" || e.code) { failures[sym] = e.message || "Not found"; continue; }
    const p = parseFloat(e.price);
    if (!isFinite(p) || p <= 0) failures[sym] = "Invalid price returned";
    else prices[sym] = p;
  }
  return { prices, failures };
}

async function fetchUsdGbp(apiKey: string): Promise<number> {
  const res = await fetch(`${TD}/exchange_rate?symbol=USD/GBP&apikey=${apiKey}`);
  const data = await res.json().catch(() => null);
  const rate = data && parseFloat(data.rate);
  if (!res.ok || !data || data.status === "error" || !isFinite(rate) || rate <= 0) {
    throw new Error(`USD/GBP lookup failed: ${(data && data.message) || `HTTP ${res.status}`}`);
  }
  return rate;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "wealth_os" },
    auth: { persistSession: false },
  });

  const { data: authed, error: authErr } = await db.rpc("check_price_job_secret", {
    p_secret: req.headers.get("x-price-job-secret") || "",
  });
  if (authErr || authed !== true) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  let slotStart: Date | null;
  if (body.force) slotStart = body.slotStart ? new Date(body.slotStart) : now;
  else slotStart = currentSlotStart(now);
  if (!slotStart || isNaN(slotStart.getTime())) return json({ skipped: "outside slot window" });

  const { data: pending, error: pendErr } = await db.rpc("us_price_pending", { p_slot_start: slotStart.toISOString() });
  if (pendErr) return json({ error: pendErr.message }, 500);
  const tickers: string[] = (pending || []).map((r: any) => (typeof r === "string" ? r : r.us_price_pending));
  if (!tickers.length) return json({ skipped: "nothing pending", slotStart });

  const apiKey = body.simulateFailure ? "simulated-invalid-key" : Deno.env.get("TWELVE_DATA_API_KEY");
  const log = async (row: Record<string, unknown>) => {
    const { error } = await db.from("price_refresh_log").insert({ slot_start: slotStart!.toISOString(), ...row });
    if (error) console.error("refresh-us-prices: log insert failed", error);
  };
  if (!apiKey) {
    await log({ error: "TWELVE_DATA_API_KEY secret not set" });
    return json({ error: "TWELVE_DATA_API_KEY not set" }, 500);
  }

  // USD/GBP: reuse this slot's rate if already fetched, else spend one credit on it.
  const { data: fxRow } = await db.from("price_cache").select("price, fetched_at").eq("ticker", FX_KEY).maybeSingle();
  let rate: number | null = fxRow && fxRow.fetched_at && new Date(fxRow.fetched_at) >= slotStart ? Number(fxRow.price) : null;
  const batch = tickers.slice(0, rate ? MAX_CREDITS : MAX_CREDITS - 1);

  try {
    if (!rate) {
      rate = await fetchUsdGbp(apiKey);
      const at = new Date().toISOString();
      await db.from("price_cache").upsert({
        ticker: FX_KEY, price: rate, currency: "GBP", fetched_at: at, attempted_at: at, last_error: null,
      });
    }
    const { prices, failures } = await fetchPrices(batch, apiKey);
    const at = new Date().toISOString();
    let updated = 0;
    if (Object.keys(prices).length) {
      const { data: n, error } = await db.rpc("apply_us_prices", { p_prices: prices, p_rate: rate, p_at: at });
      if (error) throw new Error(`apply_us_prices: ${error.message}`);
      updated = n || 0;
    }
    if (Object.keys(failures).length) {
      const { error } = await db.rpc("mark_us_price_failures", { p_failures: failures, p_at: at });
      if (error) console.error("refresh-us-prices: mark failures failed", error);
    }
    await log({
      tickers: batch, priced: Object.keys(prices), failures, usd_gbp_rate: rate, holdings_updated: updated,
    });
    return json({ slotStart, tickers: batch, priced: Object.keys(prices), failures, rate, updated, remaining: tickers.length - batch.length });
  } catch (err) {
    // Nothing written to holdings: previous prices and values stay as they were.
    const message = err instanceof Error ? err.message : String(err);
    console.error("refresh-us-prices:", message);
    await log({ tickers: batch, usd_gbp_rate: rate, error: message });
    return json({ error: message, slotStart, tickers: batch }, 502);
  }
});
