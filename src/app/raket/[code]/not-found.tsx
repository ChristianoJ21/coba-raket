import Link from "next/link";

export default function RacketNotFound() {
  return (
    <main className="page">
      <h1>Raket tidak ditemukan</h1>
      <p className="lead">Kode raket ini tidak ada di katalog kami. Periksa kembali kode di stiker QR.</p>
      <p>
        <Link href="/raket" className="btn">
          Lihat semua raket
        </Link>
      </p>
    </main>
  );
}
