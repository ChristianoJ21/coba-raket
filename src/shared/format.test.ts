import { describe, expect, it } from "vitest";
import { formatDayJakarta, formatRupiah } from "./format";

describe("formatRupiah", () => {
  it("groups thousands with dots", () => {
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(50_000)).toBe("Rp50.000");
    expect(formatRupiah(3_950_000)).toBe("Rp3.950.000");
  });
  it("handles negatives", () => {
    expect(formatRupiah(-25_000)).toBe("-Rp25.000");
  });
});

describe("formatDayJakarta", () => {
  it("formats in Jakarta time, not UTC", () => {
    // 18:00 UTC on Sunday 8 Nov is 01:00 WIB on Monday 9 Nov.
    const text = formatDayJakarta(new Date("2026-11-08T18:00:00Z"));
    expect(text).toContain("9 November");
    expect(text).toContain("Senin");
  });
});
