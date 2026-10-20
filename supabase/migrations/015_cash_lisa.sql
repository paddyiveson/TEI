-- 015: Cash LISA as its own account type (Paddy, 20 Oct 2026).
-- 'lisa' stays as the stocks and shares LISA; 'cash_lisa' is a Lifetime ISA
-- held in cash. Wealth OS gives it the LISA bonus and the cash interest
-- fields, and counts it in cash totals. Additive: existing rows unchanged.
alter table wealth_os.accounts drop constraint if exists accounts_type_check;
alter table wealth_os.accounts add constraint accounts_type_check
  check (type = any (array['isa', 'gia', 'lisa', 'cash_lisa', 'pension', 'cash', 'cash_isa', 'crypto', 'other']));
