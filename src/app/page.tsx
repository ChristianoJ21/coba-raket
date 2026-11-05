import Link from "next/link";
import { POLICY } from "@/modules/booking";

export default function Home() {
  return (
    <main className="page">
      <h1>Temukan raket yang pas sebelum beli</h1>
      <p className="lead">
        Coba sampai {POLICY.maxRacketsPerBooking} raket selama {POLICY.trialDays} hari, lalu putuskan tanpa tebak-tebakan.
      </p>

      <h2>Cara kerja</h2>
      <ol className="steps">
        <li>Pilih raket yang ingin kamu coba</li>
        <li>Coba {POLICY.trialDays} hari di lapangan</li>
        <li>Putuskan: beli atau tidak, tanpa tebak-tebakan</li>
      </ol>

      <p>
        <Link href="/raket" className="btn">
          Lihat semua raket
        </Link>
      </p>
    </main>
  );
}
