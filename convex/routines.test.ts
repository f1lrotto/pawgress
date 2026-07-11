/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

type MealInput = { label: string; timeOfDay: string };

const invalidMealSchedules: Array<[string, MealInput[]]> = [
  ["an empty schedule", []],
  [
    "more than eight meals",
    Array.from({ length: 9 }, (_, index) => ({
      label: `Meal ${index + 1}`,
      timeOfDay: `0${index}:00`,
    })),
  ],
  ["a blank label", [{ label: "   ", timeOfDay: "07:30" }]],
  [
    "a label over 64 characters",
    [{ label: "x".repeat(65), timeOfDay: "07:30" }],
  ],
  ["a malformed time", [{ label: "Breakfast", timeOfDay: "7:30" }]],
  ["an out-of-range hour", [{ label: "Breakfast", timeOfDay: "24:00" }]],
  ["an out-of-range minute", [{ label: "Breakfast", timeOfDay: "12:60" }]],
];

test("allows owners and members to list routines but rejects non-members", async () => {
  const t = convexTest(schema, modules);
  const { dogId, ownerId, memberId, strangerId } = await t.run(
    async ({ db }) => {
      const ownerId = await db.insert("users", {});
      const memberId = await db.insert("users", {});
      const strangerId = await db.insert("users", {});
      const dogId = await db.insert("dogs", {
        name: "Zoe",
        birthday: "2026-02-14",
        timezone: "Europe/Bratislava",
        createdBy: ownerId,
      });
      await db.insert("dogMembers", { dogId, userId: ownerId, role: "owner" });
      await db.insert("dogMembers", {
        dogId,
        userId: memberId,
        role: "member",
      });
      await db.insert("routines", {
        dogId,
        kind: "meal",
        label: "Breakfast",
        timeOfDay: "07:30",
      });
      return { dogId, ownerId, memberId, strangerId };
    },
  );

  const owner = t.withIdentity({ subject: `${ownerId}|test-session` });
  const member = t.withIdentity({ subject: `${memberId}|test-session` });
  const stranger = t.withIdentity({ subject: `${strangerId}|test-session` });

  await expect(t.query(api.routines.list, { dogId })).rejects.toThrow(
    "UNAUTHENTICATED",
  );
  await expect(owner.query(api.routines.list, { dogId })).resolves.toEqual([
    expect.objectContaining({ label: "Breakfast", timeOfDay: "07:30" }),
  ]);
  await expect(
    member.query(api.routines.list, { dogId }),
  ).resolves.toHaveLength(1);
  await expect(stranger.query(api.routines.list, { dogId })).rejects.toThrow(
    "FORBIDDEN",
  );
});

test("replaces a schedule atomically and preserves it after rejected writes", async () => {
  const t = convexTest(schema, modules);
  const { dogId, ownerId, memberId, strangerId } = await t.run(
    async ({ db }) => {
      const ownerId = await db.insert("users", {});
      const memberId = await db.insert("users", {});
      const strangerId = await db.insert("users", {});
      const dogId = await db.insert("dogs", {
        name: "Zoe",
        birthday: "2026-02-14",
        timezone: "Europe/Bratislava",
        createdBy: ownerId,
      });
      await db.insert("dogMembers", { dogId, userId: ownerId, role: "owner" });
      await db.insert("dogMembers", {
        dogId,
        userId: memberId,
        role: "member",
      });
      await db.insert("routines", {
        dogId,
        kind: "meal",
        label: "Old meal",
        timeOfDay: "12:00",
      });
      return { dogId, ownerId, memberId, strangerId };
    },
  );
  const owner = t.withIdentity({ subject: `${ownerId}|test-session` });
  const member = t.withIdentity({ subject: `${memberId}|test-session` });
  const stranger = t.withIdentity({ subject: `${strangerId}|test-session` });

  await member.mutation(api.routines.replaceMeals, {
    dogId,
    meals: [
      { label: "Dinner", timeOfDay: "18:30" },
      { label: " Breakfast ", timeOfDay: "07:30" },
    ],
  });
  const expected = [
    expect.objectContaining({ label: "Breakfast", timeOfDay: "07:30" }),
    expect.objectContaining({ label: "Dinner", timeOfDay: "18:30" }),
  ];
  await expect(owner.query(api.routines.list, { dogId })).resolves.toEqual(
    expected,
  );

  await expect(
    stranger.mutation(api.routines.replaceMeals, {
      dogId,
      meals: [{ label: "Unauthorized", timeOfDay: "12:00" }],
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    owner.mutation(api.routines.replaceMeals, {
      dogId,
      meals: [
        { label: "Breakfast", timeOfDay: "08:00" },
        { label: "breakfast", timeOfDay: "09:00" },
      ],
    }),
  ).rejects.toThrow("INVALID_MEALS");
  await expect(owner.query(api.routines.list, { dogId })).resolves.toEqual(
    expected,
  );
});

test.each(invalidMealSchedules)(
  "rejects %s and preserves the existing schedule",
  async (_caseName, meals) => {
    const t = convexTest(schema, modules);
    const { dogId, ownerId } = await t.run(async ({ db }) => {
      const ownerId = await db.insert("users", {});
      const dogId = await db.insert("dogs", {
        name: "Zoe",
        birthday: "2026-02-14",
        timezone: "Europe/Bratislava",
        createdBy: ownerId,
      });
      await db.insert("dogMembers", { dogId, userId: ownerId, role: "owner" });
      await db.insert("routines", {
        dogId,
        kind: "meal",
        label: "Existing meal",
        timeOfDay: "12:00",
      });
      return { dogId, ownerId };
    });
    const owner = t.withIdentity({ subject: `${ownerId}|test-session` });

    await expect(
      owner.mutation(api.routines.replaceMeals, { dogId, meals }),
    ).rejects.toThrow("INVALID_MEALS");
    await expect(owner.query(api.routines.list, { dogId })).resolves.toEqual([
      expect.objectContaining({ label: "Existing meal", timeOfDay: "12:00" }),
    ]);
  },
);
