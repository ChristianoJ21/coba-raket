import { z } from "zod";

/** Request bodies are validated at the edge of every route handler. Never trust the client. */
export const createBookingBody = z.object({
  racketIds: z.array(z.uuid()).min(1).max(3),
  pickupAt: z.iso.datetime(),
  acceptedTermsVersion: z.string().min(1),
});
export type CreateBookingBody = z.infer<typeof createBookingBody>;
