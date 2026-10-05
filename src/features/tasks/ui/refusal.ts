import { DEFAULT_CONFIG } from "@/shared/config";
import { localTimeOf } from "@/shared/time";
import type { Refusal } from "../tasks.repo";

const hm = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}` : `${minutes}m`);

/** A refusal in plain words, the same way Paddie would say it. */
export function refusalMessage(r: Refusal): string {
  if (r.result === "clash") {
    const c = r.clashes[0]!;
    const more = r.clashes.length > 1 ? ` (and ${r.clashes.length - 1} more)` : "";
    return `That overlaps ${c.title} at ${localTimeOf(c.start, DEFAULT_CONFIG.timeZone)}–${localTimeOf(c.end, DEFAULT_CONFIG.timeZone)}${more}. Pick another time, or tick "book it anyway".`;
  }
  return `That day is full: ${hm(r.room.committed)} of ${hm(r.room.capacity)} committed, only ${hm(r.room.available)} left and this needs ${hm(r.adding)}. Finish or drop something, or choose another day.`;
}
