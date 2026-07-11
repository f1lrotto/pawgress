import { describe, expect, it } from "vitest";

import {
  bucketPottyByHour,
  buildWalkIntervals,
  sumSleepByDay,
} from "./insights";

describe("bucketPottyByHour", () => {
  it("combines both occurrences of a repeated DST hour", () => {
    const buckets = bucketPottyByHour(
      [
        {
          kind: "pee",
          at: Date.parse("2026-10-25T00:30:00Z"),
          peePlace: "inside",
        },
        {
          kind: "pee",
          at: Date.parse("2026-10-25T01:30:00Z"),
          peePlace: "outside",
        },
        { kind: "poop", at: Date.parse("2026-10-25T01:45:00Z") },
      ],
      "Europe/Bratislava",
    );

    expect(buckets).toHaveLength(24);
    expect(buckets[2]).toEqual({
      hour: 2,
      peeInside: 1,
      peeOutside: 1,
      poop: 1,
    });
    expect(
      buckets.reduce(
        (sum, bucket) => sum + bucket.peeInside + bucket.peeOutside,
        0,
      ),
    ).toBe(2);
  });

  it("rejects invalid zones even without events", () => {
    expect(() => bucketPottyByHour([], "Mars/Olympus")).toThrow();
    expect(() => bucketPottyByHour([], "+02:00")).toThrow();
  });
});

describe("buildWalkIntervals", () => {
  it("pairs completed walks and includes meals only between them", () => {
    expect(
      buildWalkIntervals(
        [
          { at: 10, endedAt: 20 },
          { at: 25 },
          { at: 30, endedAt: 40 },
          { at: 50, endedAt: 60 },
        ],
        [{ at: 20 }, { at: 29 }, { at: 30 }, { at: 49 }, { at: 50 }],
      ),
    ).toEqual([
      {
        fromWalkAt: 10,
        fromWalkEndedAt: 20,
        toWalkAt: 30,
        intervalMs: 10,
        mealAts: [20, 29],
      },
      {
        fromWalkAt: 30,
        fromWalkEndedAt: 40,
        toWalkAt: 50,
        intervalMs: 10,
        mealAts: [49],
      },
    ]);
  });

  it("sorts inputs without mutating them and drops overlapping pairs", () => {
    const walks = [
      { at: 30, endedAt: 35 },
      { at: 10, endedAt: 40 },
    ];
    expect(buildWalkIntervals(walks, [])).toEqual([]);
    expect(walks[0].at).toBe(30);
  });
});

describe("sumSleepByDay", () => {
  const days = [
    { date: "2026-07-09", startAt: 1_000, endAt: 2_000 },
    { date: "2026-07-10", startAt: 2_000, endAt: 3_000 },
  ];

  it("clips carry-in, crossing, and open sleep to each day", () => {
    expect(
      sumSleepByDay(
        [
          { kind: "wake", at: 1_500 },
          { kind: "sleep", at: 1_800 },
          { kind: "wake", at: 2_500 },
          { kind: "sleep", at: 2_700 },
        ],
        days,
        { kind: "sleep", at: 500 },
      ),
    ).toEqual([
      { date: "2026-07-09", sleepMs: 700 },
      { date: "2026-07-10", sleepMs: 800 },
    ]);
  });

  it("starts awake without a seed and ignores repeated state events", () => {
    expect(
      sumSleepByDay(
        [
          { kind: "wake", at: 1_100 },
          { kind: "sleep", at: 1_200 },
          { kind: "sleep", at: 1_300 },
          { kind: "wake", at: 1_600 },
        ],
        days,
        null,
      ),
    ).toEqual([
      { date: "2026-07-09", sleepMs: 400 },
      { date: "2026-07-10", sleepMs: 0 },
    ]);
  });
});
