import { describe, expect, it } from "vitest";
import { averagesByProfile } from "./averageScores";

describe("averagesByProfile", () => {
  it("returns an empty map for no rows", () => {
    expect(averagesByProfile([])).toEqual({});
  });

  it("averages each profile's scores independently", () => {
    const avg = averagesByProfile([
      { profile_id: "a", score: 80 },
      { profile_id: "a", score: 100 },
      { profile_id: "b", score: 50 },
    ]);
    expect(avg).toEqual({ a: 90, b: 50 });
  });

  it("rounds to a whole percent", () => {
    expect(averagesByProfile([
      { profile_id: "a", score: 90 },
      { profile_id: "a", score: 91 },
    ])).toEqual({ a: 91 }); // 90.5 -> 91
    expect(averagesByProfile([
      { profile_id: "a", score: 70 },
      { profile_id: "a", score: 71 },
      { profile_id: "a", score: 72 },
    ])).toEqual({ a: 71 });
  });

  it("omits profiles with no rows", () => {
    expect(averagesByProfile([{ profile_id: "a", score: 42 }])).not.toHaveProperty("b");
  });
});
