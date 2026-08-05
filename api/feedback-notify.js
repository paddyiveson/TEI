// Vercel serverless function: emails an alert whenever a client submits
// feedback through the Wealth OS feedback widget (hub/wealth-os.html).
//
// Triggered by a Supabase Database Webhook (configured manually in the
// Supabase dashboard -- same "manual dashboard config" convention already
// used for auth providers/redirect URLs, see supabase/migrations/
// 001_education_progress.sql's header comments) on INSERT into
// wealth_os.feedback. Supabase POSTs a payload shaped like:
//   { type: 'INSERT', table: 'feedback', schema: 'wealth_os', record: {...} }
//
// Deliberately stateless -- no Supabase client, no service-role key (per
// .env.example: "never deploy the service role key to Vercel"). Everything
// needed for the alert email is already on the webhook payload's `record`;
// this does not look up the client's name, so the email links back to the
// adviser's feedback inbox rather than trying to resemble a full report.
//
// Required env vars (set in Vercel project settings):
//   RESEND_API_KEY          - Resend API key used to send the alert email
//   FEEDBACK_ALERT_TO       - inbox to notify, e.g. paddyiveson@gmail.com
//   FEEDBACK_ALERT_FROM     - verified Resend sender, e.g. "Wealth OS <alerts@yourdomain>"
//   FEEDBACK_WEBHOOK_SECRET - shared secret the Supabase webhook must send back
//   SITE_URL                - e.g. https://your-site.vercel.app, used to link into the inbox

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expectedSecret = process.env.FEEDBACK_WEBHOOK_SECRET;
  const providedSecret = req.headers["x-feedback-webhook-secret"];
  if (!expectedSecret || providedSecret !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body || {};
  const record = body.record || {};
  if (!record.message) {
    // Not an insert we care about (e.g. a DELETE webhook, or a malformed
    // payload) -- ack without sending anything so Supabase doesn't retry.
    res.status(200).json({ skipped: true });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_ALERT_TO;
  const from = process.env.FEEDBACK_ALERT_FROM;
  if (!apiKey || !to || !from) {
    console.error("feedback-notify: missing RESEND_API_KEY/FEEDBACK_ALERT_TO/FEEDBACK_ALERT_FROM env var");
    res.status(500).json({ error: "Email not configured" });
    return;
  }

  const siteUrl = process.env.SITE_URL || "";
  const area = record.area || "general";
  const page = record.page_context ? ` (on ${record.page_context})` : "";
  const message = String(record.message).slice(0, 2000);

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
        subject: `Wealth OS feedback: ${area}${page}`,
        text:
          `New client feedback (${area}${page}):\n\n${message}\n\n` +
          (siteUrl ? `Open the inbox: ${siteUrl}/hub/wealth-os.html\n` : ""),
      }),
    });
    if (!emailRes.ok) {
      const detail = await emailRes.text().catch(() => "");
      console.error("feedback-notify: Resend API error", emailRes.status, detail);
      res.status(502).json({ error: "Failed to send alert email" });
      return;
    }
    res.status(200).json({ sent: true });
  } catch (err) {
    console.error("feedback-notify: unexpected error", err);
    res.status(500).json({ error: "Unexpected error" });
  }
};
