import { DEPOSIT_BY_TIER, POLICY } from "@/modules/booking";
import { listCatalogue, tierForValue, type Racket } from "@/modules/catalogue";
import { serviceClient } from "@/shared/db";
import { formatRupiah } from "@/shared/format";

// The catalogue changes whenever stock changes, so never prerender it at build time.
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<Racket["status"], string> = {
  ready: "Tersedia",
  reserved: "Sudah dipesan",
  out: "Sedang dicoba",
  servicing: "Dalam perawatan",
  retired: "Tidak dipakai",
  sold: "Terjual",
};

const CONDITION_LABEL: Record<Racket["conditionGrade"], string> = {
  new: "Baru",
  good: "Baik",
  fair: "Cukup",
  retired: "Pensiun",
};

async function loadCatalogue(): Promise<Racket[] | null> {
  try {
    return await listCatalogue(serviceClient());
  } catch (error) {
    console.error("Catalogue failed to load", error);
    return null;
  }
}

export default async function Home() {
  const rackets = await loadCatalogue();

  return (
    <main className="page">
      <h1>Temukan raket yang pas sebelum beli</h1>
      <p className="lead">Coba sampai 3 raket selama {POLICY.trialDays} hari, lalu putuskan tanpa tebak-tebakan.</p>

      <h2>Raket yang bisa dicoba</h2>
      {rackets === null ? (
        <p className="notice" role="alert">
          Daftar raket belum bisa dimuat. Coba lagi sebentar lagi.
        </p>
      ) : rackets.length === 0 ? (
        <p className="notice">Belum ada raket di katalog.</p>
      ) : (
        <ul className="list">
          {rackets.map((r) => (
            <li key={r.id} className="card">
              <h3>
                {r.brand} {r.model}
              </h3>
              <span className="code">{r.code}</span>
              <ul className="specs">
                <li>{r.weightG} g</li>
                <li>Kepala {r.headSizeSqIn} in²</li>
                {r.gripSize ? <li>Grip {r.gripSize}</li> : null}
                <li>Kondisi: {CONDITION_LABEL[r.conditionGrade]}</li>
              </ul>
              <p className="price">
                Biaya coba {formatRupiah(POLICY.trialFeeIdr)} · Deposit kembali{" "}
                {formatRupiah(DEPOSIT_BY_TIER[tierForValue(r.costIdr)])}
              </p>
              {r.status !== "ready" ? <span className="badge">{STATUS_LABEL[r.status]}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
