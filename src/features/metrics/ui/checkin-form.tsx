import { SubmitButton } from "@/shared/ui/submit-button";
import { checkinAction } from "../metrics.actions";

type Checkin = { energy: number | null; mood: number | null; sleep_hours: number | null; screen_minutes: number | null } | null;

function Scale({ name, label, value, ends }: { name: string; label: string; value: number | null; ends: [string, string] }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex items-center gap-1.5">
        <span className="w-10 text-xs text-muted">{ends[0]}</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex-1">
            <input type="radio" name={name} value={n} defaultChecked={value === n} className="peer sr-only" />
            <span className="block rounded-lg border border-line py-1.5 text-center text-sm peer-checked:border-gold peer-checked:bg-gold peer-checked:font-semibold peer-checked:text-on-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold">{n}</span>
          </label>
        ))}
        <span className="w-10 text-right text-xs text-muted">{ends[1]}</span>
      </div>
    </fieldset>
  );
}

/** Today's check-in. Anything left blank stays as it was. */
export function CheckinForm({ current }: { current: Checkin }) {
  return (
    <form action={checkinAction} className="flex flex-col gap-3">
      <Scale name="energy" label="Energy" value={current?.energy ?? null} ends={["empty", "great"]} />
      <Scale name="mood" label="Mood" value={current?.mood ?? null} ends={["awful", "great"]} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Slept (hours)
          <input name="sleep" type="number" inputMode="decimal" min={0} max={24} step={0.5} defaultValue={current?.sleep_hours ?? ""} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-base font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Screen time (hours)
          <input name="screen" type="number" inputMode="decimal" min={0} max={24} step={0.25} defaultValue={current?.screen_minutes != null ? Math.round(current.screen_minutes / 6) / 10 : ""} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-base font-normal" />
        </label>
      </div>
      <SubmitButton className="self-start rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-on-gold">Save check-in</SubmitButton>
    </form>
  );
}
