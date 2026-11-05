# Coba Raket

Try three tennis rackets for three days before you buy. Starter repo for the product described in `docs/Coba_Raket_PRD.pdf`.

## What is already here

| Area | Status |
| --- | --- |
| Folder structure with enforced module boundaries (ESLint) | Done |
| Pure business rules with tests: pricing, tiers, late fees, cancellation, booking states, ledger summary, damage grades, handover checks, dispute reviewer rule | Done |
| Matcher: rules-only shortlist, safety handling, grounded explanations, model fallback | Done |
| Passport: canonical hashing, chain builder, verifier (browser-safe), outbox with retries | Done |
| Database schema: no double booking, append-only tables, chain trigger, row-level security | Done and tested on PostgreSQL 16 |
| Adapters with fakes: LLM, storage, payment, blockchain | Done (EAS adapter is a placeholder) |
| Screens, auth (phone OTP), Supabase wiring, real EAS anchoring | Not started |

## Setup

```bash
npm install
cp .env.example .env.local     # fill in your own Supabase DEVELOPMENT project values
npm run dev
```

Apply `supabase/migrations/0001_init.sql` to your development Supabase project (SQL editor or the Supabase CLI).

Then run `supabase/seed.sql` in the same project. It adds 7 sample rackets covering all three deposit tiers and is safe to re-run. The specs are placeholders: replace them with your real stock before customers see the catalogue.

## Checks

```bash
npm run check      # typecheck, lint, unit tests
npm run test:db    # needs a throwaway PostgreSQL database whose name contains "test"
```

```bash
createdb coba_test
TEST_DATABASE_URL=postgres://localhost:5432/coba_test npm run test:db
```

CI (`.github/workflows/ci.yml`) runs both on every push and pull request.

## Suggested build order (10-day MVP from the PRD)

1. Catalogue read + seed script for your first 6 rackets (CAT)
2. Matcher screen: 6 questions, shortlist, explanation (AI-1 to AI-4)
3. Booking with phone OTP and the double-booking guarantee (BK-1 to BK-4)
4. Manual QRIS payment and the ledger (PAY-1, PAY-2, PAY-4)
5. Operator handover and return with live photos (HO-1 to HO-5)
6. Inspection, damage grade and deposit refund (DMG, PAY-5)
7. Passport events written on handover, public passport page with browser verification (PP-1, PP-2, PP-4)
8. EAS anchoring on Base Sepolia (PP-3)

See `CLAUDE.md` for the rules that keep this safe to build with an AI agent.
