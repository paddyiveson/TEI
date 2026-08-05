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
//   { prices: { AAPL: 123.45, ... }, errors: { BADSYM: "message from Twelve Data" } }
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
      res.status(502).json({ error: "Price feed unavailable" });
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

    res.status(200).json({ prices, errors });
  } catch (err) {
    console.error("prices: unexpected error", err);
    res.status(500).json({ error: "Unexpected error" });
  }
};
