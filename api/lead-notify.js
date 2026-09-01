// Vercel serverless function: emails an alert whenever a visitor is
// captured through a gated tool (Cost of Waiting Calculator, Property
// Calculator, Newsletter, Coaching Enquiry, etc -- all writing into the
// shared public.leads table via the source field).
//
// Triggered by a Postgres trigger on INSERT into public.leads
// (public.notify_lead_insert(), Supabase project ztyqijiiayrengvxsqkw).
// The webhook secret is stored in Supabase Vault, not hardcoded in SQL,
// unlike the existing feedback-notify trigger. Supabase POSTs a payload
// shaped like:
//   { type: 'INSERT', table: 'leads', schema: 'public', record: {...} }
//
// Deliberately stateless, same convention as feedback-notify.js -- no
// Supabase client, no service-role key. Everything needed for the alert
// email is already on the webhook payload's `record`.
//
// Required env vars (set in Vercel project settings):
//   RESEND_API_KEY       - reuse the same Resend API key as feedback-notify
//   LEAD_ALERT_TO         - inbox to notify, e.g. paddyiveson@gmail.com
//   LEAD_ALERT_FROM        - verified Resend sender (can reuse FEEDBACK_ALERT_FROM's value)
//   LEAD_WEBHOOK_SECRET     - must exactly match the value stored in Supabase
//                             Vault under the name 'lead_webhook_secret'
//   SITE_URL                - e.g. https://your-site.vercel.app (optional, for a link back)
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const expectedSecret = process.env.LEAD_WEBHOOK_SECRET;
  const providedSecret = req.headers["x-lead-webhook-secret"];
  if (!expectedSecret || providedSecret !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = req.body || {};
  const record = body.record || {};
  if (!record.contact_value) {
    res.status(200).json({ skipped: true });
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_ALERT_TO;
  const from = process.env.LEAD_ALERT_FROM;
  if (!apiKey || !to || !from) {
    console.error("lead-notify: missing RESEND_API_KEY/LEAD_ALERT_TO/LEAD_ALERT_FROM env var");
    res.status(500).json({ error: "Email not configured" });
    return;
  }
  const method = record.contact_method || "unknown";
  const value = String(record.contact_value).slice(0, 200);
  const source = record.source || "unknown source";
  const name = record.name ? ` from ${record.name}` : "";

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `New lead (${source}): ${method}`,
        text:
          `New lead captured${name} via ${source}:\n\n` +
          `${method}: ${value}\n`,
      }),
    });
    if (!emailRes.ok) {
      const detail = await emailRes.text().catch(() => "");
      console.error("lead-notify: Resend API error", emailRes.status, detail);
      res.status(502).json({ error: "Failed to send alert email" });
      return;
    }
    res.status(200).json({ sent: true });
  } catch (err) {
    console.error("lead-notify: unexpected error", err);
    res.status(500).json({ error: "Unexpected error" });
  }
};
