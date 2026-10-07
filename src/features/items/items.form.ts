import { z } from "zod";
import { TIERS } from "@/shared/domain";
import { parseAmount } from "@/shared/format";

// Optional because each tier hides some fields: a hidden input isn't in the form at all.
const optionalText = z.string().trim().optional().transform((v) => v || null);
const optionalNaira = z
  .string()
  .trim()
  .optional()
  .transform((v) => (!v ? null : parseAmount(v)))
  .pipe(z.number().int().nonnegative().nullable());

export const itemFormSchema = z.object({
  tier: z.enum(TIERS),
  title: z.string().trim().min(1, "Give it a name"),
  target: optionalText,
  deadline: optionalText.pipe(z.iso.date().nullable()),
  floor_amount: optionalNaira,
  comfortable_amount: optionalNaira,
});

export const editItemSchema = itemFormSchema.extend({ id: z.uuid() });
