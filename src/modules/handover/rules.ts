/** Handover rules (PRD HO-1 to HO-5). Pure functions only. */

export const CHECKLIST_ITEMS = ["frame", "throat", "grommets", "strings", "grip"] as const;
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

export interface HandoverInput {
  scannedRacketId: string;
  expectedRacketId: string;
  photos: { side: "front" | "back"; capturedLive: boolean }[];
  checklist: Partial<Record<ChecklistItem, boolean>>;
  idChecked: boolean; // HO-4: only a flag is stored, never the ID number or image
  customerConfirmed: boolean; // from the customer's verified phone
}

export type HandoverCheck = { ok: true } | { ok: false; problems: string[] };

export function checkHandover(input: HandoverInput): HandoverCheck {
  const problems: string[] = [];

  if (input.scannedRacketId !== input.expectedRacketId) {
    problems.push("Wrong racket: the scanned QR does not match this booking.");
  }

  const liveSides = new Set(input.photos.filter((p) => p.capturedLive).map((p) => p.side));
  for (const side of ["front", "back"] as const) {
    if (!liveSides.has(side)) problems.push(`A live ${side} photo is required (gallery uploads are not accepted).`);
  }

  for (const item of CHECKLIST_ITEMS) {
    if (!input.checklist[item]) problems.push(`Checklist item not completed: ${item}.`);
  }

  if (!input.idChecked) problems.push("ID has not been checked.");
  if (!input.customerConfirmed) problems.push("The customer has not confirmed from their verified phone.");

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
