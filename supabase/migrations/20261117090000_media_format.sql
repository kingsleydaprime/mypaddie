-- A book's format: hard copy, PDF / e-book, or audiobook. Optional (existing
-- rows stay "not set"), and only books have one. Policies on media already
-- scope every row to its owner, so nothing to add for RLS.
alter table public.media
  add column format text check (format in ('print', 'ebook', 'audio')),
  add constraint media_format_books_only check (format is null or kind = 'book');
