import { describe, expect, it } from "vitest";
import { checkHandover, type HandoverInput } from "./rules";

const complete: HandoverInput = {
  scannedRacketId: "r1",
  expectedRacketId: "r1",
  photos: [
    { side: "front", capturedLive: true },
    { side: "back", capturedLive: true },
  ],
  checklist: { frame: true, throat: true, grommets: true, strings: true, grip: true },
  idChecked: true,
  customerConfirmed: true,
};

describe("checkHandover", () => {
  it("passes a complete handover", () => {
    expect(checkHandover(complete)).toEqual({ ok: true });
  });

  it("blocks the wrong racket", () => {
    const r = checkHandover({ ...complete, scannedRacketId: "r2" });
    expect(r).toMatchObject({ ok: false });
  });

  it("rejects gallery photos and missing sides", () => {
    const r = checkHandover({ ...complete, photos: [{ side: "front", capturedLive: true }, { side: "back", capturedLive: false }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain("back");
  });

  it("requires every checklist item", () => {
    const r = checkHandover({ ...complete, checklist: { frame: true } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toHaveLength(4);
  });

  it("requires the ID flag and the customer's confirmation", () => {
    const r = checkHandover({ ...complete, idChecked: false, customerConfirmed: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toHaveLength(2);
  });
});
