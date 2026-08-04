/**
 * Local-only admin script to create invite-only Client Hub accounts.
 *
 * With a .env file in the project root:
 *   npm run create-user -- user@example.com 'SecurePassword123'
 *   npm run create-user -- user@example.com --reset-link
 *
 * Or pass env vars inline:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-user.mjs ...
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

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const passwordOrFlag = process.argv[3];
const resetLinkOnly = passwordOrFlag === "--reset-link";
const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const resetRedirect = siteUrl + "/hub/reset-password.html";

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

if (!email || !passwordOrFlag) {
  console.error("Usage:");
  console.error("  node scripts/create-user.mjs <email> <password>");
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
  password: passwordOrFlag,
  email_confirm: true,
});

if (error) {
  console.error("Failed to create user:", error.message);
  process.exit(1);
}

console.log("Created user:", data.user.id, data.user.email);
console.log("They can sign in at", siteUrl + "/hub/login.html");
