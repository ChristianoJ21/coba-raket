import { describe, expect, it } from "vitest";
import { formatRupiah } from "./format";

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
