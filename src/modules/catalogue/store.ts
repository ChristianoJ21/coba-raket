import type { SupabaseClient } from "@supabase/supabase-js";
import { racketFromRow, type Racket, type RacketRow } from "./rules";

const COLUMNS =
  "id, code, brand, model, head_size_sq_in, weight_g, grip_size, string_pattern, level_fit, condition_grade, status, cost_idr, sale_price_idr";

/** Rackets customers can see: everything except sold and retired. Every value comes from the database (CAT-1). */
export async function listCatalogue(db: SupabaseClient): Promise<Racket[]> {
  const { data, error } = await db
    .from("rackets")
    .select(COLUMNS)
    .not("status", "in", "(sold,retired)")
    .order("code", { ascending: true });
  if (error) throw new Error(`Could not load the catalogue: ${error.message}`);
  return (data as RacketRow[]).map(racketFromRow);
}
