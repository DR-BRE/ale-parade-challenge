import { describe, expect, it } from "vitest";
import { allow } from "./rateLimit";

describe("allow", () => {
  it("permits up to the limit then blocks within the window", () => {
    const key = "test-" + Math.random();
    for (let i = 0; i < 10; i++) expect(allow(key, 10, 60_000)).toBe(true);
    expect(allow(key, 10, 60_000)).toBe(false);
  });

  it("tracks keys independently", () => {
    expect(allow("a-" + Math.random(), 1, 60_000)).toBe(true);
    expect(allow("b-" + Math.random(), 1, 60_000)).toBe(true);
  });
});
