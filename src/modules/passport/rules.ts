/**
 * Racket Passport rules (PRD section 9). Pure functions only, and safe to run in the browser:
 * the public passport page imports verifyChain to re-check the history on the visitor's device (PP-4).
 *
 * Each event commits to the racket, its position, its content and the previous event's hash,
 * so editing or removing any stored event breaks every hash after it.
 * The chain proves tamper-evidence, not honesty: it cannot tell whether the operator recorded
 * the truth in the first place.
 */
import { keccak256, toBytes } from "viem";

export type Hex = `0x${string}`;
export const ZERO_HASH: Hex = `0x${"0".repeat(64)}`;

export const EVENT_TYPES = {
  intake: 1,
  trial: 2,
  inspection: 3,
  damage: 4,
  restring: 5,
  repair: 6,
  sale: 7,
  retirement: 8,
} as const;
export type EventName = keyof typeof EVENT_TYPES;

/** JSON values allowed in an event payload. No personal data may ever be placed here. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface PassportEvent {
  racketId: string;
  seq: number;
  eventType: number;
  /** Includes a random `salt` so low-entropy content cannot be guessed from the hash alone. */
  payload: { [key: string]: Json };
  prevHash: Hex;
  eventHash: Hex;
}

/** Deterministic JSON: keys sorted at every level, so the same content always gives the same bytes. */
export function canonicalize(value: Json): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Non-finite number in payload");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k] as Json)}`).join(",")}}`;
}

export function hashEvent(e: Pick<PassportEvent, "racketId" | "seq" | "eventType" | "payload" | "prevHash">): Hex {
  const body = canonicalize({
    racketId: e.racketId,
    seq: e.seq,
    eventType: e.eventType,
    payload: e.payload,
    prevHash: e.prevHash,
  });
  return keccak256(toBytes(body));
}

export interface NewEventInput {
  racketId: string;
  type: EventName;
  payload: { [key: string]: Json };
  /** 32 random bytes as hex, supplied by the caller so this function stays pure and testable. */
  salt: Hex;
}

/** Builds the next event on top of the racket's latest event (or null for the first one). */
export function buildNextEvent(
  latest: Pick<PassportEvent, "seq" | "eventHash"> | null,
  input: NewEventInput,
): PassportEvent {
  const seq = latest ? latest.seq + 1 : 1;
  const prevHash = latest ? latest.eventHash : ZERO_HASH;
  const eventType = EVENT_TYPES[input.type];
  const payload = { ...input.payload, salt: input.salt };
  return { racketId: input.racketId, seq, eventType, payload, prevHash, eventHash: hashEvent({ racketId: input.racketId, seq, eventType, payload, prevHash }) };
}

export type ChainResult =
  | { ok: true; length: number }
  | { ok: false; atSeq: number; reason: "GAP" | "PREV_HASH_MISMATCH" | "HASH_MISMATCH" | "WRONG_RACKET" };

/**
 * Verifies a racket's full history, given in any order.
 * Detects: a missing event (GAP), an edited event (HASH_MISMATCH), a re-linked or reordered event
 * (PREV_HASH_MISMATCH), and an event from another racket (WRONG_RACKET).
 */
export function verifyChain(racketId: string, events: readonly PassportEvent[]): ChainResult {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  let prev: Hex = ZERO_HASH;
  let expectedSeq = 1;

  for (const e of ordered) {
    if (e.racketId !== racketId) return { ok: false, atSeq: e.seq, reason: "WRONG_RACKET" };
    if (e.seq !== expectedSeq) return { ok: false, atSeq: expectedSeq, reason: "GAP" };
    if (e.prevHash !== prev) return { ok: false, atSeq: e.seq, reason: "PREV_HASH_MISMATCH" };
    if (hashEvent(e) !== e.eventHash) return { ok: false, atSeq: e.seq, reason: "HASH_MISMATCH" };
    prev = e.eventHash;
    expectedSeq += 1;
  }
  return { ok: true, length: ordered.length };
}
