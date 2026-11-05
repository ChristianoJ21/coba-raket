/**
 * Outbox processing for anchoring passport events on-chain (PRD PP-3, PP-6).
 * A chain outage must never block a handover: events are saved first, then anchored later with retries.
 * Dependencies are injected so this is fully testable without a database or a blockchain.
 */
import type { PassportEvent } from "./rules";

export interface OutboxJob {
  id: string;
  attempts: number;
  event: PassportEvent;
}

export interface OutboxStore {
  /** Jobs that are pending or failed and due now, oldest first. */
  claimDue(now: Date, limit: number): Promise<OutboxJob[]>;
  markSent(id: string, attestationUid: string): Promise<void>;
  markFailed(id: string, error: string, attempts: number, nextAttemptAt: Date): Promise<void>;
}

export interface Anchorer {
  anchor(event: PassportEvent): Promise<{ attestationUid: string }>;
}

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

/** Exponential backoff: 30s, 1m, 2m, 4m ... capped at 6 hours. */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
}

export interface RunResult {
  sent: number;
  failed: number;
}

export async function processOutbox(
  deps: { store: OutboxStore; chain: Anchorer; now: () => Date },
  limit = 20,
): Promise<RunResult> {
  const jobs = await deps.store.claimDue(deps.now(), limit);
  const result: RunResult = { sent: 0, failed: 0 };

  // Events of one racket must be anchored in order, so jobs are processed one at a time.
  for (const job of jobs) {
    try {
      const { attestationUid } = await deps.chain.anchor(job.event);
      await deps.store.markSent(job.id, attestationUid);
      result.sent += 1;
    } catch (err) {
      const attempts = job.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      await deps.store.markFailed(job.id, message, attempts, new Date(deps.now().getTime() + backoffMs(attempts)));
      result.failed += 1;
    }
  }
  return result;
}
