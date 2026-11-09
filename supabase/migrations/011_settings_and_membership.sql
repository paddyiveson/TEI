-- Wealth OS: Settings / Me (redesign spec B9, B1.5). NOT YET APPLIED.
--
-- clients:
--   theme               'light' | 'dark', the client's choice (B1.5). The
--                       app mirrors it to the device for first paint.
--   notification_prefs  small JSON object (B9.5, B9.7), e.g.
--                       {"email":{"monthly":true,"sessions":true,
--                         "documents":true,"messages":true}}. Phone alerts
--                       are not built yet.
--   tier                'core' | 'momentum' | 'inner_circle', set by the
--                       coach in Manual Entry (C6.2). Shown on Settings >
--                       Membership.
--   member_since        date the membership started, set by the coach.
-- cashflow_settings:
--   safety_net_months   Plan settings safety net target, 3 to 12 in the app
--                       (B9.4). Null means the TEI default of 6.
--
-- The app only sends each of these once it holds a value, so other saves to
-- clients and cashflow_settings keep working before this is applied.
-- RLS: both tables' policies are row-level; new columns need no change.
-- Note the client role can update its own clients row, so a client could
-- in principle write its own tier through the API; the app only offers that
-- field to the coach. Move tier to an adviser-only table if that matters.

alter table wealth_os.clients
  add column theme text check (theme in ('light', 'dark')),
  add column notification_prefs jsonb,
  add column tier text check (tier in ('core', 'momentum', 'inner_circle')),
  add column member_since date;
comment on column wealth_os.clients.theme is 'Light or dark, the client''s choice (redesign B1.5).';
comment on column wealth_os.clients.notification_prefs is 'Notification choices (redesign B9.5), a small JSON object.';
comment on column wealth_os.clients.tier is 'Membership tier, set by the coach (redesign C6.2).';
comment on column wealth_os.clients.member_since is 'Membership start date, set by the coach.';

alter table wealth_os.cashflow_settings
  add column safety_net_months smallint check (safety_net_months between 1 and 24);
comment on column wealth_os.cashflow_settings.safety_net_months is 'Safety net target in months of spending (Plan settings, B9.4). Null = 6.';
