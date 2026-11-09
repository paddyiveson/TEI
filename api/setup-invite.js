// Vercel serverless function: emails a client "A few things to finish your
// Wealth OS" when the coach sends a setup request (redesign spec B13.4,
// B13.5). Called by the Setup tab in the adviser workspace
// (hub/js/wealth-setup.js) after it has saved clients.setup_request.
//
// Auth: Authorization: Bearer <the coach's Supabase access token>. The token
// is checked against Supabase's own /auth/v1/user, then the caller's role is
// read from wealth_os.profiles and the client's email from wealth_os.clients,
// both through PostgREST with the caller's own token, so RLS decides what
// they can see. No service-role key (see .env.example).
//
// Body: { "clientId": "<uuid>" }
//
// Required env vars (Vercel project settings):
//   SUPABASE_URL, SUPABASE_ANON_KEY - same project as hub/js/supabase-config.js
//   RESEND_API_KEY                  - Resend API key (as api/feedback-notify.js)
//   SETUP_INVITE_FROM               - verified sender, e.g. "Paddy at TEI <hello@yourdomain>";
//                                     falls back to FEEDBACK_ALERT_FROM
//   SITE_URL                        - e.g. https://www.theeverydayinvestor.uk

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function getUser(url, anonKey, token) {
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } });
  return res.ok ? res.json() : null;
}

async function selectOne(url, anonKey, token, table, query) {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Accept-Profile": "wealth_os", Accept: "application/json" },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SETUP_INVITE_FROM || process.env.FEEDBACK_ALERT_FROM;
  const siteUrl = process.env.SITE_URL || "";
  if (!url || !anonKey || !apiKey || !from) {
    console.error("setup-invite: missing SUPABASE_URL/SUPABASE_ANON_KEY/RESEND_API_KEY/SETUP_INVITE_FROM");
    res.status(500).json({ error: "Email not configured" });
    return;
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const user = token ? await getUser(url, anonKey, token).catch(() => null) : null;
  if (!user || !user.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const profile = await selectOne(url, anonKey, token, "profiles", `select=role&user_id=eq.${encodeURIComponent(user.id)}`).catch(() => null);
  if (!profile || profile.role !== "adviser") {
    res.status(403).json({ error: "Coach only" });
    return;
  }

  const clientId = String((req.body && req.body.clientId) || "");
  if (!UUID_RE.test(clientId)) {
    res.status(400).json({ error: "Bad client id" });
    return;
  }
  const client = await selectOne(url, anonKey, token, "clients", `select=first_name,email,setup_request&id=eq.${clientId}`).catch(() => null);
  if (!client || !client.email) {
    res.status(404).json({ error: "No email on this client" });
    return;
  }

  const left = client.setup_request && client.setup_request.left;
  const minutes = Math.max(5, Math.round((Number(left) || 0) * 0.8 + 4));
  const link = `${siteUrl}/hub/login.html?redirect=${encodeURIComponent("/hub/wealth-os.html?page=setup")}`;
  const hello = client.first_name ? `Hi ${client.first_name},` : "Hi,";
  const text =
    `${hello}\n\n` +
    `Thanks for your fact find session. We have filled in most of your Wealth OS. ` +
    `There are a few things left, about ${minutes} minutes. Sign in to finish:\n\n${link}\n\n` +
    `You can skip anything you do not know, and change any of it later in Settings.\n\n` +
    `The Everyday Investor provides financial coaching and education, not regulated financial advice.`;

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: client.email, subject: "A few things to finish your Wealth OS", text }),
    });
    if (!emailRes.ok) {
      console.error("setup-invite: Resend API error", emailRes.status, await emailRes.text().catch(() => ""));
      res.status(502).json({ error: "Failed to send" });
      return;
    }
    res.status(200).json({ sent: true });
  } catch (err) {
    console.error("setup-invite: send failed", err);
    res.status(502).json({ error: "Failed to send" });
  }
};
