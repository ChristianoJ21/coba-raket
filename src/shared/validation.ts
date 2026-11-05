import { z } from "zod";

/** Request bodies are validated at the edge of every route handler. Never trust the client. */
export const createBookingBody = z.object({
  racketIds: z.array(z.uuid()).min(1).max(3),
  pickupAt: z.iso.datetime(),
  acceptedTermsVersion: z.string().min(1),
});
export type CreateBookingBody = z.infer<typeof createBookingBody>;

// Query strings from a plain HTML form send "" for untouched fields; treat those as "no filter".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : Array.isArray(v) ? v[0] : v), schema.optional());

/** GET /api/rackets and the /raket page filters (CAT-2). Unknown keys are ignored. */
export const catalogueQuery = z.object({
  level: optional(z.enum(["beginner", "intermediate", "advanced"])),
  maxWeight: optional(z.coerce.number().int().min(200).max(380)),
  grip: optional(z.string().regex(/^L[0-5]$/)),
  budget: optional(z.coerce.number().int().min(0).max(100_000_000)),
});
export type CatalogueQuery = z.infer<typeof catalogueQuery>;

/** Code printed on the QR sticker, e.g. R-004. Upper-cased so a hand-typed "r-004" still works. */
export const racketCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{1,20}$/);
