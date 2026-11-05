export type Role = "customer" | "operator" | "admin";

export function isStaff(role: Role): boolean {
  return role === "operator" || role === "admin";
}

/**
 * TODO (PRD BK-3): resolve the signed-in user from the Supabase session (phone OTP) and load
 * their role from `profiles`. Route handlers must call this first and reject unauthenticated
 * requests before touching any data.
 */
