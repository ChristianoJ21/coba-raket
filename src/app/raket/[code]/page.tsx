import Link from "next/link";
import { notFound } from "next/navigation";
import { trialPriceFor } from "@/modules/booking";
import { getRacketByCode } from "@/modules/catalogue";
import { serviceClient } from "@/shared/db";
import { formatRupiah } from "@/shared/format";
import { racketCode } from "@/shared/validation";
import { availabilityLabel, CONDITION_LABEL, LEVEL_LABEL } from "../../_components/labels";

export const dynamic = "force-dynamic";

/** Racket detail (CAT-3). Opened from the catalogue and from the QR sticker: /raket/R-004. */
export default async function RacketPage({ params }: { params: Promise<{ code: string }> }) {
  const parsed = racketCode.safeParse((await params).code);
  if (!parsed.success) notFound();

  const entry = await getRacketByCode(serviceClient(), parsed.data);
  if (!entry) notFound();

  const { racket: r, availability } = entry;
  const price = trialPriceFor(r.costIdr);

  return (
    <main className="page">
      <p>
        <Link href="/raket">← Semua raket</Link>
      </p>
      <h1>
        {r.brand} {r.model}
      </h1>
      <p className="code">{r.code}</p>
      <p className={availability.kind === "now" ? "status-ok" : "notice"}>{availabilityLabel(availability)}</p>

      <h2>Spesifikasi</h2>
      <dl className="spec-table">
        <dt>Berat</dt>
        <dd>{r.weightG} g</dd>
        <dt>Ukuran kepala</dt>
        <dd>{r.headSizeSqIn} in²</dd>
        {r.gripSize ? (
          <>
            <dt>Grip</dt>
            <dd>{r.gripSize}</dd>
          </>
        ) : null}
        {r.stringPattern ? (
          <>
            <dt>Pola senar</dt>
            <dd>{r.stringPattern}</dd>
          </>
        ) : null}
        <dt>Cocok untuk</dt>
        <dd>{r.levelFit.map((l) => LEVEL_LABEL[l]).join(", ") || "-"}</dd>
        <dt>Kondisi</dt>
        <dd>{CONDITION_LABEL[r.conditionGrade]}</dd>
      </dl>

      <h2>Biaya coba</h2>
      <dl className="spec-table">
        <dt>Biaya coba, 3 hari</dt>
        <dd>{formatRupiah(price.feeIdr)}</dd>
        <dt>Deposit (dikembalikan)</dt>
        <dd>{formatRupiah(price.depositIdr)}</dd>
      </dl>

      <h2>Riwayat raket</h2>
      <p className="lead">Paspor raket berisi riwayat trial, inspeksi dan perbaikan. Segera tersedia.</p>
    </main>
  );
}
