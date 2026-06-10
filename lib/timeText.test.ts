import { describe, expect, it } from "vitest";
import { timeText } from "./timeText";

const NOW = 1_750_000_000_000;
const min = 60_000;

describe("timeText", () => {
  it("says Just now under a minute", () => {
    expect(timeText(NOW - 30_000, NOW)).toBe("Just now");
  });
  it("uses minutes under an hour", () => {
    expect(timeText(NOW - 5 * min, NOW)).toBe("5m ago");
    expect(timeText(NOW - 59 * min, NOW)).toBe("59m ago");
  });
  it("uses hours under a day", () => {
    expect(timeText(NOW - 60 * min, NOW)).toBe("1h ago");
    expect(timeText(NOW - 23 * 60 * min, NOW)).toBe("23h ago");
  });
  it("uses days from 24h up", () => {
    expect(timeText(NOW - 24 * 60 * min, NOW)).toBe("1d ago");
    expect(timeText(NOW - 6 * 24 * 60 * min, NOW)).toBe("6d ago");
  });
});
