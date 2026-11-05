import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

/**
 * Service-role client: bypasses row-level security, so it is for SERVER code only
 * (API routes, server actions, the worker). Never import this from a client component.
 */
export function serviceClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("serviceClient() must never run in the browser.");
  }
  const env = getEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
