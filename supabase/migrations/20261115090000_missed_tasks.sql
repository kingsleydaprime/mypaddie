-- Mark-missed feature: database foundation.
-- Adds 'missed' to task_status enum and events.status check, extends xp_reason
-- with 'miss_penalty' and 'honesty_bonus', creates the missed_tasks ledger,
-- and adds the record_miss function that atomically updates status, records the
-- miss, and awards XP in one transaction.

-- ─── Section 1: task_status enum ─────────────────────────────────────────────

ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'missed';

-- ─── Section 2: events.status check ──────────────────────────────────────────
-- status is a text column with an auto-named check constraint (events_status_check).
-- Drop the old one and add a new one that includes 'missed'.

ALTER TABLE public.events DROP CONSTRAINT events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status IN ('upcoming', 'done', 'cancelled', 'missed'));

-- ─── Section 3: xp_reason enum ───────────────────────────────────────────────

ALTER TYPE public.xp_reason ADD VALUE IF NOT EXISTS 'miss_penalty';
ALTER TYPE public.xp_reason ADD VALUE IF NOT EXISTS 'honesty_bonus';

-- ─── Section 4: missed_tasks table ───────────────────────────────────────────
-- Exactly one of task_id or event_id must be set (missed_one_source).
-- A task or event can only be missed once (missed_task_once, missed_event_once).

CREATE TABLE public.missed_tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  task_id      uuid        REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_id     uuid        REFERENCES public.events(id) ON DELETE CASCADE,
  reason       text        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  penalty_xp   integer     NOT NULL,
  honesty_xp   integer     NOT NULL DEFAULT 0,
  self_reported boolean    NOT NULL DEFAULT true,
  at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT missed_one_source  CHECK ((task_id IS NULL) != (event_id IS NULL)),
  CONSTRAINT missed_task_once   UNIQUE (task_id),
  CONSTRAINT missed_event_once  UNIQUE (event_id)
);

-- Composite FK indexes (per DECISIONS.md convention).
CREATE INDEX missed_tasks_user_task_idx  ON public.missed_tasks (user_id, task_id);
CREATE INDEX missed_tasks_user_event_idx ON public.missed_tasks (user_id, event_id);

-- ─── Section 5: RLS on missed_tasks ──────────────────────────────────────────
-- Append-only ledger: authenticated users may read and insert their own rows.

ALTER TABLE public.missed_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.missed_tasks FROM anon, authenticated;
GRANT SELECT, INSERT ON public.missed_tasks TO authenticated;

CREATE POLICY "owner can read" ON public.missed_tasks
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "owner can insert" ON public.missed_tasks
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

-- ─── Section 6: record_miss function ─────────────────────────────────────────
-- Atomically: updates task or event status to 'missed', inserts the missed_tasks
-- row, and awards the combined penalty + honesty XP.
-- Caller passes XP entries as separate jsonb arrays; they are merged before
-- forwarding to award_xp so both sets go through the same idempotency indexes.

CREATE FUNCTION public.record_miss(
  p_task_id        uuid,
  p_event_id       uuid,
  p_reason         text,
  p_penalty_entries jsonb,
  p_honesty_entries jsonb,
  p_self_reported  boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_title text;
BEGIN
  -- ── Update the source row status ──────────────────────────────────────────
  IF p_task_id IS NOT NULL THEN
    UPDATE public.tasks
      SET status = 'missed'
      WHERE id = p_task_id AND status = 'pending'
      RETURNING title INTO v_title;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'result',
        CASE
          WHEN EXISTS (SELECT 1 FROM public.tasks WHERE id = p_task_id AND status = 'missed')
            THEN 'already_missed'
          ELSE 'not_found'
        END
      );
    END IF;
  END IF;

  IF p_event_id IS NOT NULL THEN
    UPDATE public.events
      SET status = 'missed'
      WHERE id = p_event_id AND status = 'upcoming'
      RETURNING title INTO v_title;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'result',
        CASE
          WHEN EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND status = 'missed')
            THEN 'already_missed'
          ELSE 'not_found'
        END
      );
    END IF;
  END IF;

  -- ── Record the miss ───────────────────────────────────────────────────────
  -- ON CONFLICT DO NOTHING: retries are safe; the status update above already
  -- returned 'already_missed' so we only reach here on the first call.
  INSERT INTO public.missed_tasks
    (user_id, task_id, event_id, reason, penalty_xp, honesty_xp, self_reported)
  VALUES (
    (SELECT auth.uid()),
    p_task_id,
    p_event_id,
    p_reason,
    COALESCE((SELECT SUM((e->>'amount')::integer) FROM jsonb_array_elements(p_penalty_entries) e), 0),
    COALESCE((SELECT SUM((e->>'amount')::integer) FROM jsonb_array_elements(p_honesty_entries) e), 0),
    p_self_reported
  )
  ON CONFLICT DO NOTHING;

  -- ── Award combined XP (penalty + honesty) ────────────────────────────────
  PERFORM public.award_xp(p_penalty_entries || p_honesty_entries);

  RETURN jsonb_build_object('result', 'recorded', 'title', v_title);
END;
$$;

REVOKE ALL ON FUNCTION public.record_miss(uuid, uuid, text, jsonb, jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_miss(uuid, uuid, text, jsonb, jsonb, boolean) TO authenticated;
