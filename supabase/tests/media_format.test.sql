-- Library formats: books only, a fixed set, optional.
begin;
create extension if not exists pgtap with schema extensions;
select set_config('search_path', current_setting('search_path') || ', ' || n.nspname, true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(5);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'sam@example.com');

select lives_ok($$insert into public.media (user_id, kind, title, format) values ('11111111-1111-1111-1111-111111111111', 'book', 'Atomic Habits', 'print')$$,
  'a hard-copy book saves');
select lives_ok($$insert into public.media (user_id, kind, title) values ('11111111-1111-1111-1111-111111111111', 'book', 'Deep Work')$$,
  'a book without a format saves (not set)');
select throws_ok($$insert into public.media (user_id, kind, title, format) values ('11111111-1111-1111-1111-111111111111', 'movie', 'Dune', 'ebook')$$,
  '23514', null, 'only books have a format');
select throws_ok($$insert into public.media (user_id, kind, title, format) values ('11111111-1111-1111-1111-111111111111', 'book', 'Sapiens', 'kindle')$$,
  '23514', null, 'an unknown format is refused');
select throws_ok($$update public.media set kind = 'movie' where title = 'Atomic Habits'$$,
  '23514', null, 'a book with a format can''t become a film without clearing it');

select * from finish();
rollback;
