/**
 * Local-only admin script: imports a filled-in Wealth OS Client Data Intake
 * workbook (see "Wealth OS/Wealth_OS_Client_Intake_v2.xlsx") straight into
 * Supabase, matching the exact table/column shapes hub/wealth-os.html's own
 * save functions use (accountToRow, holdingToRow, goalToRow, incomeToRow,
 * wealthAssetToRow, wealthLiabilityToRow, dividendHoldingToRow,
 * cashflowSettingsToRow, clientPersonalToRow) -- this is the deterministic
 * script the workbook's "Read Me First" tab has promised since it was built.
 *
 * Usage (with a .env file in the project root, same as create-user.mjs):
 *   npm run import-intake -- "path/to/intake.xlsx" --client-id=<uuid>
 *   npm run import-intake -- "path/to/intake.xlsx" --create-client
 *   npm run import-intake -- "path/to/intake.xlsx" --client-id=<uuid> --dry-run
 *
 * Or pass env vars inline:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-intake.mjs ...
 *
 * --client-id=<uuid>   Import into an existing wealth_os.clients row (the
 *                       normal case -- create the client in-app first per
 *                       the usual SOP, then bulk-load their intake sheet).
 * --create-client       Insert a brand-new clients row from the Personal tab
 *                       instead. Prints the new client id -- pass that to
 *                       scripts/create-user.mjs --client-id next to link a
 *                       login.
 * --dry-run              Validate and print exactly what would be written,
 *                       touching nothing in Supabase. Always run this first.
 *
 * INSERT-ONLY, NOT A SYNC: every run creates new rows. Re-running against a
 * client that already has accounts/goals/etc. from a previous import will
 * duplicate them -- this script has no way to tell "this row already
 * exists" apart from "this is new data" (holdings/goals/etc. have no
 * natural key to diff against). Clean up first, or only run once per
 * client, until a proper upsert pass gets built.
 *
 * Insurance is deliberately skipped -- the intake tab itself flags that
 * table's shape as provisional (see Insurance tab's row-2 note). Rows are
 * counted and reported, never written.
 *
 * Never commit or deploy SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadDotEnv();

// ---------------- CLI args ----------------
const flags = {};
const positional = [];
for (const arg of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
  if (m) flags[m[1]] = m[2] !== undefined ? m[2] : true;
  else positional.push(arg);
}
const filePath = positional[0];
const dryRun = Boolean(flags["dry-run"]);
const createClientFlag = Boolean(flags["create-client"]);
const existingClientId = typeof flags["client-id"] === "string" ? flags["client-id"] : null;

if (!filePath) {
  console.error("Usage: node scripts/import-intake.mjs <path-to-xlsx> --client-id=<uuid> [--dry-run]");
  console.error("       node scripts/import-intake.mjs <path-to-xlsx> --create-client [--dry-run]");
  process.exit(1);
}
if (!existingClientId && !createClientFlag) {
  console.error("Pass either --client-id=<uuid> (import into an existing client) or --create-client (make a new one).");
  process.exit(1);
}
if (!existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !serviceKey)) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (not needed for --dry-run).");
  process.exit(1);
}

// ---------------- workbook helpers ----------------
const wb = XLSX.readFile(filePath, { cellDates: false });

function sheet(name) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Missing expected tab "${name}" -- is this the right workbook / an older version?`);
  return ws;
}
/* Every data sheet has Title (row1) / instructions (row2) / headers (row3)
   then data from row4 -- {header:1, range:3} gives an array of arrays
   starting at row4 (0-based range arg = skip first 3 rows), one inner array
   per row, cell values in column order. Blank cells come back as undefined. */
function dataRows(sheetName) {
  const rows = XLSX.utils.sheet_to_json(sheet(sheetName), { header: 1, range: 3, blankrows: false });
  return rows.filter((r) => r.some((v) => v !== undefined && v !== null && String(v).trim() !== ""));
}
const s = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const n = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : Number(v));

// Mirrors hub/wealth-os.html's acctLabel() exactly -- this is what Holdings /
// Historic Account Values / Goals dropdowns actually store, so it's what we
// match against, not the sheet's own cached formula text (belt and braces
// against a workbook that was ever set to manual calculation).
function acctLabel(type, provider) {
  if (!type) return null;
  return provider ? `${provider} ${type.toUpperCase()}` : type.toUpperCase();
}
// Mirrors Goals' Income-tab dropdown source (Income column E's formula).
function incomeLabel(owner, type) {
  if (!owner) return null;
  return type ? `${owner} / ${type}` : owner;
}

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ---------------- Personal ----------------
const personalRow = dataRows("Personal")[0] || [];
const personal = {
  firstName: s(personalRow[0]),
  lastName: s(personalRow[1]),
  dob: s(personalRow[2]),
  email: s(personalRow[3]),
  employmentStatus: s(personalRow[4]),
  relationshipStatus: s(personalRow[5]),
  riskProfile: s(personalRow[6]),
  notes: s(personalRow[7]),
  partnerName: s(personalRow[8]),
  partnerEmploymentStatus: s(personalRow[9]),
};
if (createClientFlag && (!personal.firstName || !personal.lastName)) {
  err("Personal tab: First name and Last name are required to --create-client.");
}

// ---------------- Accounts ----------------
const accountRows = dataRows("Accounts").map((r, i) => ({
  rowNum: i + 4,
  type: s(r[1]),
  provider: s(r[2]),
  value: n(r[3]),
  contribution: n(r[4]),
  contributionPersonal: n(r[5]),
  contributionSacrifice: n(r[6]),
  returnPct: n(r[7]),
  cashBalance: n(r[8]),
  openingContributions: n(r[9]),
}));
const accountsByLabel = new Map(); // label -> row (post-validation, pre-insert)
for (const a of accountRows) {
  if (!a.type) { err(`Accounts row ${a.rowNum}: missing Type.`); continue; }
  if (a.value === null) { err(`Accounts row ${a.rowNum}: missing Current value.`); continue; }
  const label = acctLabel(a.type, a.provider);
  if (accountsByLabel.has(label)) {
    err(`Accounts row ${a.rowNum}: "${label}" duplicates another account with the same Type + Provider -- ` +
        `Holdings/Historic/Goals can't tell them apart. Make the Provider slightly distinct (e.g. add "(mine)"/"(partner's)").`);
    continue;
  }
  a.label = label;
  accountsByLabel.set(label, a);
}

// ---------------- Historic Account Values ----------------
const historyRows = dataRows("Historic Account Values").map((r, i) => ({
  rowNum: i + 4, accountLabel: s(r[0]), monthKey: s(r[1]), value: n(r[2]),
}));
for (const h of historyRows) {
  if (!h.accountLabel || !accountsByLabel.has(h.accountLabel)) {
    err(`Historic Account Values row ${h.rowNum}: Account "${h.accountLabel}" doesn't match any row on the Accounts tab.`);
  }
  if (h.monthKey && !/^\d{4}-\d{2}$/.test(h.monthKey)) warn(`Historic Account Values row ${h.rowNum}: Month "${h.monthKey}" isn't YYYY-MM.`);
  if (h.value === null) err(`Historic Account Values row ${h.rowNum}: missing Balance.`);
}

// ---------------- Holdings ----------------
const holdingRows = dataRows("Holdings").map((r, i) => ({
  rowNum: i + 4, accountLabel: s(r[0]), name: s(r[1]), ticker: s(r[2]),
  value: n(r[3]), costBasis: n(r[4]), sector: s(r[5]), units: n(r[6]), avgOpen: n(r[7]),
}));
for (const h of holdingRows) {
  if (!h.accountLabel || !accountsByLabel.has(h.accountLabel)) {
    err(`Holdings row ${h.rowNum}: Account "${h.accountLabel}" doesn't match any row on the Accounts tab.`);
  }
  if (!h.name) err(`Holdings row ${h.rowNum}: missing Holding name.`);
  // Same fallbacks as the app's addHolding()/updateHolding() forms.
  if (h.value === null && h.units !== null && h.avgOpen !== null) h.value = h.units * h.avgOpen;
  if (h.value === null && h.ticker && h.units !== null) h.value = 0; // left for a live-price refresh
  if (h.value === null) err(`Holdings row ${h.rowNum}: give a Value, Units + Avg open price, or a Ticker + Units to live-price later.`);
  // Cost basis: ticker'd holdings never get one at import (always
  // avgOpen*units*fxRate via a live refresh, same rule the app's own form
  // follows) -- tickerless holdings use the typed value, or derive it.
  if (h.ticker) {
    h.costBasis = null;
  } else if (h.costBasis === null && h.units !== null && h.avgOpen !== null) {
    h.costBasis = h.units * h.avgOpen;
  }
}

// ---------------- Goals ----------------
const goalRows = dataRows("Goals").map((r, i) => ({
  rowNum: i + 4, type: s(r[0]), name: s(r[1]), targetDate: s(r[2]), progressType: s(r[3]),
  targetAmount: n(r[4]), targetIncome: n(r[5]),
  linkedAccounts: [s(r[6]), s(r[7]), s(r[8]), s(r[9])].filter(Boolean),
  status: s(r[10]) || "active", linkedIncomeLabel: s(r[11]),
}));

// ---------------- Income ----------------
const incomeRows = dataRows("Income").map((r, i) => ({
  rowNum: i + 4, owner: s(r[0]), type: s(r[1]), amount: n(r[2]), frequency: s(r[3]),
}));
const incomeByLabel = new Map();
for (const inc of incomeRows) {
  if (!inc.owner) { err(`Income row ${inc.rowNum}: missing Whose income.`); continue; }
  if (!inc.type) { err(`Income row ${inc.rowNum}: missing Type.`); continue; }
  if (inc.amount === null) { err(`Income row ${inc.rowNum}: missing Amount.`); continue; }
  const label = incomeLabel(inc.owner, inc.type);
  inc.label = label;
  // two income rows CAN legitimately share a label (e.g. two "client /
  // Other" rows) -- last one wins for Goals' lookup, which only matters if
  // a Build a Business goal's dropdown pick happens to be ambiguous too.
  incomeByLabel.set(label, inc);
}

for (const g of goalRows) {
  if (!g.type) err(`Goals row ${g.rowNum}: missing Goal type.`);
  if (!g.name) err(`Goals row ${g.rowNum}: missing Goal name.`);
  if (!g.progressType) err(`Goals row ${g.rowNum}: missing Track progress by.`);
  for (const accLabel of g.linkedAccounts) {
    if (!accountsByLabel.has(accLabel)) err(`Goals row ${g.rowNum}: linked account "${accLabel}" doesn't match any row on the Accounts tab.`);
  }
  if (g.linkedIncomeLabel && !incomeByLabel.has(g.linkedIncomeLabel)) {
    err(`Goals row ${g.rowNum}: linked income "${g.linkedIncomeLabel}" doesn't match any row on the Income tab.`);
  }
  if (g.type === "Build a Business" && !g.linkedIncomeLabel) {
    warn(`Goals row ${g.rowNum} ("${g.name}"): Build a Business goal has no Linked income source -- it'll fall back to tracking total household income instead of the one business, same as the app does.`);
  }
}

// ---------------- Expenses ----------------
const expenseRows = dataRows("Expenses").map((r, i) => ({ rowNum: i + 4, kind: s(r[0]), label: s(r[1]), amount: n(r[2]) }));
for (const e of expenseRows) {
  if (!e.kind || !e.label || e.amount === null) err(`Expenses row ${e.rowNum}: needs Kind, Label and Amount all filled in.`);
}

// ---------------- Savings & Emergency Fund + Preferences (-> cashflow_settings) ----------------
const savingsRow = dataRows("Savings & Emergency Fund")[0] || [];
const prefsRow = dataRows("Preferences")[0] || [];
const cashflowSettings = {};
if (savingsRow[0] !== undefined) cashflowSettings.monthly_savings = n(savingsRow[0]);
if (savingsRow[1] !== undefined) cashflowSettings.monthly_investing = n(savingsRow[1]);
if (savingsRow[2] !== undefined) cashflowSettings.emergency_fund_target = n(savingsRow[2]);
if (savingsRow[3] !== undefined) cashflowSettings.emergency_fund_current = n(savingsRow[3]);
if (prefsRow[0] !== undefined) cashflowSettings.fi_multiple = n(prefsRow[0]);
if (prefsRow[1] !== undefined) cashflowSettings.wealth_conversion_target = n(prefsRow[1]);

// ---------------- Assets ----------------
const assetRows = dataRows("Assets").map((r, i) => ({ rowNum: i + 4, label: s(r[0]), type: s(r[1]), value: n(r[2]), notes: s(r[3]) }));
const assetsByLabel = new Map();
for (const a of assetRows) {
  if (!a.type || a.value === null) { err(`Assets row ${a.rowNum}: needs Type and Value.`); continue; }
  if (a.label) assetsByLabel.set(a.label, a);
}

// ---------------- Liabilities ----------------
const liabilityRows = dataRows("Liabilities").map((r, i) => ({ rowNum: i + 4, type: s(r[0]), balance: n(r[1]), linkedAssetLabel: s(r[2]) }));
for (const l of liabilityRows) {
  if (!l.type || l.balance === null) err(`Liabilities row ${l.rowNum}: needs Type and Balance.`);
  if (l.linkedAssetLabel && !assetsByLabel.has(l.linkedAssetLabel)) {
    err(`Liabilities row ${l.rowNum}: linked asset "${l.linkedAssetLabel}" doesn't match any row on the Assets tab.`);
  }
}

// ---------------- Dividend Holdings ----------------
const dividendHoldingRows = dataRows("Dividend Holdings").map((r, i) => ({
  rowNum: i + 4, name: s(r[0]), yield: n(r[1]), growth: n(r[2]), amount: n(r[3]),
}));
for (const d of dividendHoldingRows) if (!d.name) err(`Dividend Holdings row ${d.rowNum}: missing Holding name.`);

// ---------------- Dividend History ----------------
const dividendHistoryRows = dataRows("Dividend History").map((r, i) => ({ rowNum: i + 4, year: n(r[0]), amount: n(r[1]) }));
for (const d of dividendHistoryRows) if (d.year === null || d.amount === null) err(`Dividend History row ${d.rowNum}: needs both Year and Amount.`);
const dividendHistory = dividendHistoryRows.filter((d) => d.year !== null && d.amount !== null).map((d) => ({ year: d.year, amount: d.amount }));

// ---------------- Insurance (counted, not imported) ----------------
const insuranceRowCount = dataRows("Insurance").length;
if (insuranceRowCount > 0) {
  warn(`Insurance: ${insuranceRowCount} row(s) present but skipped -- schema is provisional (see the tab's own note). Key these into the app by hand for now.`);
}

// ---------------- report + bail on hard errors ----------------
console.log(`\nParsed "${filePath}":`);
console.log(`  Accounts: ${accountRows.length}   Historic values: ${historyRows.length}   Holdings: ${holdingRows.length}`);
console.log(`  Goals: ${goalRows.length}   Income: ${incomeRows.length}   Expenses: ${expenseRows.length}`);
console.log(`  Assets: ${assetRows.length}   Liabilities: ${liabilityRows.length}`);
console.log(`  Dividend holdings: ${dividendHoldingRows.length}   Dividend history: ${dividendHistoryRows.length}`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log("  ! " + w));
}
if (errors.length) {
  console.log(`\n${errors.length} error(s) -- fix these in the workbook and re-run. Nothing was written.`);
  errors.forEach((e) => console.log("  x " + e));
  process.exit(1);
}
console.log("\nNo blocking errors.");

if (dryRun) {
  console.log("\n--dry-run: nothing written. Re-run without it once this all looks right.");
  process.exit(0);
}

// ---------------- write to Supabase ----------------
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const wo = () => supabase.schema("wealth_os");
const nowIso = () => new Date().toISOString();

async function insertOne(table, row) {
  const { data, error } = await wo().from(table).insert(row).select().single();
  if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
  return data;
}
async function insertMany(table, rows) {
  if (!rows.length) return [];
  const { data, error } = await wo().from(table).insert(rows).select();
  if (error) throw new Error(`bulk insert into ${table} failed: ${error.message}`);
  return data;
}

function clientPersonalRow() {
  return {
    first_name: personal.firstName, last_name: personal.lastName, dob: personal.dob,
    employment_status: personal.employmentStatus, relationship_status: personal.relationshipStatus,
    risk_profile: personal.riskProfile, email: personal.email, notes: personal.notes,
    partner_name: personal.partnerName, partner_employment_status: personal.partnerEmploymentStatus,
    last_updated: nowIso(),
  };
}

async function main() {
  let clientId = existingClientId;
  if (createClientFlag) {
    const row = Object.assign({ onboarding_complete: false }, clientPersonalRow());
    const created = await insertOne("clients", row);
    clientId = created.id;
    console.log(`\nCreated client ${clientId} (${personal.firstName} ${personal.lastName}).`);
  } else {
    const { error } = await wo().from("clients").update(clientPersonalRow()).eq("id", clientId);
    if (error) throw new Error(`updating clients row ${clientId} failed: ${error.message}`);
    console.log(`\nUpdated Personal details on existing client ${clientId}.`);
  }

  // ---- accounts ----
  const accountIdByLabel = new Map();
  for (const a of accountRows) {
    const row = {
      client_id: clientId, provider: a.provider, type: a.type, value: a.value,
      return_pct: a.returnPct, contribution: a.contribution,
      contribution_personal: a.contributionPersonal, contribution_sacrifice: a.contributionSacrifice,
      opening_contributions: a.openingContributions, cash_balance: a.cashBalance,
      last_updated: nowIso().slice(0, 10), last_edited_by: "import", last_edited_at: nowIso(),
    };
    const saved = await insertOne("accounts", row);
    accountIdByLabel.set(a.label, saved.id);
  }
  console.log(`Inserted ${accountIdByLabel.size} account(s).`);

  // ---- historic account values (account_months) ----
  const monthRows = historyRows.map((h) => ({
    account_id: accountIdByLabel.get(h.accountLabel), month_key: h.monthKey, value: h.value,
    last_edited_by: "import", last_edited_at: nowIso(),
  }));
  await insertMany("account_months", monthRows);
  console.log(`Inserted ${monthRows.length} historic account value(s).`);

  // ---- holdings ----
  const holdingInsertRows = holdingRows.map((h) => ({
    account_id: accountIdByLabel.get(h.accountLabel), name: h.name, ticker: h.ticker,
    units: h.units, avg_open: h.avgOpen, cost_basis: h.costBasis, value: h.value, sector: h.sector,
  }));
  await insertMany("holdings", holdingInsertRows);
  console.log(`Inserted ${holdingInsertRows.length} holding(s).`);

  // ---- income ----
  for (const inc of incomeRows) {
    const saved = await insertOne("income", {
      client_id: clientId, owner: inc.owner, type: inc.type, amount: inc.amount, frequency: inc.frequency,
      last_edited_by: "import", last_edited_at: nowIso(),
    });
    inc.id = saved.id; // keep for Goals' linked_income_id resolution below
  }
  console.log(`Inserted ${incomeRows.length} income row(s).`);

  // ---- goals (+ goal_accounts) ----
  let goalCount = 0, goalAccountLinkCount = 0;
  for (const g of goalRows) {
    const linkedIncome = g.linkedIncomeLabel ? incomeByLabel.get(g.linkedIncomeLabel) : null;
    const savedGoal = await insertOne("goals", {
      client_id: clientId, name: g.name, type: g.type, target_value: g.targetAmount,
      target_date: g.targetDate, status: g.status, progress_type: g.progressType,
      target_income: g.targetIncome, linked_income_id: linkedIncome ? linkedIncome.id : null,
      completed: g.progressType === "completion" && g.status === "completed",
      status_history: [], last_edited_by: "import", last_edited_at: nowIso(),
    });
    goalCount++;
    if (g.linkedAccounts.length) {
      const links = g.linkedAccounts.map((label) => ({ goal_id: savedGoal.id, account_id: accountIdByLabel.get(label) }));
      await insertMany("goal_accounts", links);
      goalAccountLinkCount += links.length;
    }
  }
  console.log(`Inserted ${goalCount} goal(s), ${goalAccountLinkCount} linked-account row(s).`);

  // ---- expenses ----
  const expenseInsertRows = expenseRows.map((e) => ({ client_id: clientId, category: e.kind, label: e.label, amount: e.amount }));
  await insertMany("expenses", expenseInsertRows);
  console.log(`Inserted ${expenseInsertRows.length} expense(s).`);

  // ---- cashflow_settings (upsert -- only the columns this workbook covers) ----
  if (Object.keys(cashflowSettings).length) {
    const { error } = await wo().from("cashflow_settings").upsert(
      Object.assign({ client_id: clientId }, cashflowSettings), { onConflict: "client_id" }
    );
    if (error) throw new Error(`upserting cashflow_settings failed: ${error.message}`);
    console.log("Upserted cashflow settings (savings/emergency fund/preferences).");
  }

  // ---- assets (+ id lookup for liabilities) ----
  const assetIdByLabel = new Map();
  for (const a of assetRows) {
    const saved = await insertOne("wealth_assets", { client_id: clientId, type: a.type, value: a.value, notes: a.notes });
    if (a.label) assetIdByLabel.set(a.label, saved.id);
  }
  console.log(`Inserted ${assetRows.length} asset(s).`);

  // ---- liabilities ----
  const liabilityInsertRows = liabilityRows.map((l) => ({
    client_id: clientId, type: l.type, balance: l.balance,
    linked_asset_id: l.linkedAssetLabel ? assetIdByLabel.get(l.linkedAssetLabel) : null,
  }));
  await insertMany("wealth_liabilities", liabilityInsertRows);
  console.log(`Inserted ${liabilityInsertRows.length} liability(ies).`);

  // ---- dividend holdings ----
  const dividendHoldingInsertRows = dividendHoldingRows.map((d) => ({
    client_id: clientId, name: d.name, yield: d.yield, growth: d.growth, amount: d.amount,
  }));
  await insertMany("dividend_holdings", dividendHoldingInsertRows);
  console.log(`Inserted ${dividendHoldingInsertRows.length} dividend holding(s).`);

  // ---- dividend history (jsonb column on clients, not its own table) ----
  if (dividendHistory.length) {
    const { error } = await wo().from("clients").update({ dividend_history: dividendHistory, last_updated: nowIso() }).eq("id", clientId);
    if (error) throw new Error(`writing dividend_history failed: ${error.message}`);
    console.log(`Wrote ${dividendHistory.length} year(s) of dividend history.`);
  }

  console.log(`\nDone. Client ${clientId} is ready to review in the Adviser Workspace.`);
  if (createClientFlag) {
    console.log(`No login yet -- run: npm run create-user -- <email> <password> --client-id=${clientId}`);
  }
}

main().catch((e) => {
  console.error("\nImport failed partway through:", e.message);
  console.error("Rows written before the failure are still in Supabase -- check the client in the Adviser Workspace before re-running.");
  process.exit(1);
});
