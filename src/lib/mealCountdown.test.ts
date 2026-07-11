import { describe, expect, it } from "vitest";

import { getNextMealCountdown } from "./mealCountdown";

const minute = 60_000;
const bratislavaMeals = [
  { label: "Dinner", timeOfDay: "18:30" },
  { label: "Breakfast", timeOfDay: "07:30" },
];

describe("getNextMealCountdown", () => {
  it("finds the next meal before and between unsorted routines", () => {
    expect(
      getNextMealCountdown(
        Date.parse("2026-07-09T04:00:00Z"),
        "Europe/Bratislava",
        bratislavaMeals,
      ),
    ).toEqual({
      label: "Breakfast",
      timeOfDay: "07:30",
      at: Date.parse("2026-07-09T05:30:00Z"),
      countdownMs: 90 * minute,
    });
    expect(
      getNextMealCountdown(
        Date.parse("2026-07-09T08:00:00Z"),
        "Europe/Bratislava",
        bratislavaMeals,
      ),
    ).toEqual({
      label: "Dinner",
      timeOfDay: "18:30",
      at: Date.parse("2026-07-09T16:30:00Z"),
      countdownMs: 510 * minute,
    });
  });

  it("rolls past the final meal into the next day", () => {
    expect(
      getNextMealCountdown(
        Date.parse("2026-07-09T18:00:00Z"),
        "Europe/Bratislava",
        bratislavaMeals,
      ),
    ).toEqual({
      label: "Breakfast",
      timeOfDay: "07:30",
      at: Date.parse("2026-07-10T05:30:00Z"),
      countdownMs: 690 * minute,
    });
  });

  it("handles a next-day meal across local midnight", () => {
    expect(
      getNextMealCountdown(
        Date.parse("2026-07-09T21:50:00Z"),
        "Europe/Bratislava",
        [{ label: "Midnight snack", timeOfDay: "00:10" }],
      ),
    ).toEqual({
      label: "Midnight snack",
      timeOfDay: "00:10",
      at: Date.parse("2026-07-09T22:10:00Z"),
      countdownMs: 20 * minute,
    });
  });

  it("uses the dog's timezone rather than the browser timezone", () => {
    expect(
      getNextMealCountdown(Date.parse("2026-07-09T00:00:00Z"), "Asia/Tokyo", [
        { label: "Brunch", timeOfDay: "10:00" },
      ]),
    ).toEqual({
      label: "Brunch",
      timeOfDay: "10:00",
      at: Date.parse("2026-07-09T01:00:00Z"),
      countdownMs: 60 * minute,
    });
  });

  it("moves a nonexistent spring-forward meal to the next valid wall time", () => {
    expect(
      getNextMealCountdown(
        Date.parse("2026-03-29T00:45:00Z"),
        "Europe/Bratislava",
        [{ label: "Breakfast", timeOfDay: "02:30" }],
      ),
    ).toEqual({
      label: "Breakfast",
      timeOfDay: "02:30",
      at: Date.parse("2026-03-29T01:30:00Z"),
      countdownMs: 45 * minute,
    });
  });

  it("uses the first fall-back occurrence and does not schedule it twice", () => {
    const routine = [{ label: "Breakfast", timeOfDay: "02:30" }];

    expect(
      getNextMealCountdown(
        Date.parse("2026-10-25T00:15:00Z"),
        "Europe/Bratislava",
        routine,
      ),
    ).toEqual({
      label: "Breakfast",
      timeOfDay: "02:30",
      at: Date.parse("2026-10-25T00:30:00Z"),
      countdownMs: 15 * minute,
    });
    expect(
      getNextMealCountdown(
        Date.parse("2026-10-25T01:15:00Z"),
        "Europe/Bratislava",
        routine,
      ),
    ).toEqual({
      label: "Breakfast",
      timeOfDay: "02:30",
      at: Date.parse("2026-10-26T01:30:00Z"),
      countdownMs: 1_455 * minute,
    });
  });

  it("returns null for invalid or empty input and ignores invalid routines", () => {
    const now = Date.parse("2026-07-09T00:00:00Z");

    expect(getNextMealCountdown(Number.NaN, "UTC", bratislavaMeals)).toBeNull();
    expect(
      getNextMealCountdown(now, "Mars/Olympus", bratislavaMeals),
    ).toBeNull();
    expect(getNextMealCountdown(now, "UTC", [])).toBeNull();
    expect(
      getNextMealCountdown(now, "UTC", [
        { label: "", timeOfDay: "07:30" },
        { label: "Dinner", timeOfDay: "24:00" },
      ]),
    ).toBeNull();
    expect(
      getNextMealCountdown(now, "UTC", [
        { label: "", timeOfDay: "07:30" },
        { label: "Breakfast", timeOfDay: "01:00" },
      ]),
    ).toEqual({
      label: "Breakfast",
      timeOfDay: "01:00",
      at: Date.parse("2026-07-09T01:00:00Z"),
      countdownMs: 60 * minute,
    });
  });
});
