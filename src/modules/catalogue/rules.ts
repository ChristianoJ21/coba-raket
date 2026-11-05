/** Catalogue rules. Pure functions only: no framework, database or adapter imports. */

export type Tier = 1 | 2 | 3;

/** Physical racket status (PRD ADM-1). Date availability is decided by bookings, not by this. */
export type RacketStatus = "ready" | "reserved" | "out" | "servicing" | "retired" | "sold";
export type ConditionGrade = "new" | "good" | "fair" | "retired";
export type PlayerLevel = "beginner" | "intermediate" | "advanced";

export interface Racket {
  id: string;
  code: string;
  brand: string;
  model: string;
  headSizeSqIn: number;
  weightG: number;
  gripSize?: string | null;
  stringPattern?: string | null;
  levelFit: PlayerLevel[];
  conditionGrade: ConditionGrade;
  status: RacketStatus;
  costIdr: number;
  salePriceIdr: number | null;
}

/** PRD section 7.2: Tier 1 under Rp1.5M, Tier 2 Rp1.5M to Rp3M inclusive, Tier 3 above Rp3M. */
export function tierForValue(costIdr: number): Tier {
  if (costIdr < 1_500_000) return 1;
  if (costIdr <= 3_000_000) return 2;
  return 3;
}

/** A racket may be offered in a trial only if it is in stock and in usable condition (PRD AI-2). */
export function isTrialEligible(racket: Pick<Racket, "status" | "conditionGrade">): boolean {
  return racket.status === "ready" && racket.conditionGrade !== "retired";
}

/** A row of `public.rackets` exactly as the database returns it. */
export interface RacketRow {
  id: string;
  code: string;
  brand: string;
  model: string;
  head_size_sq_in: number;
  weight_g: number;
  grip_size: string | null;
  string_pattern: string | null;
  level_fit: string[];
  condition_grade: ConditionGrade;
  status: RacketStatus;
  cost_idr: number;
  sale_price_idr: number | null;
}

const LEVELS: readonly PlayerLevel[] = ["beginner", "intermediate", "advanced"];

/** Map a database row to the domain type. Unknown level values are dropped, never guessed. */
export function racketFromRow(row: RacketRow): Racket {
  return {
    id: row.id,
    code: row.code,
    brand: row.brand,
    model: row.model,
    headSizeSqIn: row.head_size_sq_in,
    weightG: row.weight_g,
    gripSize: row.grip_size,
    stringPattern: row.string_pattern,
    levelFit: row.level_fit.filter((l): l is PlayerLevel => (LEVELS as readonly string[]).includes(l)),
    conditionGrade: row.condition_grade,
    status: row.status,
    costIdr: row.cost_idr,
    salePriceIdr: row.sale_price_idr,
  };
}

// ---------------------------------------------------------------------------
// Availability (CAT-1): when can a racket next be picked up?
// Booking periods come from booking_items.period and already include the turnaround day.
// ---------------------------------------------------------------------------
export interface Period {
  start: Date;
  end: Date; // exclusive
}

/** Parse a PostgreSQL tstzrange such as `["2026-11-07 02:00:00+00","2026-11-11 10:00:00+00")`. Returns null for empty or unbounded ranges. */
export function parseTstzRange(text: string): Period | null {
  const m = /^[[(]"?([^",]*)"?,"?([^")\]]*)"?[)\]]$/.exec(text.trim());
  if (!m || !m[1] || !m[2]) return null;
  const toDate = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  const start = toDate(m[1]);
  const end = toDate(m[2]);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { start, end };
}

/** Earliest moment at or after `now` that no period covers. Back-to-back periods are chained. */
export function nextFreeAt(periods: readonly Period[], now: Date): Date {
  let t = now;
  for (const p of [...periods].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    if (p.end <= t) continue;
    if (p.start > t) break;
    t = p.end;
  }
  return t;
}

export type Availability =
  | { kind: "now" }
  | { kind: "from"; at: Date }
  | { kind: "unavailable"; status: RacketStatus };

/** What the catalogue tells a customer about one racket. */
export function availabilityOf(
  racket: Pick<Racket, "status" | "conditionGrade">,
  periods: readonly Period[],
  now: Date,
): Availability {
  const free = nextFreeAt(periods, now);
  if (free > now && racket.conditionGrade !== "retired" && racket.status !== "servicing") {
    return { kind: "from", at: free };
  }
  return isTrialEligible(racket) ? { kind: "now" } : { kind: "unavailable", status: racket.status };
}

// ---------------------------------------------------------------------------
// Filters (CAT-2). Every filter is optional and they combine with AND.
// ---------------------------------------------------------------------------
export interface CatalogueFilters {
  level?: PlayerLevel;
  maxWeightG?: number;
  grip?: string;
  maxBudgetIdr?: number;
}

export function filterRackets<T extends Pick<Racket, "levelFit" | "weightG" | "gripSize" | "costIdr">>(
  rackets: readonly T[],
  f: CatalogueFilters,
): T[] {
  return rackets.filter(
    (r) =>
      (f.level === undefined || r.levelFit.includes(f.level)) &&
      (f.maxWeightG === undefined || r.weightG <= f.maxWeightG) &&
      (f.grip === undefined || r.gripSize === f.grip) &&
      (f.maxBudgetIdr === undefined || r.costIdr <= f.maxBudgetIdr),
  );
}
