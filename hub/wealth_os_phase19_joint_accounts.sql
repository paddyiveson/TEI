-- Wealth OS Phase 19: joint accounts -- household linking Phase C.
--
-- A joint account is still owned by one client_id (whoever added it) but
-- flagged is_joint=true so it can also be shown -- read-only -- on the
-- other household member(s)' own portfolio view. Writes stay owner/
-- adviser-only via the existing accounts_update/delete/insert policies;
-- this migration only adds an additional SELECT grant for household
-- members, using the same_household() helper from Phase 16. Two people
-- editing the same joint account concurrently is deliberately avoided by
-- keeping writes single-owner -- if joint accounts need shared editing
-- later, that's a separate follow-up, not assumed here.
--
-- Safe to re-run (add-if-not-exists / drop-then-create).

alter table wealth_os.accounts add column if not exists is_joint boolean not null default false;

drop policy if exists accounts_select_joint_household on wealth_os.accounts;
create policy accounts_select_joint_household on wealth_os.accounts
for select
using (
  is_joint
  and exists (
    select 1 from wealth_os.clients viewer
    where viewer.user_id = auth.uid()
      and wealth_os.same_household(viewer.id, accounts.client_id)
  )
);
