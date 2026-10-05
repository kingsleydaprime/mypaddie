-- Google Calendar import: events copied from his calendar's private iCal feed.
-- `source` marks where an event came from; `external_uid` identifies one
-- occurrence in the feed (UID + start), so re-syncing updates instead of duplicating.
alter table public.events
  add column source text not null default 'manual' check (source in ('manual', 'google')),
  add column external_uid text,
  add constraint imported_events_have_uid check ((source = 'manual') = (external_uid is null)),
  add constraint one_row_per_imported_occurrence unique (user_id, external_uid);
