# Coba Raket

Tennis racket "try before you buy" rental: AI matcher, 3-day trials of up to 3 rackets, QR handover with photos, and a public **Racket Passport** (hash chain anchored on Base Sepolia). One developer works with Claude. Product spec: `docs/Coba_Raket_PRD.pdf` (requirement IDs like `BK-2`, `PP-4`).

## Commands

```bash
npm run dev          # local app
npm run check        # typecheck + lint + unit tests. MUST pass before you say a task is done
npm run test:db      # database tests (needs TEST_DATABASE_URL, see below)
npm run build        # production build
```

Database tests wipe the target database. Use a throwaway local one whose name contains `test`:
`TEST_DATABASE_URL=postgres://localhost:5432/coba_test npm run test:db`. Never point it at anything else.

## Architecture: modular monolith

```
src/app/        Pages and route handlers ONLY. Validate input, call a module, return. No business rules.
src/modules/    catalogue matcher booking payments handover damage passport admin
src/adapters/   llm storage payment blockchain. Wrappers around outside services, each with a fake.
src/shared/     env, db client, auth types, zod request schemas
supabase/migrations/   SQL. The database enforces the rules that must never break.
tests/          database tests
```

Inside a module: `rules.ts` holds pure business rules (no framework, no database, no adapters, enforced by lint),
`service.ts` / `store.ts` hold the code that touches the outside world, `index.ts` is the ONLY public surface.

### Rules (lint enforces the first three)
1. Import a module only through its `index.ts`: `@/modules/booking`, never `@/modules/booking/rules`.
2. Modules never import from `src/app`. Adapters never import from modules.
3. `rules.ts` files stay pure: no `next`, `react`, `@supabase/*`, `@/shared/db` or `@/adapters/*`.
4. All writes happen on the server with the service-role client. Row-level security is a second layer, not the first.
5. The database enforces: no double booking, append-only `ledger_entries` / `passport_events` / `audit_log`, passport chain continuity. Do not re-implement these only in TypeScript, and never weaken a constraint to make a test pass.
   When one booking inserts several `booking_items`, insert them in **sorted `racket_id` order** (the migration locks per racket, and a consistent order prevents lock deadlocks). Treat SQLSTATE `23P01` (overlap) and `40P01` (deadlock) as "racket no longer available, please pick another".
6. Outside services go behind an adapter interface with an in-memory fake. Tests use the fakes.
7. Passport events and the blockchain: save the event first, anchor later through `passport_outbox`. A chain outage must never block a handover (PP-6).

## Conventions
- Money is an integer number of rupiah. Ledger amounts are always positive; the `kind` gives the direction.
- Timestamps are UTC (`timestamptz`); format for Asia/Jakarta only in the UI.
- User-facing copy is Bahasa Indonesia. Code, comments and commit messages are English.
- Policy numbers (fees, deposits, late fees, windows) live in one place: `src/modules/booking/rules.ts` and `src/modules/damage/rules.ts`. They are proposals from PRD section 7; change them there only.
- Validate every request body with zod in `src/shared/validation.ts` at the route edge.
- Prefer small pure functions with tests next to them (`*.test.ts`).

## How to work on a task
1. One task = one PRD requirement ID (for example `BK-2`). Read its acceptance criterion first.
2. Write or update the pure rule and its test first, then the route/UI around it.
3. Run `npm run check`. If you changed SQL, also run `npm run test:db`.
4. New migration = a new numbered file in `supabase/migrations/`. Never edit an applied migration.
5. Report what you changed, what you tested, and anything you could not verify.

## Never do these
- Never put personal data (names, phone, ID, photos) in `passport_events.payload` or on-chain. The passport is public.
- Never store ID numbers or ID images. Only the `id_checked` boolean (HO-4).
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `PASSPORT_OPERATOR_PRIVATE_KEY` to the browser, logs or commits.
- Never use a mainnet or a wallet that holds real funds. Base Sepolia testnet only.
- Never read or write production data. Development uses its own Supabase project and the test database.
- Never let model output decide a price, stock level, racket choice or policy. The model only phrases explanations, and its output is validated (`src/modules/matcher/service.ts`).
- Never skip or delete a failing test to get green. Fix the cause or ask.

## Needs human review before merging
Payments and ledger code, anything touching permissions or RLS, every SQL migration, passport hashing (`passport/rules.ts`), and any change to policy numbers. Say so explicitly when a change touches one of these.

## Known gaps (not bugs)
- `src/adapters/blockchain/eas.ts` is a placeholder (PP-3). The worker uses the fake chain until it exists.
- No real LLM provider yet; `LLM_PROVIDER=none` uses the rules-only matcher.
- Auth (phone OTP, `BK-3`) and all customer/operator screens are not built. See `src/shared/auth.ts`.
