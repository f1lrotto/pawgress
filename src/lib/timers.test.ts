import { describe, expect, it } from "vitest";

import { deriveSleepState, formatElapsed, getElapsedMs } from "./timers";

describe("getElapsedMs", () => {
  it("clamps future timestamps at zero", () => {
    expect(getElapsedMs(2_000, 1_000)).toBe(0);
    expect(getElapsedMs(1_000, 1_000)).toBe(0);
    expect(getElapsedMs(1_000, 2_500)).toBe(1_500);
  });
});

describe("formatElapsed", () => {
  it.each([
    [-1, "0s"],
    [0, "0s"],
    [59_999, "59s"],
    [60_000, "1m"],
    [3_599_999, "59m"],
    [3_600_000, "1h"],
    [7_980_000, "2h 13m"],
    [86_400_000, "1d"],
    [183_600_000, "2d 3h"],
  ])("formats %i milliseconds as %s", (duration, expected) => {
    expect(formatElapsed(duration)).toBe(expected);
  });

  it.each([
    [1_000, "1 s"],
    [60_000, "1 min"],
    [3_600_000, "1 h"],
    [7_980_000, "2 h 13 min"],
    [86_400_000, "1 d."],
    [183_600_000, "2 d. 3 h"],
  ])("formats %i milliseconds in Slovak as %s", (duration, expected) => {
    expect(formatElapsed(duration, "sk")).toBe(expected);
  });

  it("clamps and floors Slovak edge values", () => {
    expect(formatElapsed(-1, "sk")).toBe("0 s");
    expect(formatElapsed(999, "sk")).toBe("0 s");
    expect(formatElapsed(59_999, "sk")).toBe("59 s");
  });
});

describe("deriveSleepState", () => {
  it("returns no state without wake or sleep events", () => {
    expect(deriveSleepState(undefined, null)).toBeNull();
  });

  it("uses whichever event exists", () => {
    expect(deriveSleepState({ at: 10 }, undefined)).toEqual({
      state: "awake",
      startedAt: 10,
    });
    expect(deriveSleepState(null, { at: 20 })).toEqual({
      state: "asleep",
      startedAt: 20,
    });
  });

  it("uses the more recent event as the current state", () => {
    expect(deriveSleepState({ at: 30 }, { at: 20 })).toEqual({
      state: "awake",
      startedAt: 30,
    });
    expect(deriveSleepState({ at: 30 }, { at: 40 })).toEqual({
      state: "asleep",
      startedAt: 40,
    });
  });

  it("resolves tied timestamps to asleep deterministically", () => {
    expect(deriveSleepState({ at: 50 }, { at: 50 })).toEqual({
      state: "asleep",
      startedAt: 50,
    });
  });
});
