import { z } from "zod";

/**
 * Environment variables, validated once. Fails fast with a readable message
 * instead of crashing later with "undefined is not a function".
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LLM_PROVIDER: z.string().default("none"),
  LLM_API_KEY: z.string().optional(),
  PASSPORT_CHAIN: z.literal("base-sepolia").default("base-sepolia"),
  PASSPORT_RPC_URL: z.url().default("https://sepolia.base.org"),
  PASSPORT_OPERATOR_PRIVATE_KEY: z.string().optional(),
  PASSPORT_EAS_SCHEMA_UID: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  if (source === process.env && cached) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}. Copy .env.example to .env.local and fill it in.`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
