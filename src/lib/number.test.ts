import { describe, expect, it } from "vitest";

import { parseDecimalInput } from "./number";

describe("parseDecimalInput", () => {
  it.each([
    ["4.25", 4.25],
    ["4,25", 4.25],
  ])("parses %s", (value, expected) => {
    expect(parseDecimalInput(value)).toBe(expected);
  });
});
