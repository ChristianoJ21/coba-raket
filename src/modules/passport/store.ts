/**
 * Supabase-backed outbox store. Uses the service client, so it is server and worker code only.
 * Single-worker assumption: run one worker at a time (or add `for update skip locked` via an RPC
 * before scaling to several).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutboxJob, OutboxStore } from "./outbox";
import type { Hex, PassportEvent } from "./rules";

interface EventRow {
  racket_id: string;
  seq: number;
  event_type: number;
  payload: PassportEvent["payload"];
  event_hash: Hex;
  prev_hash: Hex;
}

interface OutboxRow {
  id: string;
  attempts: number;
  passport_events: EventRow | EventRow[] | null;
}

export function toEvent(row: EventRow): PassportEvent {
  return {
    racketId: row.racket_id,
    seq: row.seq,
    eventType: row.event_type,
    payload: row.payload,
    eventHash: row.event_hash,
    prevHash: row.prev_hash,
  };
}

export function createOutboxStore(db: SupabaseClient): OutboxStore {
  return {
    async claimDue(now: Date, limit: number): Promise<OutboxJob[]> {
      const { data, error } = await db
        .from("passport_outbox")
        .select("id, attempts, passport_events(racket_id, seq, event_type, payload, event_hash, prev_hash)")
        .neq("status", "sent")
        .lte("next_attempt_at", now.toISOString())
        .order("next_attempt_at", { ascending: true })
        .limit(limit)
        .returns<OutboxRow[]>();
      if (error) throw new Error(`Could not read outbox: ${error.message}`);

      const jobs: OutboxJob[] = [];
      for (const row of data ?? []) {
        const ev = Array.isArray(row.passport_events) ? row.passport_events[0] : row.passport_events;
        if (ev) jobs.push({ id: row.id, attempts: row.attempts, event: toEvent(ev) });
      }
      // Anchor each racket's events in sequence order.
      return jobs.sort((a, b) =>
        a.event.racketId === b.event.racketId ? a.event.seq - b.event.seq : 0,
      );
    },

    async markSent(id, attestationUid) {
      const { error } = await db
        .from("passport_outbox")
        .update({ status: "sent", attestation_uid: attestationUid, last_error: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Could not mark outbox job sent: ${error.message}`);
    },

    async markFailed(id, message, attempts, nextAttemptAt) {
      const { error } = await db
        .from("passport_outbox")
        .update({
          status: "failed",
          attempts,
          last_error: message.slice(0, 500),
          next_attempt_at: nextAttemptAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(`Could not mark outbox job failed: ${error.message}`);
    },
  };
}
