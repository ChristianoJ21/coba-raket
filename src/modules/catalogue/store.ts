import type { SupabaseClient } from "@supabase/supabase-js";
import { availabilityOf, parseTstzRange, racketFromRow, type Availability, type Period, type Racket, type RacketRow } from "./rules";

const COLUMNS =
  "id, code, brand, model, head_size_sq_in, weight_g, grip_size, string_pattern, level_fit, condition_grade, status, cost_idr, sale_price_idr";

export interface CatalogueEntry {
  racket: Racket;
  availability: Availability;
}

/**
 * Booking periods per racket. Only racket_id and period are read: never who booked it.
 * Uses the service-role client because booking_items are not public under RLS.
 */
async function periodsByRacket(db: SupabaseClient, racketIds: string[], now: Date): Promise<Map<string, Period[]>> {
  const map = new Map<string, Period[]>();
  if (racketIds.length === 0) return map;
  const { data, error } = await db.from("booking_items").select("racket_id, period").eq("active", true).in("racket_id", racketIds);
  if (error) throw new Error(`Could not load availability: ${error.message}`);
  for (const row of data as { racket_id: string; period: string }[]) {
    const p = parseTstzRange(row.period);
    if (!p || p.end <= now) continue;
    map.set(row.racket_id, [...(map.get(row.racket_id) ?? []), p]);
  }
  return map;
}

async function withAvailability(db: SupabaseClient, rows: RacketRow[], now: Date): Promise<CatalogueEntry[]> {
  const rackets = rows.map(racketFromRow);
  const periods = await periodsByRacket(db, rackets.map((r) => r.id), now);
  return rackets.map((racket) => ({ racket, availability: availabilityOf(racket, periods.get(racket.id) ?? [], now) }));
}

/** Rackets customers can see: everything except sold and retired. Every value comes from the database (CAT-1). */
export async function listCatalogue(db: SupabaseClient, now: Date = new Date()): Promise<CatalogueEntry[]> {
  const { data, error } = await db
    .from("rackets")
    .select(COLUMNS)
    .not("status", "in", "(sold,retired)")
    .order("code", { ascending: true });
  if (error) throw new Error(`Could not load the catalogue: ${error.message}`);
  return withAvailability(db, data as RacketRow[], now);
}

/** One racket by its printed code (the QR sticker), in any status. Null when the code is unknown (CAT-3). */
export async function getRacketByCode(db: SupabaseClient, code: string, now: Date = new Date()): Promise<CatalogueEntry | null> {
  const { data, error } = await db.from("rackets").select(COLUMNS).eq("code", code).maybeSingle();
  if (error) throw new Error(`Could not load racket ${code}: ${error.message}`);
  if (!data) return null;
  const [entry] = await withAvailability(db, [data as RacketRow], now);
  return entry ?? null;
}
