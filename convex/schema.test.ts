/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

test("boots with the auth and milestone-two domain tables", async () => {
  expect(Object.keys(modules)).toContain("./_generated/api.js");
  const t = convexTest(schema, modules);

  expect(t).toBeDefined();
  const records = await t.run(async ({ db }) => {
    const userId = await db.insert("users", { email: "zoe@example.com" });
    const dogId = await db.insert("dogs", {
      name: "Zoe",
      birthday: "2026-02-14",
      timezone: "Europe/Bratislava",
      createdBy: userId,
    });

    return Promise.all([
      db.insert("authRateLimits", {
        identifier: "test@example.com",
        lastAttemptTime: 0,
        attemptsLeft: 10,
      }),
      db.insert("dogMembers", { dogId, userId, role: "owner" }),
      db.insert("activityTypes", {
        dogId,
        name: "Snuffle mat",
        isArchived: false,
      }),
      db.insert("routines", {
        dogId,
        kind: "meal",
        label: "Breakfast",
        timeOfDay: "07:30",
      }),
      db.insert("bodyMetrics", { dogId, at: 1, weightKg: 8.4 }),
      db.insert("agendaDays", {
        dogId,
        date: "2026-07-10",
        nextGoalId: 2,
        enrichmentGoals: [{ id: 1, text: "Snuffle mat", done: false }],
        trainingGoals: [],
      }),
    ]);
  });

  expect(records).toHaveLength(6);
});
