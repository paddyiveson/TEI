/**
 * Vercel build step: writes hub/js/supabase-config.js from env vars.
 * Requires SUPABASE_URL and SUPABASE_ANON_KEY in the build environment.
 */
const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn(
    "generate-config: SUPABASE_URL or SUPABASE_ANON_KEY missing — writing placeholder config (local dev only)."
  );
}

const outDir = path.join(__dirname, "..", "hub", "js");
const outFile = path.join(outDir, "supabase-config.js");

fs.mkdirSync(outDir, { recursive: true });

const contents = `// Generated at build time — do not commit (see supabase-config.example.js)
window.TEI_SUPABASE_URL = ${JSON.stringify(url || "")};
window.TEI_SUPABASE_ANON_KEY = ${JSON.stringify(key || "")};
`;

fs.writeFileSync(outFile, contents, "utf8");
console.log("Wrote", outFile);
