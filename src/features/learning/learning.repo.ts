import { DEFAULT_CONFIG } from "@/shared/config";
import type { Pillar } from "@/shared/domain";
import type { Json } from "@/shared/supabase/database.types";
import { escapeLike } from "@/shared/supabase/like";
import type { Db } from "@/shared/supabase/token-client";
import { learningXp, summarizeSkill, type SkillSummary } from "./learning";

export interface Skill {
  id: string;
  name: string;
  pillar: Pillar;
  status: "active" | "paused" | "done";
}

const SKILL_COLUMNS = "id, name, pillar, status";

async function findSkill(db: Db, name: string): Promise<Skill | null> {
  // ILIKE without wildcards = case-insensitive equality, matching the unique index on lower(name).
  const { data, error } = await db.from("skills").select(SKILL_COLUMNS).ilike("name", escapeLike(name.trim())).maybeSingle();
  if (error) throw new Error(`finding the skill: ${error.message}`);
  return data as Skill | null;
}

/** "DSA" finds "dsa"; a new name creates the skill (default pillar: skills). */
export async function findOrCreateSkill(db: Db, name: string, pillar?: Pillar): Promise<{ skill: Skill; created: boolean }> {
  const existing = await findSkill(db, name);
  if (existing) return { skill: existing, created: false };

  const { data, error } = await db.from("skills").insert({ name: name.trim(), pillar: pillar ?? "skills" }).select(SKILL_COLUMNS).single();
  if (error?.code === "23505") {
    // Created by a simultaneous request a moment ago — use that one.
    const raced = await findSkill(db, name);
    if (raced) return { skill: raced, created: false };
  }
  if (error) throw new Error(`creating the skill: ${error.message}`);
  return { skill: data as Skill, created: true };
}

export interface NewSession {
  skill: string;
  /** Only used if the skill doesn't exist yet. */
  pillar?: Pillar;
  topic?: string | null;
  minutes: number;
  count?: number | null;
  unit?: string | null;
  confidence?: number | null;
  notes?: string | null;
  at?: string | null;
}

export async function logLearning(db: Db, session: NewSession) {
  const { skill, created } = await findOrCreateSkill(db, session.skill, session.pillar);
  const xp = learningXp(session.minutes, skill.pillar);
  // Generated RPC types mark every argument non-null; the SQL accepts null for the optional ones.
  const { data: id, error } = await db.rpc("record_learning", {
    p_skill_id: skill.id,
    p_topic: (session.topic ?? null) as string,
    p_minutes: session.minutes,
    p_count: (session.count ?? null) as number,
    p_unit: (session.unit ?? null) as string,
    p_confidence: (session.confidence ?? null) as number,
    p_notes: (session.notes ?? null) as string,
    p_at: (session.at ?? null) as string,
    p_xp: xp as unknown as Json,
  });
  if (error) throw new Error(`logging the session: ${error.message}`);
  return { sessionId: id, skill: skill.name, skillCreated: created, pillar: skill.pillar, xpEarned: xp[0]!.amount };
}

export interface SkillProgress {
  skill: Skill;
  summary: SkillSummary;
}

/** Every skill (or one, by name) with its progress and what's due for review. */
export async function loadLearning(db: Db, now: Date, skillName?: string, config = DEFAULT_CONFIG): Promise<SkillProgress[]> {
  let skillsQuery = db.from("skills").select(SKILL_COLUMNS).order("created_at");
  if (skillName) skillsQuery = skillsQuery.ilike("name", escapeLike(skillName.trim()));
  const { data: skills, error } = await skillsQuery;
  if (error) throw new Error(`loading skills: ${error.message}`);
  if (skills.length === 0) return [];

  const { data: sessions, error: sErr } = await db
    .from("learning_sessions")
    .select("skill_id, topic, minutes, count, unit, confidence, at")
    .in("skill_id", skills.map((s) => s.id));
  if (sErr) throw new Error(`loading sessions: ${sErr.message}`);

  return (skills as Skill[]).map((skill) => ({
    skill,
    summary: summarizeSkill(
      sessions.filter((x) => x.skill_id === skill.id).map((x) => ({ ...x, at: new Date(x.at) })),
      now,
      config,
    ),
  }));
}

export async function updateSkill(
  db: Db,
  name: string,
  changes: { status?: Skill["status"]; pillar?: Pillar; rename?: string; goalItemId?: string | null },
) {
  const skill = await findSkill(db, name);
  if (!skill) return { result: "not_found" as const };
  const { error } = await db
    .from("skills")
    .update({
      ...(changes.status ? { status: changes.status } : {}),
      ...(changes.pillar ? { pillar: changes.pillar } : {}),
      ...(changes.rename ? { name: changes.rename.trim() } : {}),
      ...(changes.goalItemId !== undefined ? { item_id: changes.goalItemId } : {}),
    })
    .eq("id", skill.id);
  if (error) throw new Error(`updating the skill: ${error.message}`);
  return { result: "updated" as const, skill: changes.rename?.trim() ?? skill.name };
}
