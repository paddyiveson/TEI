-- Wealth OS Phase 18: joint (shared) expense tagging -- household linking Phase B.
--
-- Mirrors the existing income.owner pattern exactly ('client' | 'partner')
-- except expenses only need a two-way split since there's no separate
-- "partner" client record to attribute to -- a joint expense is still
-- stored under whichever client_id entered it, just tagged so household
-- rollups (and each member's own dashboard) can tell it apart from that
-- person's individual spending. Default 'client' so every existing row
-- (and every expense entered by a client with no household) keeps
-- behaving exactly as before.
--
-- Safe to re-run (add-if-not-exists / drop-then-create).

alter table wealth_os.expenses add column if not exists owner text not null default 'client';

alter table wealth_os.expenses drop constraint if exists expenses_owner_check;
alter table wealth_os.expenses add constraint expenses_owner_check
  check (owner in ('client','joint'));
