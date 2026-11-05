import { filterRackets, listCatalogue, type CatalogueEntry } from "@/modules/catalogue";
import { serviceClient } from "@/shared/db";
import { catalogueQuery, type CatalogueQuery } from "@/shared/validation";
import { LEVEL_LABEL } from "../_components/labels";
import { RacketCard } from "../_components/racket-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Semua raket · Coba Raket" };

async function load(): Promise<CatalogueEntry[] | null> {
  try {
    return await listCatalogue(serviceClient());
  } catch (error) {
    console.error("Catalogue failed to load", error);
    return null;
  }
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const parsed = catalogueQuery.safeParse(await searchParams);
  const q: CatalogueQuery = parsed.success ? parsed.data : {};
  const entries = await load();
  const shown =
    entries &&
    filterRackets(
      entries.map((e) => ({ ...e.racket, entry: e })),
      { level: q.level, maxWeightG: q.maxWeight, grip: q.grip, maxBudgetIdr: q.budget },
    ).map((r) => r.entry);
  const grips = entries ? [...new Set(entries.map((e) => e.racket.gripSize).filter((g): g is string => !!g))].sort() : [];

  return (
    <main className="page">
      <h1>Semua raket</h1>

      <form className="filters" method="get" aria-label="Saring raket">
        <label>
          Level
          <select name="level" defaultValue={q.level ?? ""}>
            <option value="">Semua</option>
            {Object.entries(LEVEL_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Berat maks.
          <select name="maxWeight" defaultValue={q.maxWeight?.toString() ?? ""}>
            <option value="">Semua</option>
            {[270, 285, 300, 320].map((w) => (
              <option key={w} value={w}>
                {w} g
              </option>
            ))}
          </select>
        </label>
        <label>
          Grip
          <select name="grip" defaultValue={q.grip ?? ""}>
            <option value="">Semua</option>
            {grips.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Budget beli
          <select name="budget" defaultValue={q.budget?.toString() ?? ""}>
            <option value="">Semua</option>
            {[1_000_000, 2_000_000, 3_000_000].map((b) => (
              <option key={b} value={b}>
                Sampai Rp{(b / 1_000_000).toLocaleString("id-ID")} juta
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          Terapkan
        </button>
      </form>

      {shown === null ? (
        <p className="notice" role="alert">
          Daftar raket belum bisa dimuat. Coba lagi sebentar lagi.
        </p>
      ) : shown.length === 0 ? (
        <p className="notice">Tidak ada raket yang cocok. Coba longgarkan filter.</p>
      ) : (
        <>
          <p className="lead" aria-live="polite">
            {shown.length} raket
          </p>
          <ul className="list">
            {shown.map((e) => (
              <RacketCard key={e.racket.id} entry={e} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
