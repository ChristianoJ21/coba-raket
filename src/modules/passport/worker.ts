/**
 * Passport worker entry point: `npm run worker:passport`.
 * Run it on a schedule (for example every minute with a Vercel Cron call or a GitHub Actions cron).
 * Until the EAS adapter exists (PRD PP-3) it uses the fake chain, so events are marked "sent" with
 * fake UIDs. Do not run it against production data until createEasChain is implemented.
 */
import { createFakeChain } from "@/adapters/blockchain";
import { serviceClient } from "@/shared/db";
import { processOutbox } from "./outbox";
import { createOutboxStore } from "./store";

async function main(): Promise<void> {
  const result = await processOutbox({
    store: createOutboxStore(serviceClient()),
    chain: createFakeChain(),
    now: () => new Date(),
  });
  console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
