-- 016: say who sent a request (Paddy, 20 Oct 2026: the emails "don't tell
-- me which client created the request").
-- wealth_os.notify_feedback_insert posts each new feedback row to
-- /api/feedback-notify, which emails Paddy. The payload now carries the
-- client's name and email and a link to their Wealth OS, and the message it
-- sends starts with those details, so the email shows them even before the
-- endpoint itself is updated. The stored feedback row is unchanged
-- (message_text keeps the original wording).
-- The function is rewritten from its own definition inside the database, so
-- the webhook secret it holds never appears in this file.
do $migration$
declare
  d text;
  old_part constant text := $p$'record', to_jsonb(new))$p$;
  new_part constant text := $p$'record', to_jsonb(new) || coalesce((select jsonb_build_object(
      'client_name', nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
      'client_email', c.email,
      'client_link', 'https://www.theeverydayinvestor.uk/hub/wealth-os.html?client=' || new.client_id,
      'message_text', new.message,
      'message', 'From: ' || coalesce(nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), 'a client')
        || coalesce(' <' || c.email || '>', '')
        || E'\nAbout: ' || coalesce(new.area, 'general')
        || E'\nSent: ' || to_char(new.created_at at time zone 'Europe/London', 'DD Mon YYYY HH24:MI')
        || E'\nOpen their Wealth OS: https://www.theeverydayinvestor.uk/hub/wealth-os.html?client=' || new.client_id
        || E'\n\n' || new.message)
    from wealth_os.clients c where c.id = new.client_id), '{}'::jsonb))$p$;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'wealth_os' and p.proname = 'notify_feedback_insert';
  if d is null then raise exception '016: wealth_os.notify_feedback_insert not found'; end if;
  if position('client_link' in d) > 0 then raise notice '016: already applied'; return; end if;
  if position(old_part in d) = 0 then raise exception '016: payload line not found; function not changed'; end if;
  execute replace(d, old_part, new_part);
end
$migration$;
