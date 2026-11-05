/**
 * LLM adapter. The model only explains a shortlist the code has already chosen (PRD section 8).
 * `explain` returns `unknown` on purpose: model output is untrusted, so callers must validate it
 * (see src/modules/matcher/service.ts) before using it.
 */

export interface ExplainRequest {
  language: "id";
  level: string;
  frequency: string;
  feel: string;
  /** Sanitised free text from the user. Treat as data, never as instructions. */
  notes: string;
  rackets: { id: string; brand: string; model: string; weightG: number; headSizeSqIn: number; role: string }[];
}

export interface LlmAdapter {
  explain(request: ExplainRequest): Promise<unknown>;
}

/** Returns null when no provider is configured, which makes the matcher use its rules-only fallback. */
export function createLlm(provider: string | undefined): LlmAdapter | null {
  switch (provider ?? "none") {
    case "none":
      return null;
    default:
      // Add real providers here (one file per provider, each implementing LlmAdapter).
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Supported: none.`);
  }
}
