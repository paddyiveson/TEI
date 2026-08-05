/**
 * Local-only admin script to create invite-only Client Hub accounts.
 *
 * With a .env file in the project root:
 *   npm run create-user -- user@example.com 'SecurePassword123'
 *   npm run create-user -- user@example.com 'SecurePassword123' --role=adviser
 *   npm run create-user -- user@example.com 'SecurePassword123' --client-id=<wealth_os.clients.id>
 *   npm run create-user -- user@example.com --reset-link
 *
 * Or pass env vars inline:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-user.mjs ...
 *
 * Creating an account also provisions the wealth_os.profiles row that the
 * dashboard requires to load (its absence is what produces "No profile
 * found for your account" on an otherwise-successful login). Pass
 * --client-id to link this login to a wealth_os.clients row the adviser
 * already created via the onboarding wizard (its user_id starts out null
 * until the client is invited to sign in).
 *
 * Never commit or deploy SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

function loadDotEnv() {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

// Split "--flag" / "--flag=value" options from positional args (email, password).
const flags = {};
const positional = [];
for (const arg of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
  if (m) flags[m[1]] = m[2] !== undefined ? m[2] : true;
  else positional.push(arg);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = positional[0];
const password = positional[1];
const resetLinkOnly = Boolean(flags["reset-link"]);
const profileRole = typeof flags.role === "string" ? flags.role : "client";
const clientId = typeof flags["client-id"] === "string" ? flags["client-id"] : null;
const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const resetRedirect = siteUrl + "/hub/reset-password.html";

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

if (!email || (!resetLinkOnly && !password)) {
  console.error("Usage:");
  console.error("  node scripts/create-user.mjs <email> <password> [--role=client|adviser] [--client-id=<uuid>]");
  console.error("  node scripts/create-user.mjs <email> --reset-link");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (resetLinkOnly) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: resetRedirect },
  });

  if (error) {
    console.error("Failed to generate reset link:", error.message);
    process.exit(1);
  }

  console.log("Open this link in a browser to set a password (single use):");
  console.log(data.properties.action_link);
  process.exit(0);
}

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error) {
  console.error("Failed to create user:", error.message);
  process.exit(1);
}

console.log("Created user:", data.user.id, data.user.email);

// Provision the wealth_os.profiles row the dashboard requires to load.
// Without this, login succeeds but the client hits "No profile found for
// your account" — this is the step that was previously done by hand (or
// skipped) and is what this script now guarantees happens every time.
const { error: profileError } = await supabase
  .schema("wealth_os")
  .from("profiles")
  .upsert({ user_id: data.user.id, role: profileRole }, { onConflict: "user_id" });

if (profileError) {
  console.error("User created, but failed to provision wealth_os.profiles:", profileError.message);
  console.error(
    `Fix manually: insert into wealth_os.profiles (user_id, role) values ('${data.user.id}', '${profileRole}');`
  );
} else {
  console.log(`Provisioned wealth_os.profiles (role: ${profileRole}).`);
}

if (clientId) {
  const { data: linked, error: linkError } = await supabase
    .schema("wealth_os")
    .from("clients")
    .update({ user_id: data.user.id })
    .eq("id", clientId)
    .is("user_id", null)
    .select("id");

  if (linkError) {
    console.error("Failed to link wealth_os.clients row:", linkError.message);
  } else if (!linked || linked.length === 0) {
    console.error(
      `wealth_os.clients row ${clientId} was not linked — check the id is right and its user_id is currently null (a client row can't be linked twice).`
    );
  } else {
    console.log(`Linked wealth_os.clients row ${clientId} to this account.`);
  }
} else if (profileRole === "client") {
  console.log(
    'No --client-id given — link (or create) this client\'s wealth_os.clients row next, or they\'ll hit "No client record is linked to your account yet."'
  );
}

console.log("They can sign in at", siteUrl + "/hub/login.html");
