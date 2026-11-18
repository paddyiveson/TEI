-- 025: drop the investment plan tables and their view.
--
-- NOT APPLIED. DO NOT APPLY YET.
--
-- Wealth OS no longer reads these (its investment plan page was cut in the
-- V2 revamp; the Forecast replaces it). But TEI Cortex still does, read and
-- write, as of 18 Nov 2026:
--   admin/portfolio-planning.html  (investment_plans, plan_investments,
--                                   plan_investment_accounts)
--   admin/decisions.html           (decision_log_entries)
--   admin/js/wealth-os-client.js   (the shared reads and writes)
-- and cortex.client_follow_ups has a foreign key into decision_log_entries
-- (client_follow_ups_related_decision_id_fkey).
--
-- Apply only once Cortex Portfolio Planning and Decisions & History are
-- retired or moved off these tables. The guard below refuses to run while
-- any Cortex follow-up still points at a decision.
--
-- Data when checked (read-only, 17-18 Nov 2026): test data only, all John
-- Doe's: 1 plan, 6 plan investments, 4 plan-account links, 1 decision entry.

do $$
begin
  if to_regclass('cortex.client_follow_ups') is not null then
    if exists (select 1 from information_schema.columns
                where table_schema = 'cortex' and table_name = 'client_follow_ups'
                  and column_name = 'related_decision_id') then
      if exists (select 1 from cortex.client_follow_ups where related_decision_id is not null) then
        raise exception 'cortex.client_follow_ups still links to decision_log_entries; move or clear those links first';
      end if;
    end if;
    alter table cortex.client_follow_ups drop constraint if exists client_follow_ups_related_decision_id_fkey;
  end if;
end $$;

drop view  if exists wealth_os.v_plan_vs_actual;
drop table if exists wealth_os.decision_log_entries;
drop table if exists wealth_os.plan_investment_accounts;
drop table if exists wealth_os.plan_investments;
drop table if exists wealth_os.investment_plans;
