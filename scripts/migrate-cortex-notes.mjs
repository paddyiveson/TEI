// One-off migration: parses the 12 target TEI Research notes out of
// hub/suite.html's embedded `notes` object and upserts them into
// cortex.investments. Mirrors scripts/create-user.mjs's conventions
// (dotenv, service-role client, no new npm dependency).
//
// Usage: node scripts/migrate-cortex-notes.mjs
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
// (see .env.example).
//
// Idempotent: selects on (adviser_id, ticker) before writing, since
// cortex.investments has no unique constraint to upsert against directly.
// Safe to re-run after adjusting the heuristic below -- it will update the
// same 12 rows in place rather than duplicating them.
//
// IMPORTANT: this script's own extraction/mapping logic (steps 1-3 below)
// was authored to match the exact heuristic already run once by hand for
// the initial population of these 12 rows (2026-08-09) -- if you change the
// heuristic here, the live rows won't reflect it until you re-run this
// script.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Target notes: object-key -> { ticker, companyName, navGroup }. jepq/xsop
// (ETF notes) are deliberately excluded -- not in the requested 12.
// ccxi/krkn/iqe's real tickers (AGLT/KRKNF/IQE.L) differ from their object
// keys -- confirmed against noteNames in suite.html, not assumed.
const TARGETS = {
  onds: { ticker: "ONDS", companyName: "Ondas Holdings", navGroup: "growth" },
  nbis: { ticker: "NBIS", companyName: "Nebius Group", navGroup: "growth" },
  asts: { ticker: "ASTS", companyName: "AST SpaceMobile", navGroup: "growth" },
  zeta: { ticker: "ZETA", companyName: "Zeta Global", navGroup: "growth" },
  sive: { ticker: "SIVE", companyName: "Sivers Semiconductors", navGroup: "growth" },
  krkn: { ticker: "KRKNF", companyName: "Kraken Robotics", navGroup: "growth" },
  tem: { ticker: "TEM", companyName: "Tempus AI", navGroup: "growth" },
  iqe: { ticker: "IQE.L", companyName: "IQE plc", navGroup: "growth" },
  sofi: { ticker: "SOFI", companyName: "SoFi Technologies", navGroup: "top" },
  ccxi: { ticker: "AGLT", companyName: "Agility Robotics", navGroup: "top" },
  pltr: { ticker: "PLTR", companyName: "Palantir Technologies", navGroup: "top" },
  lpkf: { ticker: "LPKF", companyName: "LPKF Laser & Electronics", navGroup: "watchlist" },
};

// nav group -> lifecycle_status/sub_status/theme defaults. Best-guess, not
// asserted as fact -- every migrated row's conviction_reason carries a
// visible marker so these are trivially bulk-reviewable on the Pipeline
// board afterward.
const GROUP_DEFAULTS = {
  watchlist: { lifecycle_status: "watch", sub_status: null, theme: "Watchlist" },
  top: { lifecycle_status: "held", sub_status: "monitor", theme: "Top Ideas" },
  growth: { lifecycle_status: "research", sub_status: null, theme: "Growth" },
};

// investment_role can't be reliably inferred from prose -- uniform default,
// flagged in the same marker as the lifecycle_status guess.
const DEFAULT_INVESTMENT_ROLE = "growth_opportunity";

function decodeEntities(html) {
  return html
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "—")
    .replace(/&middot;/g, "·")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

/** Splits a note's HTML into an ordered list of {heading, body} sections. */
function extractSections(html) {
  const stripped = decodeEntities(html);
  const headingRe = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gis;
  const matches = [...stripped.matchAll(headingRe)];
  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][1].replace(/<[^>]+>/g, "").trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : stripped.length;
    const body = stripped
      .slice(start, end)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    sections.push({ heading, body });
  }
  return sections;
}

/**
 * Field-mapping heuristic, applied in document order. See the header
 * comment: this must stay in sync with the manual mapping already applied
 * to the live rows (2026-08-09) if you edit it.
 */
function mapSectionsToFields(sections) {
  const fields = {
    story_opportunity: [],
    story_why_exists: [],
    story_long_term_case: [],
    story_assumptions: null, // no note has a distinct assumptions section
    story_what_could_be_wrong: [],
    quality_management: null, // no section reliably maps to this
    quality_business: [],
    quality_competitive_advantage: [],
    quality_financial_strength: null, // no section reliably maps to this
    trigger_conditions: [],
  };

  let assignedOpener = false;
  for (const { heading, body } of sections) {
    if (!assignedOpener && /^start here/i.test(heading)) {
      fields.story_why_exists.push(body);
      assignedOpener = true;
      continue;
    }
    if (/opportunity|market cap|thesis|why.*matters|bull case/i.test(heading)) {
      fields.story_opportunity.push(body);
    } else if (/financ|catalyst|trajectory|revenue|near-term/i.test(heading)) {
      fields.story_long_term_case.push(body);
    } else if (/vs\.|versus| vs |compet|semicap|comparison/i.test(heading)) {
      fields.quality_competitive_advantage.push(body);
    } else if (/moat|business model|segments|company today|what (is|does)/i.test(heading)) {
      fields.quality_business.push(body);
    } else if (/watchlist verdict|what would change|trigger/i.test(heading)) {
      fields.trigger_conditions.push(body);
    } else if (/^risk/i.test(heading)) {
      fields.story_what_could_be_wrong.push(body);
    } else if (/bottom line/i.test(heading)) {
      fields.story_long_term_case.push("Bottom line: " + body);
    } else if (!assignedOpener) {
      fields.story_why_exists.push(body);
      assignedOpener = true;
    } else {
      // Nothing dropped silently -- provenance kept as the original heading.
      fields.story_long_term_case.push(`[${heading}] ${body}`);
    }
  }

  const join = (arr) => (arr.length ? arr.join(" ") : null);
  return {
    story_opportunity: join(fields.story_opportunity),
    story_why_exists: join(fields.story_why_exists),
    story_long_term_case: join(fields.story_long_term_case),
    story_assumptions: fields.story_assumptions,
    story_what_could_be_wrong: join(fields.story_what_could_be_wrong),
    quality_management: fields.quality_management,
    quality_business: join(fields.quality_business),
    quality_competitive_advantage: join(fields.quality_competitive_advantage),
    quality_financial_strength: fields.quality_financial_strength,
    trigger_conditions: join(fields.trigger_conditions),
  };
}

async function main() {
  const suiteHtmlPath = join(REPO_ROOT, "hub", "suite.html");
  const suiteHtml = readFileSync(suiteHtmlPath, "utf8");

  // Extract just the `notes` object literal's string values by key, via a
  // scoped Function eval -- safe here because suite.html is this repo's own
  // trusted source, not third-party input. Avoids a hand-rolled JS-string
  // parser for a well-formed object literal of string constants.
  const notesMatch = suiteHtml.match(/var\s+notes\s*=\s*(\{[\s\S]*?\n\s*\});/);
  if (!notesMatch) {
    console.error("Could not locate `var notes = {...}` in hub/suite.html.");
    process.exit(1);
  }
  const notes = new Function(`return (${notesMatch[1]});`)();

  const { data: adviser, error: adviserErr } = await supabase
    .schema("cortex")
    .from("advisers")
    .select("id")
    .limit(1)
    .single();
  if (adviserErr) {
    console.error("Could not resolve adviser id:", adviserErr.message);
    process.exit(1);
  }
  const adviserId = adviser.id;

  for (const [key, meta] of Object.entries(TARGETS)) {
    const html = notes[key];
    if (!html) {
      console.warn(`No note found for key "${key}" (${meta.ticker}) -- skipped.`);
      continue;
    }
    const sections = extractSections(html);
    const mapped = mapSectionsToFields(sections);
    const groupDefaults = GROUP_DEFAULTS[meta.navGroup];

    const row = {
      adviser_id: adviserId,
      ticker: meta.ticker,
      company_name: meta.companyName,
      sector: null,
      industry: null,
      theme: groupDefaults.theme,
      investment_role: DEFAULT_INVESTMENT_ROLE,
      lifecycle_status: groupDefaults.lifecycle_status,
      sub_status: groupDefaults.sub_status,
      ...mapped,
      conviction_reason: `[migrated from suite.html, nav group: ${meta.navGroup} — confirm lifecycle_status, investment_role]`,
    };

    const { data: existing, error: selErr } = await supabase
      .schema("cortex")
      .from("investments")
      .select("id")
      .eq("adviser_id", adviserId)
      .eq("ticker", meta.ticker)
      .maybeSingle();
    if (selErr) {
      console.error(`Lookup failed for ${meta.ticker}:`, selErr.message);
      continue;
    }

    if (existing) {
      const { error: updErr } = await supabase
        .schema("cortex")
        .from("investments")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updErr) console.error(`Update failed for ${meta.ticker}:`, updErr.message);
      else console.log(`updated  ${meta.ticker}`);
    } else {
      const { error: insErr } = await supabase.schema("cortex").from("investments").insert(row);
      if (insErr) console.error(`Insert failed for ${meta.ticker}:`, insErr.message);
      else console.log(`created  ${meta.ticker}`);
    }
  }

  console.log(
    "\nDone. TSLA and any note outside the 12 targets above were not migrated " +
      "(no source note exists for TSLA in hub/suite.html). Review lifecycle_status, " +
      "investment_role, and the two always-blank quality fields " +
      "(quality_management, quality_financial_strength) via the Pipeline board -- " +
      "every migrated row's conviction_reason carries a [migrated from suite.html...] " +
      "marker to make this easy to find and clear."
  );
}

main();
