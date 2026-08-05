// Vercel serverless function: proxies live price lookups to Twelve Data for
// Wealth OS holdings (hub/wealth-os.html). Exists purely because the app is
// client-side only -- a Twelve Data API key can never be shipped to the
// browser, so this is the one hop that holds it server-side (same reasoning
// as api/feedback-notify.js re: the Supabase service-role key).
//
// GET /api/prices?symbols=AAPL,VOD,MSFT
// Auth: Authorization: Bearer <supabase access token> -- required. Verified
// against Supabase's own /auth/v1/user endpoint (not a service-role lookup,
// just "is this a currently-logged-in Wealth OS user") so a free Twelve Data
// quota can't be drained by an anonymous script hitting this URL directly.
//
// Response shape (always 200 once past auth -- per-symbol failures don't
// fail the whole request):
//   { prices: { AAPL: 123.45, ... }, errors: { BADSYM: "message from Twelve Data" }, usdGbpRate: 0.79 }
//
// Currency: Twelve Data prices come back in whatever currency the ticker is
// actually listed in. Wealth OS only ever stores GBP. Simplifying assumption
// (deliberate, confirmed with the user 2026-08): Twelve Data doesn't cover
// LSE-listed tickers at all, so in practice every ticker priced through this
// feature is US-listed -- one USD/GBP rate, fetched once per request
// alongside the price batch, covers every symbol. If a non-USD ticker is
// ever added this will silently mis-convert it -- revisit if that happens.
//
// Required env vars (set in Vercel project settings):
//   TWELVE_DATA_API_KEY - api key from twelvedata.com
//   SUPABASE_URL         - same project already used by hub/js/supabase-config.js
//   SUPABASE_ANON_KEY    - same project already used by hub/js/supabase-config.js

const MAX_SYMBOLS = 40;
const SYMBOL_RE = /^[A-Za-z0-9.:_-]{1,20}$/; // tickers only -- blocks anything that isn't a plausible symbol

async function verifySupabaseUser(token) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey || !token) return false;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const authed = await verifySupabaseUser(token);
  if (!authed) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.error("prices: missing TWELVE_DATA_API_KEY env var");
    res.status(500).json({ error: "Price feed not configured" });
    return;
  }

  const raw = String(req.query.symbols || "");
  const symbols = [...new Set(
    raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  )].filter((s) => SYMBOL_RE.test(s));

  if (!symbols.length) {
    res.status(400).json({ error: "No valid symbols given" });
    return;
  }
  if (symbols.length > MAX_SYMBOLS) {
    res.status(400).json({ error: `Too many symbols (max ${MAX_SYMBOLS})` });
    return;
  }

  try {
    const tdUrl = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols.join(","))}&apikey=${apiKey}`;
    const tdRes = await fetch(tdUrl);
    const data = await tdRes.json().catch(() => null);
    if (!tdRes.ok || !data) {
      console.error("prices: Twelve Data HTTP error", tdRes.status);
      // TEMP DEBUG (remove once the root cause is confirmed): surfaces the
      // upstream HTTP status + response body directly in the browser
      // response so it doesn't require digging through Vercel's log UI.
      res.status(502).json({ error: "Price feed unavailable", debugTwelveDataStatus: tdRes.status, debugTwelveDataBody: data });
      return;
    }

    const prices = {};
    const errors = {};

    // Twelve Data returns a flat {price:"..."} object when exactly one
    // symbol was requested, and {SYMBOL:{price:"..."}, ...} keyed by symbol
    // for a batch of 2+ -- normalise both shapes to the same output.
    if (symbols.length === 1 && data.price !== undefined) {
      const p = parseFloat(data.price);
      if (data.status === "error" || isNaN(p)) errors[symbols[0]] = data.message || "Not found";
      else prices[symbols[0]] = p;
    } else {
      for (const sym of symbols) {
        const entry = data[sym];
        if (!entry) { errors[sym] = "No data returned"; continue; }
        if (entry.status === "error" || entry.code) { errors[sym] = entry.message || "Not found"; continue; }
        const p = parseFloat(entry.price);
        if (isNaN(p)) errors[sym] = "Invalid price returned";
        else prices[sym] = p;
      }
    }

    // Fetch once per request regardless of batch size -- covers every
    // symbol in this call, no point paying for it per-ticker. Left null
    // (rather than defaulting to 1) if the rate lookup itself fails, so the
    // caller can refuse to convert with a wrong assumption rather than
    // silently storing an unconverted USD figure as GBP.
    let usdGbpRate = null;
    if (Object.keys(prices).length) {
      try {
        const fxRes = await fetch(`https://api.twelvedata.com/exchange_rate?symbol=USD/GBP&apikey=${apiKey}`);
        const fxData = await fxRes.json().catch(() => null);
        const rate = fxData && parseFloat(fxData.rate);
        if (fxRes.ok && fxData && !isNaN(rate)) usdGbpRate = rate;
        else console.error("prices: exchange_rate lookup failed", fxRes.status, fxData);
      } catch (err) {
        console.error("prices: exchange_rate fetch error", err);
      }
    }

    res.status(200).json({ prices, errors, usdGbpRate });
  } catch (err) {
    console.error("prices: unexpected error", err);
    res.status(500).json({ error: "Unexpected error" });
  }
};
