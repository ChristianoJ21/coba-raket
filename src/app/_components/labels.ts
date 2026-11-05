import type { Availability, ConditionGrade, PlayerLevel, RacketStatus } from "@/modules/catalogue";
import { formatDayJakarta } from "@/shared/format";

export const STATUS_LABEL: Record<RacketStatus, string> = {
  ready: "Tersedia",
  reserved: "Sudah dipesan",
  out: "Sedang dicoba",
  servicing: "Dalam perawatan",
  retired: "Tidak dipakai lagi",
  sold: "Terjual",
};

export const CONDITION_LABEL: Record<ConditionGrade, string> = {
  new: "Baru",
  good: "Baik",
  fair: "Cukup",
  retired: "Pensiun",
};

export const LEVEL_LABEL: Record<PlayerLevel, string> = {
  beginner: "Pemula",
  intermediate: "Menengah",
  advanced: "Mahir",
};

export function availabilityLabel(a: Availability): string {
  if (a.kind === "now") return "Tersedia sekarang";
  if (a.kind === "from") return `Tersedia lagi mulai ${formatDayJakarta(a.at)}`;
  return STATUS_LABEL[a.status];
}
