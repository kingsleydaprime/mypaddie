"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDb } from "@/shared/supabase/session";
import { logWorkout } from "./workouts.repo";

const payload = z.object({
  day: z.string().nullable(),
  durationMinutes: z.number().int().min(1).max(600),
  feel: z.number().int().min(1).max(5).nullable(),
  notes: z.string().max(1000),
  entries: z
    .array(
      z.object({
        exercise: z.string().trim().min(1),
        sets: z.number().int().min(1).max(50).nullable(),
        reps: z.number().int().min(1).max(1000).nullable(),
        weightKg: z.number().nonnegative().nullable(),
        seconds: z.number().int().positive().nullable(),
      }),
    )
    .max(40),
});

export type LogWorkoutResult =
  | { error: string }
  | { ok: true; xp: number | null; newBests: { exercise: string; from: string; to: string }[] };

const describe = (e: { reps: number | null; weightKg: number | null; seconds: number | null }) =>
  e.weightKg ? `${e.weightKg}kg × ${e.reps ?? "?"}` : e.seconds ? `${e.seconds}s` : `${e.reps ?? "?"} reps`;

export async function logWorkoutAction(input: unknown): Promise<LogWorkoutResult> {
  const parsed = payload.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the numbers" };
  const v = parsed.data;
  const db = await requireDb("/app/workout");
  try {
    const logged = await logWorkout(
      db,
      { day: v.day ?? undefined, durationMinutes: v.durationMinutes, feel: v.feel ?? undefined, notes: v.notes || undefined, entries: v.entries },
      new Date(),
    );
    revalidatePath("/app");
    revalidatePath("/app/workout");
    return {
      ok: true,
      xp: logged.completed.result === "completed" ? logged.completed.xp : null,
      newBests: logged.newBests.map((b) => ({ exercise: b.exercise, from: b.previous ? describe(b.previous) : "—", to: describe(b.now) })),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
