/**
 * Database guarantee tests. They run against a real PostgreSQL server and are SKIPPED unless
 * TEST_DATABASE_URL is set. The database is wiped and rebuilt, so the name must contain "test".
 *
 *   TEST_DATABASE_URL=postgres://localhost:5432/coba_test npm run test:db
 */
import { readdirSync, readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildNextEvent, type Hex } from "@/modules/passport";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("database guarantees", () => {
  let pool: Pool;

  const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pool.query(sql, params)).rows as T[];

  async function asUser<T>(userId: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
      return await fn(c);
    } finally {
      await c.query("rollback");
      c.release();
    }
  }

  beforeAll(async () => {
    const dbName = new URL(url as string).pathname;
    if (!/test/i.test(dbName)) throw new Error(`Refusing to wipe "${dbName}": the database name must contain "test".`);
    pool = new Pool({ connectionString: url });
    await pool.query("drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;");
    await pool.query("create extension if not exists pgcrypto");
    await pool.query(readFileSync("tests/db-setup.sql", "utf8"));
    // Apply every migration in order, exactly as a real project would receive them.
    for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
      await pool.query(readFileSync(`supabase/migrations/${file}`, "utf8"));
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  // --- fixtures -----------------------------------------------------------
  const uuid = () => crypto.randomUUID();

  async function user(role: "customer" | "operator" | "admin" = "customer") {
    const id = uuid();
    await pool.query("insert into auth.users (id) values ($1)", [id]);
    await pool.query("insert into profiles (id, role) values ($1, $2)", [id, role]);
    return id;
  }

  async function racket(code: string) {
    const [r] = await rows<{ id: string }>(
      `insert into rackets (code, brand, model, head_size_sq_in, weight_g, cost_idr)
       values ($1, 'Brand', 'Model', 100, 280, 1200000) returning id`,
      [code],
    );
    return (r as { id: string }).id;
  }

  async function booking(customerId: string) {
    const [b] = await rows<{ id: string }>(
      `insert into bookings (customer_id, pickup_at, due_at, fee_idr, deposit_idr)
       values ($1, '2026-12-01T02:00Z', '2026-12-04T02:00Z', 50000, 250000) returning id`,
      [customerId],
    );
    return (b as { id: string }).id;
  }

  const item = (bookingId: string, racketId: string, from: string, to: string, active = true) =>
    pool.query(
      `insert into booking_items (booking_id, racket_id, period, active)
       values ($1, $2, tstzrange($3::timestamptz, $4::timestamptz), $5)`,
      [bookingId, racketId, from, to, active],
    );

  // --- double booking -----------------------------------------------------
  describe("double booking", () => {
    it("rejects an overlapping period for the same racket", async () => {
      const c = await user();
      const r = await racket("R-DB1");
      await item(await booking(c), r, "2026-12-01T02:00Z", "2026-12-05T02:00Z");
      await expect(item(await booking(c), r, "2026-12-04T00:00Z", "2026-12-08T00:00Z")).rejects.toThrow(/no_double_booking/);
    });

    it("allows back-to-back periods and different rackets", async () => {
      const c = await user();
      const [r1, r2] = [await racket("R-DB2"), await racket("R-DB3")];
      await item(await booking(c), r1, "2026-12-01T02:00Z", "2026-12-05T02:00Z");
      await item(await booking(c), r1, "2026-12-05T02:00Z", "2026-12-09T02:00Z"); // starts exactly when the first ends
      await item(await booking(c), r2, "2026-12-01T02:00Z", "2026-12-05T02:00Z");
    });

    it("frees the racket once a booking item is no longer active", async () => {
      const c = await user();
      const r = await racket("R-DB4");
      await item(await booking(c), r, "2026-12-01T02:00Z", "2026-12-05T02:00Z", false);
      await item(await booking(c), r, "2026-12-02T02:00Z", "2026-12-06T02:00Z");
    });

    it("lets exactly one of many concurrent overlapping requests win", async () => {
      const c = await user();
      const r = await racket("R-DB5");
      const bookings = await Promise.all(Array.from({ length: 8 }, () => booking(c)));
      const results = await Promise.allSettled(bookings.map((b) => item(b, r, "2027-01-01T02:00Z", "2027-01-05T02:00Z")));
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((x) => x.status === "rejected")).toHaveLength(7);
    });

    it("allows at most three rackets in one booking", async () => {
      const c = await user();
      const b = await booking(c);
      for (const n of [1, 2, 3]) await item(b, await racket(`R-MAX${n}`), "2027-02-01T02:00Z", "2027-02-05T02:00Z");
      await expect(item(b, await racket("R-MAX4"), "2027-02-01T02:00Z", "2027-02-05T02:00Z")).rejects.toThrow(/at most 3/);
    });
  });

  // --- ledger -------------------------------------------------------------
  describe("ledger", () => {
    it("is append-only and rejects non-positive amounts and repeated idempotency keys", async () => {
      const b = await booking(await user());
      const add = (key: string, amount = 50000) =>
        pool.query("insert into ledger_entries (booking_id, kind, amount_idr, idempotency_key) values ($1, 'trial_fee', $2, $3)", [b, amount, key]);

      await add("k1");
      await expect(add("k1")).rejects.toThrow(/idempotency_key|duplicate/);
      await expect(add("k2", 0)).rejects.toThrow(/amount_idr/);
      await expect(add("k3", -5)).rejects.toThrow(/amount_idr/);
      await expect(pool.query("update ledger_entries set amount_idr = 1 where booking_id = $1", [b])).rejects.toThrow(/append-only/);
      await expect(pool.query("delete from ledger_entries where booking_id = $1", [b])).rejects.toThrow(/append-only/);
    });
  });

  // --- passport -----------------------------------------------------------
  describe("passport chain", () => {
    const insert = (e: ReturnType<typeof buildNextEvent>, racketUuid: string) =>
      pool.query(
        `insert into passport_events (racket_id, seq, event_type, payload, event_hash, prev_hash)
         values ($1, $2, $3, $4, $5, $6)`,
        [racketUuid, e.seq, e.eventType, e.payload, e.eventHash, e.prevHash],
      );
    const salt = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;

    it("accepts events built by the TypeScript hash code and enforces the order", async () => {
      const r = await racket("R-PP1");
      const e1 = buildNextEvent(null, { racketId: r, type: "intake", payload: { grade: "good" }, salt: salt(1) });
      const e2 = buildNextEvent(e1, { racketId: r, type: "trial", payload: {}, salt: salt(2) });
      await insert(e1, r);
      await insert(e2, r);
      expect(await rows("select seq from passport_events where racket_id = $1 order by seq", [r])).toEqual([{ seq: 1 }, { seq: 2 }]);
    });

    it("rejects a first event that does not start the chain", async () => {
      const r = await racket("R-PP2");
      const wrongSeq = buildNextEvent({ seq: 4, eventHash: salt(7) }, { racketId: r, type: "intake", payload: {}, salt: salt(3) });
      await expect(insert(wrongSeq, r)).rejects.toThrow(/First passport event/);
    });

    it("rejects a gap and a wrong previous hash", async () => {
      const r = await racket("R-PP3");
      const e1 = buildNextEvent(null, { racketId: r, type: "intake", payload: {}, salt: salt(4) });
      await insert(e1, r);
      const gap = buildNextEvent({ seq: 2, eventHash: e1.eventHash }, { racketId: r, type: "trial", payload: {}, salt: salt(5) });
      await expect(insert(gap, r)).rejects.toThrow(/chain broken/);
      const wrongPrev = buildNextEvent({ seq: 1, eventHash: salt(99) }, { racketId: r, type: "trial", payload: {}, salt: salt(6) });
      await expect(insert(wrongPrev, r)).rejects.toThrow(/chain broken/);
    });

    it("is append-only", async () => {
      const r = await racket("R-PP4");
      await insert(buildNextEvent(null, { racketId: r, type: "intake", payload: {}, salt: salt(8) }), r);
      await expect(pool.query("update passport_events set payload = '{}' where racket_id = $1", [r])).rejects.toThrow(/append-only/);
      await expect(pool.query("delete from passport_events where racket_id = $1", [r])).rejects.toThrow(/append-only/);
    });

    it("lets two simultaneous inserts of the same sequence number produce exactly one winner", async () => {
      const r = await racket("R-PP5");
      const a = buildNextEvent(null, { racketId: r, type: "intake", payload: { who: "a" }, salt: salt(10) });
      const b = buildNextEvent(null, { racketId: r, type: "intake", payload: { who: "b" }, salt: salt(11) });
      const res = await Promise.allSettled([insert(a, r), insert(b, r)]);
      expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    });
  });

  // --- row-level security -------------------------------------------------
  describe("row-level security", () => {
    it("lets customers read only their own bookings", async () => {
      const [alice, bob] = [await user(), await user()];
      const aliceBooking = await booking(alice);
      await booking(bob);
      const seen = await asUser(alice, (c) => c.query("select id from bookings"));
      expect(seen.rows).toEqual([{ id: aliceBooking }]);
    });

    it("lets staff read every booking", async () => {
      const [alice, op] = [await user(), await user("operator")];
      await booking(alice);
      const seen = await asUser(op, (c) => c.query("select id from bookings"));
      expect(seen.rowCount).toBeGreaterThan(0);
    });

    it("makes the catalogue and passport public but nothing else", async () => {
      await racket("R-RLS1");
      const catalogue = await asUser(null, (c) => c.query("select id from rackets"));
      expect(catalogue.rowCount).toBeGreaterThan(0);
      const bookings = await asUser(null, (c) => c.query("select id from bookings"));
      expect(bookings.rowCount).toBe(0);
    });

    it("gives signed-in users no write access at all", async () => {
      const alice = await user();
      await asUser(alice, async (c) => {
        await expect(c.query("insert into bookings (customer_id, pickup_at, due_at, fee_idr, deposit_idr) values ($1, now(), now() + interval '3 days', 0, 0)", [alice])).rejects.toThrow();
      });
      await asUser(alice, async (c) => {
        await expect(c.query("update rackets set status = 'sold'")).resolves.toMatchObject({ rowCount: 0 });
      });
    });
  });

  describe("racket status (PRD ADM-1)", () => {
    it("defaults new rackets to ready", async () => {
      const id = await racket("R-ST1");
      const statuses = await rows<{ status: string }>("select status from rackets where id = $1", [id]);
      expect(statuses).toEqual([{ status: "ready" }]);
    });

    it("accepts exactly the six PRD statuses", async () => {
      const id = await racket("R-ST2");
      for (const status of ["ready", "reserved", "out", "servicing", "retired", "sold"]) {
        await expect(pool.query("update rackets set status = $1 where id = $2", [status, id])).resolves.toBeDefined();
      }
      for (const status of ["available", "in_trial", "maintenance", "READY"]) {
        await expect(pool.query("update rackets set status = $1 where id = $2", [status, id])).rejects.toThrow(/rackets_status_check/);
      }
    });
  });
});
