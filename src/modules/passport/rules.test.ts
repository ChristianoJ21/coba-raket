import { describe, expect, it } from "vitest";
import {
  ZERO_HASH,
  buildNextEvent,
  canonicalize,
  hashEvent,
  verifyChain,
  type Hex,
  type PassportEvent,
} from "./rules";

const salt = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;

function history(): PassportEvent[] {
  const e1 = buildNextEvent(null, { racketId: "r1", type: "intake", payload: { grade: "good" }, salt: salt(1) });
  const e2 = buildNextEvent(e1, { racketId: "r1", type: "trial", payload: { days: 3 }, salt: salt(2) });
  const e3 = buildNextEvent(e2, { racketId: "r1", type: "inspection", payload: { grade: "normal_wear" }, salt: salt(3) });
  return [e1, e2, e3];
}

describe("canonicalize", () => {
  it("sorts keys at every level so key order never changes the result", () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }));
    expect(canonicalize({ b: 1, a: [1, { y: 1, x: 2 }] })).toBe('{"a":[1,{"x":2,"y":1}],"b":1}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalize({ a: Number.NaN })).toThrow(TypeError);
  });
});

describe("buildNextEvent", () => {
  it("starts at seq 1 with a zero previous hash", () => {
    const [first] = history();
    expect(first).toMatchObject({ seq: 1, prevHash: ZERO_HASH });
    expect(first?.eventHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("links each event to the one before it", () => {
    const [e1, e2, e3] = history();
    expect(e2?.seq).toBe(2);
    expect(e2?.prevHash).toBe(e1?.eventHash);
    expect(e3?.prevHash).toBe(e2?.eventHash);
  });

  it("gives different hashes for the same content with a different salt", () => {
    const a = buildNextEvent(null, { racketId: "r1", type: "intake", payload: { grade: "good" }, salt: salt(1) });
    const b = buildNextEvent(null, { racketId: "r1", type: "intake", payload: { grade: "good" }, salt: salt(2) });
    expect(a.eventHash).not.toBe(b.eventHash);
  });

  it("is deterministic", () => {
    const [e1] = history();
    expect(e1 && hashEvent(e1)).toBe(e1?.eventHash);
  });
});

describe("verifyChain", () => {
  it("accepts an intact history, in any order", () => {
    const h = history();
    expect(verifyChain("r1", h)).toEqual({ ok: true, length: 3 });
    expect(verifyChain("r1", [...h].reverse())).toEqual({ ok: true, length: 3 });
  });

  it("accepts an empty history", () => {
    expect(verifyChain("r1", [])).toEqual({ ok: true, length: 0 });
  });

  it("detects an edited event", () => {
    const h = history();
    h[1] = { ...h[1]!, payload: { ...h[1]!.payload, days: 1 } };
    expect(verifyChain("r1", h)).toEqual({ ok: false, atSeq: 2, reason: "HASH_MISMATCH" });
  });

  it("detects a missing middle event as a gap", () => {
    const h = history();
    expect(verifyChain("r1", [h[0]!, h[2]!])).toEqual({ ok: false, atSeq: 2, reason: "GAP" });
  });

  it("detects a rewritten event whose hash was recomputed but whose link no longer matches", () => {
    const h = history();
    const forged = buildNextEvent(null, { racketId: "r1", type: "intake", payload: { grade: "new" }, salt: salt(9) });
    // Replace event 1 with a forged one: event 2 still points at the old hash.
    expect(verifyChain("r1", [forged, h[1]!, h[2]!])).toEqual({ ok: false, atSeq: 2, reason: "PREV_HASH_MISMATCH" });
  });

  it("detects an event that belongs to another racket", () => {
    const other = buildNextEvent(null, { racketId: "r2", type: "intake", payload: {}, salt: salt(5) });
    expect(verifyChain("r1", [other])).toEqual({ ok: false, atSeq: 1, reason: "WRONG_RACKET" });
  });

  it("cannot detect a truncated tail from the chain alone", () => {
    // Truncating the tail leaves a valid shorter chain. This is why the latest attestation
    // (sequence number) is checked against the chain on the public page.
    const h = history();
    expect(verifyChain("r1", h.slice(0, 2))).toEqual({ ok: true, length: 2 });
  });
});
