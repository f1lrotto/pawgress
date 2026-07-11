import { describe, expect, it } from "vitest";

import { getAgeParts } from "./age";

describe("getAgeParts", () => {
  it("counts completed years and months at calendar boundaries", () => {
    expect(getAgeParts("2024-01-15", "2024-01-15")).toEqual({
      years: 0,
      months: 0,
    });
    expect(getAgeParts("2024-01-15", "2026-07-14")).toEqual({
      years: 2,
      months: 5,
    });
    expect(getAgeParts("2024-01-15", "2026-07-15")).toEqual({
      years: 2,
      months: 6,
    });
  });

  it("clamps month-end and leap-day anniversaries", () => {
    expect(getAgeParts("2024-01-31", "2024-02-29")).toEqual({
      years: 0,
      months: 1,
    });
    expect(getAgeParts("2024-02-29", "2025-02-27")).toEqual({
      years: 0,
      months: 11,
    });
    expect(getAgeParts("2024-02-29", "2025-02-28")).toEqual({
      years: 1,
      months: 0,
    });
  });

  it("rejects invalid and future calendar dates", () => {
    for (const [birthday, today] of [
      ["", "2026-07-10"],
      ["2024-2-01", "2026-07-10"],
      ["2024-02-30", "2026-07-10"],
      ["0000-01-01", "2026-07-10"],
      ["2024-01-01", "2026-02-30"],
      ["2026-07-11", "2026-07-10"],
    ]) {
      expect(getAgeParts(birthday, today)).toBeNull();
    }
  });
});
