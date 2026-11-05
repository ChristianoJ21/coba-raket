/**
 * Matcher rules (PRD section 8). Code decides what is allowed; a model may only explain the result.
 * Pure functions only, so the shortlist works with the LLM switched off (PRD AI-4).
 */
import { isTrialEligible, tierForValue, type PlayerLevel, type Racket } from "@/modules/catalogue";

export type Frequency = "never" | "monthly" | "weekly" | "multi_weekly";
export type Feel = "easy_swing" | "balanced" | "power" | "unsure";

export interface MatchAnswers {
  level: PlayerLevel;
  frequency: Frequency;
  feel: Feel;
}

export type ShortlistRole = "lighter" | "balanced" | "step_up";

export interface Pick {
  racket: Racket;
  role: ShortlistRole;
  score: number;
}

interface Target {
  weightG: number;
  headSizeSqIn: number;
}

/** Target specs by how the player wants the racket to feel, nudged by level. Tunable after real trials. */
export function targetFor(answers: MatchAnswers): Target {
  const base: Record<Feel, Target> = {
    easy_swing: { weightG: 265, headSizeSqIn: 105 },
    balanced: { weightG: 280, headSizeSqIn: 100 },
    power: { weightG: 295, headSizeSqIn: 98 },
    unsure: { weightG: 275, headSizeSqIn: 102 },
  };
  const t = { ...base[answers.feel] };
  if (answers.level === "beginner") {
    t.weightG -= 5;
    t.headSizeSqIn += 2;
  } else if (answers.level === "advanced") {
    t.weightG += 5;
    t.headSizeSqIn -= 2;
  }
  // Someone who plays rarely is better served by a lighter, more forgiving racket.
  if (answers.frequency === "never" || answers.frequency === "monthly") t.weightG -= 3;
  return t;
}

export function scoreRacket(racket: Racket, answers: MatchAnswers): number {
  const t = targetFor(answers);
  const weightGap = Math.abs(racket.weightG - t.weightG) / 5; // 5 g counts as one point
  const headGap = Math.abs(racket.headSizeSqIn - t.headSizeSqIn) / 2; // 2 sq in counts as one point
  const levelBonus = racket.levelFit.includes(answers.level) ? 2 : 0;
  return levelBonus - weightGap - headGap;
}

/**
 * Up to three eligible rackets: only in-stock rackets, never Tier 3 for a customer who has not yet
 * completed an on-time trial. The three are labelled lighter, balanced and step-up by weight.
 */
export function shortlist(
  rackets: readonly Racket[],
  answers: MatchAnswers,
  customer: { completedOnTimeTrials: number },
): Pick[] {
  const pool = rackets.filter(
    (r) => isTrialEligible(r) && (customer.completedOnTimeTrials >= 1 || tierForValue(r.costIdr) !== 3),
  );

  const top = pool
    .map((racket) => ({ racket, score: scoreRacket(racket, answers) }))
    .sort((a, b) => b.score - a.score || a.racket.code.localeCompare(b.racket.code))
    .slice(0, 3)
    .sort((a, b) => a.racket.weightG - b.racket.weightG);

  const roles: ShortlistRole[] =
    top.length === 3 ? ["lighter", "balanced", "step_up"] : top.length === 2 ? ["lighter", "step_up"] : ["balanced"];
  return top.map((p, i) => ({ ...p, role: roles[i] ?? "balanced" }));
}

// ---------------------------------------------------------------------------
// Free text safety
// ---------------------------------------------------------------------------
const HEALTH_WORDS =
  /\b(sakit|nyeri|cedera|ngilu|keseleo|tennis elbow|siku|bahu|pergelangan|lutut|punggung|injur\w*|pain\w*|elbow|shoulder|wrist|knee|back pain|strain\w*)\b/i;

/** AI-5: arm or injury mentions get a safe reply, are never sent to the model and are never stored. */
export function mentionsHealthConcern(text: string): boolean {
  return HEALTH_WORDS.test(text);
}

/** Free text is data only: trimmed, control characters removed, length-limited. */
export function sanitizeFreeText(text: string, maxLength = 300): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// Explanations: grounded in stored specs only (AI-3)
// ---------------------------------------------------------------------------
const ROLE_PHRASE: Record<ShortlistRole, string> = {
  lighter: "ringan dan mudah diayun",
  balanced: "paling seimbang untuk kebanyakan pemain",
  step_up: "pilihan jika ingin naik level",
};

/** Deterministic Bahasa Indonesia explanation used when the model is off, fails or says something ungrounded. */
export function templateExplanation(racket: Racket, role: ShortlistRole): string {
  return `${racket.brand} ${racket.model}: ${racket.weightG} g, kepala ${racket.headSizeSqIn} in². ${capitalize(ROLE_PHRASE[role])}.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Every number in an explanation must be one of the racket's real specs, and prices are not allowed. */
export function isExplanationGrounded(text: string, racket: Racket): boolean {
  if (/\bRp\b|rupiah|harga|diskon|gratis/i.test(text)) return false;
  const allowed = new Set([String(racket.weightG), String(racket.headSizeSqIn)]);
  const numbers = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return numbers.every((n) => allowed.has(n));
}
