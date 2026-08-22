-- Wealth OS Phase 16: household grouping between clients (e.g. married couples).
--
-- Adds a `households` table and a nullable `household_id` FK on `clients`.
-- Every existing client stays household_id = null and behaves exactly as
-- before -- this only changes what an adviser query can join on, not what
-- any individual client can see (no RLS access changes in this phase).
--
-- A real households table (rather than a self-referential clients.linked_
-- client_id) was chosen because a household can in principle hold more
-- than two adults, and it gives a natural home for household-level
-- settings/labels later without another schema change.
--
-- same_household() is a small helper for later phases (e.g. Phase C joint
-- accounts) that need an RLS predicate for "these two clients are linked".
--
-- Safe to re-run (add-if-not-exists / create-or-replace).

create table if not exists wealth_os.households (
  id uuid primary key default gen_random_uuid(),
  label text,
  created_at timestamptz default now()
);

alter table wealth_os.clients add column if not exists household_id uuid references wealth_os.households(id);

create or replace function wealth_os.same_household(client_id_a uuid, client_id_b uuid)
returns boolean
language sql
stable
security definer
set search_path = wealth_os, public
as $$
  select exists (
    select 1
    from wealth_os.clients a, wealth_os.clients b
    where a.id = client_id_a and b.id = client_id_b
      and a.household_id is not null
      and a.household_id = b.household_id
  );
$$;
