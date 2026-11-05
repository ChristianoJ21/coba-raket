import Link from "next/link";
import { trialPriceFor } from "@/modules/booking";
import type { CatalogueEntry } from "@/modules/catalogue";
import { formatRupiah } from "@/shared/format";
import { availabilityLabel, CONDITION_LABEL } from "./labels";

export function RacketCard({ entry }: { entry: CatalogueEntry }) {
  const { racket: r, availability } = entry;
  const price = trialPriceFor(r.costIdr);
  return (
    <li className="card">
      <Link href={`/raket/${r.code}`} className="card-link">
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
          Biaya coba {formatRupiah(price.feeIdr)} · Deposit kembali {formatRupiah(price.depositIdr)}
        </p>
        {availability.kind === "now" ? null : <span className="badge">{availabilityLabel(availability)}</span>}
      </Link>
    </li>
  );
}
