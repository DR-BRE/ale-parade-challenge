import { describe, expect, it } from "vitest";
import { generateSecret, hashSecret, safeEqualHex } from "./secrets";

describe("secrets", () => {
  it("generates 64-char hex secrets, unique per call", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
  it("hashes deterministically", () => {
    expect(hashSecret("pint")).toBe(hashSecret("pint"));
    expect(hashSecret("pint")).not.toBe(hashSecret("half-pint"));
    expect(hashSecret("pint")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("compares hashes safely", () => {
    const h = hashSecret("pint");
    expect(safeEqualHex(h, hashSecret("pint"))).toBe(true);
    expect(safeEqualHex(h, hashSecret("stout"))).toBe(false);
    expect(safeEqualHex(h, "abc1")).toBe(false); // length mismatch must not throw
  });
});
