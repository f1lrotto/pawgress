import { describe, expect, it } from "vitest";

import { activityKinds, activityVisuals } from "./activityVisuals";

describe("activityVisuals", () => {
  it("defines one unique visual for every activity kind", () => {
    const visuals = Object.values(activityVisuals);

    expect(Object.keys(activityVisuals)).toEqual(activityKinds);
    expect(new Set(visuals.map(({ symbol }) => symbol)).size).toBe(
      activityKinds.length,
    );
  });

  it("marks only sleep, walk, and play as duration-capable", () => {
    expect(
      activityKinds.filter((kind) => activityVisuals[kind].durationCapable),
    ).toEqual(["sleep", "walk", "play"]);
  });
});
