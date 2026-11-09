// Supabase Edge Function: Cal.com booking webhook -> wealth_os.sessions.
//
// Cal.com (Settings > Developer > Webhooks) sends BOOKING_CREATED,
// BOOKING_RESCHEDULED and BOOKING_CANCELLED here. Each request is signed:
// X-Cal-Signature-256 is the HMAC-SHA256 (hex) of the raw body with the
// webhook's secret, which is also saved as the CAL_WEBHOOK_SECRET secret on
// this project. Unsigned or wrongly signed requests are refused.
//
// The attendee's email is matched to wealth_os.clients.email (case
// insensitive). A booking that matches no client is still kept, with no
// client, so a coach can see it. A reschedule books the new time and marks
// the old booking cancelled. Deployed with verify_jwt off (Cal.com sends no
// Supabase token); the signature is the check.
//
// Secrets: CAL_WEBHOOK_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are provided by the runtime.

import { createClient } from "jsr:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("CAL_WEBHOOK_SECRET");
  if (!secret) return json({ error: "CAL_WEBHOOK_SECRET not set" }, 500);

  const raw = await req.text();
  const given = (req.headers.get("x-cal-signature-256") || "").trim().toLowerCase();
  if (!given || !sameHex(given, await hmacHex(secret, raw))) return json({ error: "Bad signature" }, 401);

  let event: any;
  try { event = JSON.parse(raw); } catch { return json({ error: "Bad JSON" }, 400); }
  const trigger = String(event.triggerEvent || "");
  const p = event.payload || {};
  if (trigger === "PING" || !p.uid) return json({ ok: true, ignored: trigger || "no booking" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "wealth_os" }, auth: { persistSession: false },
  });

  const email = String(((p.attendees || [])[0] || {}).email || "").trim().toLowerCase();
  let clientId: string | null = null;
  if (email) {
    const { data } = await db.from("clients").select("id").ilike("email", email).limit(1);
    clientId = data && data[0] ? data[0].id : null;
  }

  const cancelled = trigger === "BOOKING_CANCELLED" || String(p.status || "").toUpperCase() === "CANCELLED";
  const row = {
    cal_uid: String(p.uid), client_id: clientId, attendee_email: email || null, title: p.title || null,
    start_at: p.startTime, end_at: p.endTime || null, status: cancelled ? "cancelled" : "booked",
    updated_at: new Date().toISOString(),
  };
  if (!row.start_at) return json({ error: "No start time" }, 400);
  const { error } = await db.from("sessions").upsert(row, { onConflict: "cal_uid" });
  if (error) { console.error("cal-booking-webhook:", error.message); return json({ error: error.message }, 500); }

  // A reschedule replaces an earlier booking.
  const old = p.rescheduleUid || p.fromReschedule || (p.rescheduledFromUid);
  if (trigger === "BOOKING_RESCHEDULED" && old && String(old) !== row.cal_uid) {
    await db.from("sessions").update({ status: "cancelled", updated_at: row.updated_at }).eq("cal_uid", String(old));
  }
  return json({ ok: true, trigger, matched: !!clientId });
});
