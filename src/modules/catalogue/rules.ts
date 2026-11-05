/** Catalogue rules. Pure functions only: no framework, database or adapter imports. */

export type Tier = 1 | 2 | 3;

export type RacketStatus = "available" | "in_trial" | "maintenance" | "sold" | "retired";
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
  return racket.status === "available" && racket.conditionGrade !== "retired";
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
