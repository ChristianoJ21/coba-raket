/** Display helpers. Pure, so they are safe in server and client components. */

/** 250000 -> "Rp250.000" (Indonesian grouping, as written in the PRD). */
export function formatRupiah(amountIdr: number): string {
  const sign = amountIdr < 0 ? "-" : "";
  const digits = String(Math.abs(Math.round(amountIdr)));
  return `${sign}Rp${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
