-- Dead push subscriptions are removed when /api/push reports them gone.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(5);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'kingsley@example.com');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('11111111-1111-1111-1111-111111111111', 'https://push.example/old-phone', 'k', 'a'),
  ('11111111-1111-1111-1111-111111111111', 'https://push.example/new-phone', 'k', 'a');

-- What /api/push answered recently (pg_net stores it), plus some noise.
insert into net._http_response (id, status_code, content, created) values
  (-1, 200, '{"sent":1,"failed":1,"gone":["https://push.example/old-phone"]}', now()),
  (-2, 200, 'not json at all', now()),
  (-3, 500, '{"gone":["https://push.example/new-phone"]}', now()),
  (-4, 200, '{"gone":["https://push.example/new-phone"]}', now() - interval '2 hours');

select is(private.prune_dead_subscriptions(), 1, 'removes exactly the subscription reported gone');
select is((select string_agg(endpoint, ',') from public.push_subscriptions where endpoint like 'https://push.example/%'),
  'https://push.example/new-phone', 'the live one stays');
select is(private.try_jsonb('not json'), null, 'non-JSON bodies are skipped, not fatal');
select is(private.prune_dead_subscriptions(), 0, 'running again removes nothing more');
select lives_ok($$select private.send_nudges()$$, 'the nudge job prunes and carries on');

select * from finish();
rollback;
