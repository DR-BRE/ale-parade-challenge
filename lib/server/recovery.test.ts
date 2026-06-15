import { describe, expect, it } from "vitest";
import { generateRecoveryCode } from "./recovery";

describe("generateRecoveryCode", () => {
  it("matches the PINT-XXXXX format with an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^PINT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
      // The random suffix must avoid ambiguous glyphs (the literal "PINT" has an I).
      expect(code.slice(5)).not.toMatch(/[OIL01]/);
    }
  });

  it("produces varied codes", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRecoveryCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
