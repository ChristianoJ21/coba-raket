import { describe, expect, it } from "vitest";
import { backoffMs, processOutbox, type Anchorer, type OutboxJob, type OutboxStore } from "./outbox";
import { buildNextEvent } from "./rules";

const event = buildNextEvent(null, {
  racketId: "r1",
  type: "intake",
  payload: {},
  salt: `0x${"1".repeat(64)}`,
});

function fakeStore(jobs: OutboxJob[]) {
  const sent: { id: string; uid: string }[] = [];
  const failed: { id: string; error: string; attempts: number; next: Date }[] = [];
  const store: OutboxStore = {
    claimDue: async () => jobs,
    markSent: async (id, uid) => void sent.push({ id, uid }),
    markFailed: async (id, error, attempts, next) => void failed.push({ id, error, attempts, next }),
  };
  return { store, sent, failed };
}

const now = new Date("2026-11-04T09:00:00Z");

describe("backoffMs", () => {
  it("doubles each attempt and caps at six hours", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(30)).toBe(6 * 60 * 60 * 1000);
  });
});

describe("processOutbox", () => {
  it("marks jobs as sent with the attestation UID", async () => {
    const { store, sent } = fakeStore([{ id: "j1", attempts: 0, event }]);
    const chain: Anchorer = { anchor: async () => ({ attestationUid: "0xabc" }) };
    const r = await processOutbox({ store, chain, now: () => now });
    expect(r).toEqual({ sent: 1, failed: 0 });
    expect(sent).toEqual([{ id: "j1", uid: "0xabc" }]);
  });

  it("keeps going and schedules a retry when the chain is down", async () => {
    const { store, sent, failed } = fakeStore([
      { id: "j1", attempts: 2, event },
      { id: "j2", attempts: 0, event },
    ]);
    let calls = 0;
    const chain: Anchorer = {
      anchor: async () => {
        calls += 1;
        if (calls === 1) throw new Error("RPC unavailable");
        return { attestationUid: "0xdef" };
      },
    };
    const r = await processOutbox({ store, chain, now: () => now });
    expect(r).toEqual({ sent: 1, failed: 1 });
    expect(failed[0]).toMatchObject({ id: "j1", error: "RPC unavailable", attempts: 3 });
    expect(failed[0]?.next.getTime()).toBe(now.getTime() + backoffMs(3));
    expect(sent).toEqual([{ id: "j2", uid: "0xdef" }]);
  });
});
