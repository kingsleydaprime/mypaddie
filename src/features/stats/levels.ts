/**
 * Levels get steeper as you go: level n starts at 100·(n−1)² XP.
 *   level 1: 0 · level 2: 100 · level 3: 400 · level 4: 900 · level 5: 1600
 * So early levels come quickly and later ones mean something.
 */
export function levelFor(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function xpForLevel(level: number): number {
  return 100 * (level - 1) ** 2;
}

export interface LevelProgress {
  level: number;
  xp: number;
  /** XP still needed to reach the next level. */
  toNext: number;
  /** 0–1 through the current level. */
  progress: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFor(xp);
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const clamped = Math.max(0, xp);
  return { level, xp, toNext: next - clamped, progress: (clamped - start) / (next - start) };
}
