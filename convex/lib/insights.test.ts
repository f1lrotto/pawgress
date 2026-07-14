import { describe, expect, it } from "vitest";

import {
  bucketPottyByHour,
  buildOutingIntervals,
  sumSleepByDay,
} from "./insights";

const minute = 60_000;

describe("bucketPottyByHour", () => {
  it("uses Bratislava hours instead of UTC hours", () => {
    const buckets = bucketPottyByHour(
      ["2026-07-13T17:36:45.263Z", "2026-07-13T17:57:12.248Z"].map((at) => ({
        kind: "pee" as const,
        at: Date.parse(at),
        peePlace: "inside" as const,
      })),
      "Europe/Bratislava",
    );

    expect(buckets[17].peeInside).toBe(0);
    expect(buckets[19].peeInside).toBe(2);
  });

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

describe("buildOutingIntervals", () => {
  it("merges one trip and pairs walks with standalone potty outings", () => {
    expect(
      buildOutingIntervals(
        [
          { at: 60 * minute, endedAt: 60 * minute, kind: "pee" },
          { at: 0, endedAt: 5 * minute, kind: "walk" },
          { at: 15 * minute, endedAt: 15 * minute, kind: "pee" },
          { at: 18 * minute, endedAt: 18 * minute, kind: "poop" },
          { at: 40 * minute, endedAt: 45 * minute, kind: "walk" },
        ],
        [17, 18, 39, 40, 59, 60].map((at) => ({ at: at * minute })),
      ),
    ).toEqual([
      {
        fromWalkAt: 0,
        fromWalkEndedAt: 18 * minute,
        toWalkAt: 40 * minute,
        toKinds: ["walk"],
        intervalMs: 22 * minute,
        mealAts: [18 * minute, 39 * minute],
      },
      {
        fromWalkAt: 40 * minute,
        fromWalkEndedAt: 45 * minute,
        toWalkAt: 60 * minute,
        toKinds: ["pee"],
        intervalMs: 15 * minute,
        mealAts: [59 * minute],
      },
    ]);
  });

  it("sorts inputs without mutating them", () => {
    const outings = [
      { at: 30 * minute, endedAt: 35 * minute, kind: "walk" as const },
      { at: 10 * minute, endedAt: 40 * minute, kind: "walk" as const },
    ];
    expect(buildOutingIntervals(outings, [])).toEqual([]);
    expect(outings[0].at).toBe(30 * minute);
  });
});

describe("sumSleepByDay", () => {
  const days = [
    { date: "2026-07-09", startAt: 1_000, endAt: 2_000 },
    { date: "2026-07-10", startAt: 2_000, endAt: 3_000 },
  ];

  it("clips carry-in, crossing, and open sleep to now", () => {
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
        2_800,
      ),
    ).toEqual([
      { date: "2026-07-09", sleepMs: 700 },
      { date: "2026-07-10", sleepMs: 600 },
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
        3_000,
      ),
    ).toEqual([
      { date: "2026-07-09", sleepMs: 400 },
      { date: "2026-07-10", sleepMs: 0 },
    ]);
  });
});
