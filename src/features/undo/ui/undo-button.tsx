"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/shared/ui/submit-button";
import { undoAction, type UndoState } from "../undo.actions";

export function UndoButton({ kind, id, title }: { kind: string; id: string; title: string }) {
  const [state, action] = useActionState<UndoState, FormData>(undoAction, null);
  if (state && "message" in state) return <span className="shrink-0 text-sm text-muted" role="status">{state.message}</span>;
  return (
    <form action={action} className="flex shrink-0 flex-col items-end">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton aria-label={`Undo "${title}"`} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold">Undo</SubmitButton>
      {state && "error" in state && <span className="mt-1 text-xs text-red" role="alert">{state.error}</span>}
    </form>
  );
}
