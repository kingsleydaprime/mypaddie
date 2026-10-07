import { PlanLimitError } from "./plans";

/** For server actions: a plan limit becomes the form's error message; anything else is a real failure. */
export function planErrorMessage(error: unknown): string {
  if (error instanceof PlanLimitError) return error.message;
  throw error;
}
