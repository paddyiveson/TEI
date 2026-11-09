-- Members-only sections on public content pages (Brand content rebuild,
-- decision 9). NOT YET APPLIED.
--
-- Public guides and articles can carry a section that only signed-in members
-- see. Its words are never written into the public page: the page shows a
-- short preview and asks the reader to log in; after sign-in,
-- /assets/members.js reads the section from this table, and row-level
-- security only returns it to a member (a client with a login, or the coach).
--
-- members_content:
--   slug        the page the section belongs to, e.g. 'pension-vs-lisa'
--   section     the section's key on that page, e.g. 'deeper'
--   title       heading shown above it
--   body_html   the section itself (simple HTML: p, ul, ol, strong, a)
--   tiers       null = every member; otherwise only these clients.tier
--               values ('core', 'momentum', 'inner_circle'). The coach
--               always sees every section.
--
-- Sections are written by the coach. Until there is an editor in HQ, add or
-- change one with an insert like the example at the bottom.
-- Personal figures (for example a member's own pot in an article figure) do
-- not use this table: they come from the member's own Wealth OS rows, which
-- the existing policies already limit to that member.

create table if not exists wealth_os.members_content (
  slug        text not null,
  section     text not null,
  title       text,
  body_html   text not null,
  tiers       text[],
  updated_at  timestamptz not null default now(),
  primary key (slug, section)
);
comment on table wealth_os.members_content is 'Members-only sections of public guides and articles (content rebuild, decision 9).';

-- A member: the coach, or a client with a login.
create or replace function wealth_os.is_member()
returns boolean
language sql
stable
security definer
set search_path = wealth_os, public
as $$
  select wealth_os.is_adviser()
      or exists (select 1 from wealth_os.clients c where c.user_id = auth.uid());
$$;
revoke all on function wealth_os.is_member() from public, anon;
grant execute on function wealth_os.is_member() to authenticated;

-- The signed-in client's tier, or null.
create or replace function wealth_os.my_tier()
returns text
language sql
stable
security definer
set search_path = wealth_os, public
as $$
  select c.tier from wealth_os.clients c where c.user_id = auth.uid() limit 1;
$$;
revoke all on function wealth_os.my_tier() from public, anon;
grant execute on function wealth_os.my_tier() to authenticated;

alter table wealth_os.members_content enable row level security;

drop policy if exists members_content_read on wealth_os.members_content;
create policy members_content_read on wealth_os.members_content
for select to authenticated
using (
  wealth_os.is_adviser()
  or (wealth_os.is_member() and (tiers is null or wealth_os.my_tier() = any (tiers)))
);

drop policy if exists members_content_write on wealth_os.members_content;
create policy members_content_write on wealth_os.members_content
for all to authenticated
using (wealth_os.is_adviser())
with check (wealth_os.is_adviser());

revoke all on wealth_os.members_content from anon;
grant select, insert, update, delete on wealth_os.members_content to authenticated;

-- Example (the coach writes the words; this is the shape only):
-- insert into wealth_os.members_content (slug, section, title, body_html)
-- values ('pension-vs-lisa', 'deeper', 'Section title', '<p>Section text.</p>')
-- on conflict (slug, section) do update
--   set title = excluded.title, body_html = excluded.body_html, tiers = excluded.tiers, updated_at = now();
