-- 026: read the feedback webhook secret from Supabase Vault.
--
-- NOT APPLIED. For Paddy to apply after sign-off of PR v2/audit-fixes.
--
-- wealth_os.notify_feedback_insert posts each new feedback row to
-- /api/feedback-notify with an x-feedback-webhook-secret header. The secret
-- has been written in plain text in the function body, so anyone who can
-- read function definitions has been able to see it. ROTATE IT: treat the
-- current value as exposed.
--
-- Steps, in this order (alerts sent in the minutes between 2 and 4 get a
-- 401 and are not emailed; the feedback rows themselves are still saved):
--   1. Make a new random secret, e.g. `openssl rand -hex 32`.
--   2. Vercel: set FEEDBACK_WEBHOOK_SECRET to the new value and redeploy.
--   3. Supabase SQL editor (not in a file):
--        select vault.create_secret('<new value>', 'feedback_webhook_secret');
--   4. Apply this migration.
--
-- Like 016, the function is rewritten from its own definition inside the
-- database, so no secret ever appears in this file. Safe to re-run.

do $migration$
declare
  d text;
  fixed text;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'feedback_webhook_secret') then
    raise exception '026: add the new secret to Vault first (step 3 above); function not changed';
  end if;

  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'wealth_os' and p.proname = 'notify_feedback_insert';
  if d is null then raise exception '026: wealth_os.notify_feedback_insert not found'; end if;
  if position('vault.decrypted_secrets' in d) > 0 then raise notice '026: already applied'; return; end if;

  fixed := regexp_replace(d,
    $re$('x-feedback-webhook-secret',\s*)'[^']*'$re$,
    $rep$\1(select decrypted_secret from vault.decrypted_secrets where name = 'feedback_webhook_secret')$rep$);
  if fixed = d then raise exception '026: secret header not found; function not changed'; end if;
  execute fixed;
end
$migration$;
