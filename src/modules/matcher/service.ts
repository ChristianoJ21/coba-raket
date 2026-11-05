/**
 * Orchestrates the matcher: rules choose the rackets, the model (if available) only phrases the reasons.
 * Any model failure, invalid output or ungrounded claim falls back to the rules-only text.
 */
import { z } from "zod";
import type { LlmAdapter } from "@/adapters/llm";
import type { Racket } from "@/modules/catalogue";
import {
  isExplanationGrounded,
  mentionsHealthConcern,
  sanitizeFreeText,
  shortlist,
  templateExplanation,
  type MatchAnswers,
  type ShortlistRole,
} from "./rules";

const explainResponse = z.object({
  explanations: z.array(z.object({ racketId: z.string(), text: z.string().min(1).max(400) })).max(3),
});

export interface ShortlistItem {
  racketId: string;
  role: ShortlistRole;
  explanation: string;
  source: "model" | "rules";
}

export interface ShortlistResult {
  items: ShortlistItem[];
  /** Set when the free text mentioned pain or injury; the UI shows it above the results. */
  safetyNotice?: string;
}

const SAFETY_NOTICE =
  "Jika kamu merasakan nyeri atau punya cedera, sebaiknya bicara dengan pelatih atau tenaga kesehatan sebelum memilih raket. Kami tidak memberi diagnosis.";

export async function buildShortlist(
  input: {
    answers: MatchAnswers;
    freeText?: string;
    rackets: readonly Racket[];
    customer: { completedOnTimeTrials: number };
  },
  deps: { llm: LlmAdapter | null },
): Promise<ShortlistResult> {
  const picks = shortlist(input.rackets, input.answers, input.customer);
  const rulesItems: ShortlistItem[] = picks.map((p) => ({
    racketId: p.racket.id,
    role: p.role,
    explanation: templateExplanation(p.racket, p.role),
    source: "rules",
  }));

  const rawText = input.freeText ?? "";
  if (mentionsHealthConcern(rawText)) {
    // The text is neither sent to the model nor kept anywhere.
    return { items: rulesItems, safetyNotice: SAFETY_NOTICE };
  }
  if (!deps.llm || picks.length === 0) return { items: rulesItems };

  try {
    const raw = await deps.llm.explain({
      language: "id",
      level: input.answers.level,
      frequency: input.answers.frequency,
      feel: input.answers.feel,
      notes: sanitizeFreeText(rawText),
      rackets: picks.map((p) => ({
        id: p.racket.id,
        brand: p.racket.brand,
        model: p.racket.model,
        weightG: p.racket.weightG,
        headSizeSqIn: p.racket.headSizeSqIn,
        role: p.role,
      })),
    });
    const parsed = explainResponse.safeParse(raw);
    if (!parsed.success) return { items: rulesItems };

    const byId = new Map(parsed.data.explanations.map((e) => [e.racketId, e.text]));
    return {
      // The racket list and order always come from the rules, never from the model.
      items: picks.map((p, i) => {
        const text = byId.get(p.racket.id);
        return text && isExplanationGrounded(text, p.racket)
          ? { racketId: p.racket.id, role: p.role, explanation: text, source: "model" as const }
          : (rulesItems[i] as ShortlistItem);
      }),
    };
  } catch {
    return { items: rulesItems };
  }
}
