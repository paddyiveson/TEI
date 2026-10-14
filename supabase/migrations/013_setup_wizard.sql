-- Wealth OS: Set up Wealth OS, the gap flow (redesign spec B13). NOT YET APPLIED.
--
-- All new fields live on wealth_os.clients as small JSON objects. No new
-- tables (B13.6).
--
--   dependants        {"count":"none"|"1"|"2"|"3+", "ages":"4 and 7",
--                      "others":"a parent I help out"}
--   state_pension     {"weekly":203.85, "age":68} or {"notChecked":true}
--   protection        {"life":"yes"|"no"|"unsure", "income":..., "critical":...,
--                      "will":...}. Recorded as fact only (B13.3).
--   investor_profile  attitudes and investment profile, the client's own
--                      words: {"wants","worries","past","experience",
--                      "knowledge","horizon","fall","style"}. The risk label
--                      itself stays on clients.risk_profile.
--   setup_request     the coach's request and its progress:
--                      {"status":"sent"|"in_progress"|"finished",
--                       "off":{"<gap id>":true}, "questions":[{"id","section","text"}],
--                       "answers":{"<question id>":"..."}, "step":"<section>",
--                       "left":3, "sentAt","startedAt","finishedAt",
--                       "newAnswers":["<field>"]}
--
-- The app only sends each column once it holds a value, so every other save
-- to clients keeps working before this is applied.
-- RLS: clients policies are row-level; new columns need no change. The client
-- role can update its own row, which the wizard needs (it writes the answers
-- and setup_request progress).

alter table wealth_os.clients
  add column if not exists dependants jsonb,
  add column if not exists state_pension jsonb,
  add column if not exists protection jsonb,
  add column if not exists investor_profile jsonb,
  add column if not exists setup_request jsonb;

comment on column wealth_os.clients.dependants is 'Dependants: count, ages, anyone else who relies on them (B13.3).';
comment on column wealth_os.clients.state_pension is 'State Pension forecast: weekly amount and age, or notChecked (B13.3).';
comment on column wealth_os.clients.protection is 'Yes / no / not sure for life cover, income protection, critical illness, a will. Fact only (B13.3).';
comment on column wealth_os.clients.investor_profile is 'Attitudes and investment profile in the client''s words. Not a formal risk assessment (B13.3).';
comment on column wealth_os.clients.setup_request is 'Set up Wealth OS: the coach''s gap list, extra questions and progress (B13.4).';
