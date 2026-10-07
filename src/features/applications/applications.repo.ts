import { completeTask, createTask, deleteTask, updateTask, type CreateResult } from "@/features/tasks/tasks.repo";
import { requireRoom } from "@/features/plans/guard";
import { currentConfig } from "@/shared/config";
import type { Db } from "@/shared/supabase/token-client";
import { addDays, dayKey, zonedInstant } from "@/shared/time";
import {
  deadlineInstant,
  isOpen,
  MUST_DO_DAYS_BEFORE_TARGET,
  summarize,
  targetDay,
  weightsFor,
  type ApplicationKind,
  type ApplicationStatus,
} from "./applications";

/** The current user's time zone (read per call, never at import). */
const tz = () => currentConfig().timeZone;
const COLUMNS = "id, title, org, kind, link, description, status, deadline_at, deadline_tz, target_days_before, results_expected, submitted_at, notes, application_requirements(id, title, done, task_id, position)";

export interface RequirementInput {
  title: string;
  minutes?: number;
}

/** The task that gets one requirement done: due on the target, a must-do in the final stretch. */
async function requirementTask(
  db: Db,
  app: { title: string; kind: ApplicationKind; deadline_at: string | null; target_days_before: number },
  req: RequirementInput,
  now: Date,
): Promise<CreateResult> {
  const today = dayKey(now, tz());
  let due: string | null = null;
  let mustFrom: Date | null = null;
  if (app.deadline_at) {
    const target = targetDay(new Date(app.deadline_at), app.target_days_before);
    due = target < today ? today : target;
    const mustDay = addDays(target, -MUST_DO_DAYS_BEFORE_TARGET);
    mustFrom = zonedInstant(mustDay < today ? today : mustDay, "09:00", tz());
  }
  return createTask(
    db,
    {
      title: `${app.title}: ${req.title}`,
      itemId: null,
      baseXp: 15,
      dueDate: due,
      dueTime: null,
      recurrence: null,
      nonNegotiable: false,
      weights: weightsFor(app.kind),
      durationMinutes: req.minutes ?? 60,
      mustFrom,
    },
    now,
  );
}

export interface NewApplication {
  title: string;
  org?: string;
  kind: ApplicationKind;
  link?: string;
  description?: string;
  /** As published: local date + time in the deadline's own zone. Omit all three for rolling. */
  deadline?: { date: string; time: string; timeZone: string };
  targetDaysBefore?: number;
  resultsExpected?: string;
  notes?: string;
  requirements?: RequirementInput[];
}

export async function addApplication(db: Db, input: NewApplication, now: Date) {
  await requireRoom(db, "applications");
  const deadlineAt = input.deadline ? deadlineInstant(input.deadline.date, input.deadline.time, input.deadline.timeZone) : null;
  const { data: app, error } = await db
    .from("applications")
    .insert({
      title: input.title.trim(),
      org: input.org ?? null,
      kind: input.kind,
      link: input.link ?? null,
      description: input.description ?? null,
      status: input.requirements?.length ? "preparing" : "researching",
      deadline_at: deadlineAt?.toISOString() ?? null,
      deadline_tz: input.deadline?.timeZone ?? null,
      target_days_before: input.targetDaysBefore ?? 3,
      results_expected: input.resultsExpected ?? null,
      notes: input.notes ?? null,
    })
    .select("id, title, kind, deadline_at, target_days_before")
    .single();
  if (error) throw new Error(`saving the application: ${error.message}`);
  const scheduling = await addRequirements(db, app.id, app as Parameters<typeof requirementTask>[1], input.requirements ?? [], now);
  return { id: app.id, scheduling };
}

async function addRequirements(
  db: Db,
  applicationId: string,
  app: Parameters<typeof requirementTask>[1],
  reqs: RequirementInput[],
  now: Date,
  startPosition = 0,
) {
  const results: { requirement: string; result: CreateResult["result"]; detail?: unknown }[] = [];
  for (const [i, req] of reqs.entries()) {
    const task = await requirementTask(db, app, req, now);
    const taskId = task.result === "created" ? task.task.id : null;
    const { error } = await db
      .from("application_requirements")
      .insert({ application_id: applicationId, title: req.title.trim(), task_id: taskId, position: startPosition + i });
    if (error) throw new Error(`saving requirement "${req.title}": ${error.message}`);
    // A full or clashing day doesn't lose the requirement — it's reported so it can go on another day.
    results.push(task.result === "created" ? { requirement: req.title, result: "created" } : { requirement: req.title, result: task.result, detail: task });
  }
  return results;
}

export async function loadApplications(db: Db, now: Date) {
  const { data, error } = await db.from("applications").select(COLUMNS).order("deadline_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`loading applications: ${error.message}`);
  return data.map((a) => {
    const reqs = [...(a.application_requirements ?? [])].sort((x, y) => x.position - y.position);
    return {
      ...a,
      requirements: reqs,
      summary: summarize(
        { status: a.status as ApplicationStatus, deadlineAt: a.deadline_at ? new Date(a.deadline_at) : null, targetDaysBefore: a.target_days_before },
        reqs,
        now,
      ),
    };
  });
}

export type LoadedApplication = Awaited<ReturnType<typeof loadApplications>>[number];

/** Cancel the requirement tasks still open — once submitted (or closed), they're moot. */
async function cancelOpenRequirementTasks(db: Db, applicationId: string, now: Date) {
  const { data } = await db.from("application_requirements").select("task_id").eq("application_id", applicationId).eq("done", false);
  for (const r of data ?? []) if (r.task_id) await updateTask(db, r.task_id, {}, "cancel", now);
}

export async function updateApplication(
  db: Db,
  id: string,
  changes: {
    status?: ApplicationStatus;
    title?: string;
    org?: string | null;
    link?: string | null;
    description?: string | null;
    notes?: string | null;
    deadline?: { date: string; time: string; timeZone: string } | null;
    targetDaysBefore?: number;
    resultsExpected?: string | null;
  },
  now: Date,
) {
  const deadlineAt = changes.deadline === undefined ? undefined : changes.deadline ? deadlineInstant(changes.deadline.date, changes.deadline.time, changes.deadline.timeZone) : null;
  const { data: app, error } = await db
    .from("applications")
    .update({
      ...(changes.status ? { status: changes.status } : {}),
      ...(changes.status === "submitted" ? { submitted_at: now.toISOString() } : {}),
      ...(changes.title ? { title: changes.title } : {}),
      ...(changes.org !== undefined ? { org: changes.org } : {}),
      ...(changes.link !== undefined ? { link: changes.link } : {}),
      ...(changes.description !== undefined ? { description: changes.description } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
      ...(deadlineAt !== undefined ? { deadline_at: deadlineAt?.toISOString() ?? null, deadline_tz: changes.deadline?.timeZone ?? null } : {}),
      ...(changes.targetDaysBefore !== undefined ? { target_days_before: changes.targetDaysBefore } : {}),
      ...(changes.resultsExpected !== undefined ? { results_expected: changes.resultsExpected } : {}),
    })
    .eq("id", id)
    .select("id, title, kind, status, deadline_at, target_days_before")
    .maybeSingle();
  if (error) throw new Error(`updating the application: ${error.message}`);
  if (!app) return { result: "not_found" as const };

  if (changes.status && !isOpen(changes.status)) await cancelOpenRequirementTasks(db, id, now);

  // A new deadline or target moves the open requirement tasks with it.
  if ((deadlineAt !== undefined || changes.targetDaysBefore !== undefined) && app.deadline_at && isOpen(app.status as ApplicationStatus)) {
    const target = targetDay(new Date(app.deadline_at), app.target_days_before);
    const today = dayKey(now, tz());
    const mustDay = addDays(target, -MUST_DO_DAYS_BEFORE_TARGET);
    const { data: open } = await db.from("application_requirements").select("task_id").eq("application_id", id).eq("done", false);
    for (const r of open ?? []) {
      if (r.task_id) {
        await updateTask(db, r.task_id, { dueDate: target < today ? today : target, mustFrom: zonedInstant(mustDay < today ? today : mustDay, "09:00", tz()) }, "edit", now);
      }
    }
  }
  return { result: "updated" as const };
}

/** Add, tick, untick or remove a requirement. Ticking completes its task (so it pays XP). */
export async function changeRequirement(
  db: Db,
  applicationId: string,
  change: { add?: RequirementInput[]; done?: string; undone?: string; remove?: string },
  now: Date,
) {
  const { data: app } = await db.from("applications").select("id, title, kind, deadline_at, target_days_before").eq("id", applicationId).maybeSingle();
  if (!app) return { result: "not_found" as const };
  const { data: reqs } = await db.from("application_requirements").select("id, title, done, task_id, position").eq("application_id", applicationId);
  const find = (title: string) => (reqs ?? []).find((r) => r.title.trim().toLowerCase() === title.trim().toLowerCase());

  if (change.add?.length) {
    const scheduling = await addRequirements(db, applicationId, app as Parameters<typeof requirementTask>[1], change.add, now, (reqs ?? []).length);
    return { result: "added" as const, scheduling };
  }
  const title = change.done ?? change.undone ?? change.remove;
  if (!title) return { result: "nothing_to_do" as const };
  const req = find(title);
  if (!req) return { result: "no_such_requirement" as const, title };

  if (change.done !== undefined) {
    if (req.task_id) await completeTask(db, req.task_id, now); // pays XP; also ticks the requirement
    await db.from("application_requirements").update({ done: true }).eq("id", req.id);
    return { result: "done" as const, title: req.title };
  }
  if (change.undone !== undefined) {
    await db.from("application_requirements").update({ done: false }).eq("id", req.id);
    return { result: "undone" as const, title: req.title };
  }
  if (req.task_id) {
    const d = await deleteTask(db, req.task_id);
    if (d.result === "has_history") await updateTask(db, req.task_id, {}, "cancel", now);
  }
  await db.from("application_requirements").delete().eq("id", req.id);
  return { result: "removed" as const, title: req.title };
}
