import { describe, expect, it } from "vitest";

import { toCanonicalTrainingRating, toTrainingRating } from "./trainingRating";

describe("toCanonicalTrainingRating", () => {
  it.each([
    ["negative", 1],
    ["neutral", 3],
    ["positive", 5],
  ] as const)("maps %s to canonical rating %i", (rating, expected) => {
    expect(toCanonicalTrainingRating(rating)).toBe(expected);
  });
});

describe("toTrainingRating", () => {
  it.each([
    [1, "negative"],
    [2, "negative"],
    [3, "neutral"],
    [4, "positive"],
    [5, "positive"],
  ] as const)("maps legacy rating %i to %s", (rating, expected) => {
    expect(toTrainingRating(rating)).toBe(expected);
  });
});
