import { trialPriceFor } from "@/modules/booking";
import { filterRackets, listCatalogue } from "@/modules/catalogue";
import { serviceClient } from "@/shared/db";
import { catalogueQuery } from "@/shared/validation";

export const dynamic = "force-dynamic";

/** Public catalogue (PRD 11.5). Never returns booking or customer data. */
export async function GET(request: Request) {
  const parsed = catalogueQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "invalid_query" }, { status: 400 });
  const q = parsed.data;

  try {
    const entries = await listCatalogue(serviceClient());
    const shown = filterRackets(
      entries.map((e) => ({ ...e.racket, availability: e.availability })),
      { level: q.level, maxWeightG: q.maxWeight, grip: q.grip, maxBudgetIdr: q.budget },
    );
    const rackets = shown.map((r) => {
      const price = trialPriceFor(r.costIdr);
      return {
        code: r.code,
        brand: r.brand,
        model: r.model,
        weightG: r.weightG,
        headSizeSqIn: r.headSizeSqIn,
        gripSize: r.gripSize ?? null,
        stringPattern: r.stringPattern ?? null,
        levelFit: r.levelFit,
        conditionGrade: r.conditionGrade,
        status: r.status,
        trialFeeIdr: price.feeIdr,
        depositIdr: price.depositIdr,
        availableNow: r.availability.kind === "now",
        nextFreeAt: r.availability.kind === "from" ? r.availability.at.toISOString() : null,
      };
    });
    return Response.json({ rackets });
  } catch (error) {
    console.error("GET /api/rackets failed", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
