import { describe, expect, it } from "vitest";
import { getEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("getEnv", () => {
  it("applies defaults for optional settings", () => {
    const env = getEnv(valid);
    expect(env.LLM_PROVIDER).toBe("none");
    expect(env.PASSPORT_CHAIN).toBe("base-sepolia");
  });

  it("fails with a readable message when required values are missing", () => {
    expect(() => getEnv({})).toThrow(/Invalid environment: .*SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("refuses a mainnet chain setting", () => {
    expect(() => getEnv({ ...valid, PASSPORT_CHAIN: "base" })).toThrow(/PASSPORT_CHAIN/);
  });
});
