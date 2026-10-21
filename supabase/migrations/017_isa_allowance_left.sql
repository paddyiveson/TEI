-- 017: ISA allowance left on each ISA account (spec v2.5 B5.2, Paddy, 21 Oct 2026).
-- Applied to production 2026-10-21 as migration "017_isa_allowance_left".
--
-- The client types how much of this tax year's ISA allowance they have left,
-- on the ISA account itself, and the figure is stamped with the tax year it
-- belongs to ("2026-27" runs 6 April 2026 to 5 April 2027). After 5 April the
-- app treats a figure from an earlier tax year as out of date: it greys it
-- out and asks for a reset, and the Lab's Bed & ISA preset asks before it
-- runs. The app works out the current tax year; nothing here changes by date.
--
-- Only ISA types use it (isa, cash_isa, lisa, cash_lisa); the app does not
-- show the field on other accounts. Both columns are null until the client
-- fills them in. Additive: existing rows unchanged, no backfill.
-- RLS: accounts policies are row-level (adviser via is_adviser(), client via
-- clients.user_id = auth.uid()) and authenticated has table-wide
-- INSERT/SELECT/UPDATE, so both roles can read and write these columns with
-- no policy change (as 007).

alter table wealth_os.accounts
  add column if not exists isa_allowance_left numeric,
  add column if not exists isa_allowance_tax_year text;

alter table wealth_os.accounts drop constraint if exists accounts_isa_allowance_left_check;
alter table wealth_os.accounts add constraint accounts_isa_allowance_left_check
  check (isa_allowance_left is null or isa_allowance_left >= 0);

alter table wealth_os.accounts drop constraint if exists accounts_isa_allowance_tax_year_check;
alter table wealth_os.accounts add constraint accounts_isa_allowance_tax_year_check
  check (isa_allowance_tax_year is null or isa_allowance_tax_year ~ '^[0-9]{4}-[0-9]{2}$');

comment on column wealth_os.accounts.isa_allowance_left is 'Client-entered ISA allowance left this tax year, in pounds. Read by the Lab''s Bed & ISA preset as its cap. Out of date when isa_allowance_tax_year is not the current tax year.';
comment on column wealth_os.accounts.isa_allowance_tax_year is 'Tax year the allowance figure belongs to, e.g. 2026-27 (6 April 2026 to 5 April 2027).';
