/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { maxDogMemberships } from "./dogs";
import { todayInTimezone, validateBirthday } from "./onboarding";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

type CompleteArgs = {
  name: string;
  birthday: string;
  timezone: string;
  weightKg: number;
  mealRoutines: Array<{ label: string; timeOfDay: string }>;
};

const validArgs: CompleteArgs = {
  name: " Zoe ",
  birthday: "2026-02-14",
  timezone: "Europe/Bratislava",
  weightKg: 8.4,
  mealRoutines: [
    { label: "Dinner", timeOfDay: "18:30" },
    { label: " Breakfast ", timeOfDay: "07:30" },
  ],
};

const englishActivityNames = [
  "Lick mat",
  "Snuffle mat",
  "Towel burrito",
  "Scatter feeding",
  "Tug",
  "Fetch",
];

const slovakActivityNames = [
  "Lízacia podložka",
  "Čuchacia podložka",
  "Burrito z uteráka",
  "Rozsypané kŕmenie",
  "Preťahovanie",
  "Aportovanie",
];

const readDomainTables = (t: TestConvex<typeof schema>) =>
  t.run(async ({ db }) => ({
    dogs: await db.query("dogs").collect(),
    dogMembers: await db.query("dogMembers").collect(),
    bodyMetrics: await db.query("bodyMetrics").collect(),
    routines: await db.query("routines").collect(),
    activityTypes: await db.query("activityTypes").collect(),
  }));

const seedMemberships = (
  t: TestConvex<typeof schema>,
  userId: Id<"users">,
  count: number,
) =>
  t.run(async ({ db }) => {
    for (let index = 0; index < count; index += 1) {
      const dogId = await db.insert("dogs", {
        birthday: "2024-01-01",
        createdBy: userId,
        name: `Existing dog ${String(index + 1).padStart(3, "0")}`,
        timezone: "UTC",
      });
      await db.insert("dogMembers", { dogId, userId, role: "owner" });
    }
  });

test("creates the complete onboarding graph with legacy English defaults", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(({ db }) => db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|test-session` });

  const dogId = await user.mutation(api.onboarding.complete, validArgs);
  const records = await readDomainTables(t);

  expect(records.dogs).toEqual([
    expect.objectContaining({
      _id: dogId,
      name: "Zoe",
      birthday: "2026-02-14",
      timezone: "Europe/Bratislava",
      createdBy: userId,
    }),
  ]);
  expect(records.dogMembers).toEqual([
    expect.objectContaining({ dogId, userId, role: "owner" }),
  ]);
  expect(records.bodyMetrics).toEqual([
    expect.objectContaining({ dogId, weightKg: 8.4, at: expect.any(Number) }),
  ]);
  expect(records.routines).toHaveLength(2);
  expect(records.activityTypes.map(({ name }) => name).sort()).toEqual(
    [...englishActivityNames].sort(),
  );
  expect(records.activityTypes.every(({ isArchived }) => !isArchived)).toBe(
    true,
  );

  await expect(user.query(api.dogs.listMine)).resolves.toEqual([
    expect.objectContaining({ _id: dogId, name: "Zoe", role: "owner" }),
  ]);
  await expect(user.query(api.routines.list, { dogId })).resolves.toEqual([
    expect.objectContaining({ label: "Breakfast", timeOfDay: "07:30" }),
    expect.objectContaining({ label: "Dinner", timeOfDay: "18:30" }),
  ]);
});

test.each([
  ["en", englishActivityNames],
  ["sk", slovakActivityNames],
] as const)(
  "seeds persisted %s activity names without translating meal labels",
  async (locale, expectedNames) => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async ({ db }) => {
      const id = await db.insert("users", {});
      await db.insert("userPreferences", { userId: id, locale });
      return id;
    });
    const user = t.withIdentity({ subject: `${userId}|test-session` });

    const dogId = await user.mutation(api.onboarding.complete, validArgs);
    const records = await readDomainTables(t);

    expect(records.activityTypes.map(({ name }) => name).sort()).toEqual(
      [...expectedNames].sort(),
    );
    await expect(user.query(api.routines.list, { dogId })).resolves.toEqual([
      expect.objectContaining({ label: "Breakfast", timeOfDay: "07:30" }),
      expect.objectContaining({ label: "Dinner", timeOfDay: "18:30" }),
    ]);
  },
);

test("accepts the exact puppy name and weight upper bounds", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(({ db }) => db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|test-session` });
  const name = "Z".repeat(64);

  const dogId = await user.mutation(api.onboarding.complete, {
    ...validArgs,
    name: ` ${name} `,
    weightKg: 500,
  });
  const records = await readDomainTables(t);

  expect(records.dogs).toEqual([expect.objectContaining({ _id: dogId, name })]);
  expect(records.bodyMetrics).toEqual([
    expect.objectContaining({ dogId, weightKg: 500 }),
  ]);
});

test("allows onboarding at the dog membership boundary", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(({ db }) => db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|test-session` });
  await seedMemberships(t, userId, maxDogMemberships - 1);

  const dogId = await user.mutation(api.onboarding.complete, validArgs);
  const records = await readDomainTables(t);

  expect(records.dogs).toHaveLength(maxDogMemberships);
  expect(records.dogMembers).toHaveLength(maxDogMemberships);
  expect(records.dogMembers).toContainEqual(
    expect.objectContaining({ dogId, userId, role: "owner" }),
  );
  await expect(user.query(api.dogs.listMine)).resolves.toHaveLength(
    maxDogMemberships,
  );
});

test("rejects onboarding at the dog membership cap without partial writes", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(({ db }) => db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|test-session` });
  await seedMemberships(t, userId, maxDogMemberships);
  const before = await readDomainTables(t);

  await expect(
    user.mutation(api.onboarding.complete, validArgs),
  ).rejects.toThrow("DOG_MEMBERSHIP_LIMIT");
  expect(await readDomainTables(t)).toEqual(before);
});

test("serializes concurrent onboarding at the dog membership boundary", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(({ db }) => db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|test-session` });
  await seedMemberships(t, userId, maxDogMemberships - 1);

  const results = await Promise.allSettled([
    user.mutation(api.onboarding.complete, { ...validArgs, name: "Zoe" }),
    user.mutation(api.onboarding.complete, { ...validArgs, name: "Milo" }),
  ]);
  const records = await readDomainTables(t);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const rejected = results.find(({ status }) => status === "rejected");
  if (!rejected || rejected.status !== "rejected") {
    throw new Error("Expected one onboarding mutation to be rejected");
  }
  expect(String(rejected.reason)).toContain("DOG_MEMBERSHIP_LIMIT");
  expect(records.dogs).toHaveLength(maxDogMemberships);
  expect(records.dogMembers).toHaveLength(maxDogMemberships);
  expect(records.bodyMetrics).toHaveLength(1);
  expect(records.routines).toHaveLength(validArgs.mealRoutines.length);
  expect(records.activityTypes).toHaveLength(6);
});

test("uses the dog's timezone when deciding whether a birthday is future", () => {
  const now = Date.parse("2026-01-01T12:30:00.000Z");

  expect(todayInTimezone("Etc/GMT+12", now)).toBe("2026-01-01");
  expect(todayInTimezone("Pacific/Kiritimati", now)).toBe("2026-01-02");
  expect(() =>
    validateBirthday("2026-01-02", "Pacific/Kiritimati", now),
  ).not.toThrow();
  expect(() => validateBirthday("2026-01-02", "Etc/GMT+12", now)).toThrow(
    "INVALID_BIRTHDAY",
  );
});

test("rejects signed-out completion without writing domain data", async () => {
  const t = convexTest(schema, modules);

  await expect(t.mutation(api.onboarding.complete, validArgs)).rejects.toThrow(
    "UNAUTHENTICATED",
  );
  expect(await readDomainTables(t)).toEqual({
    dogs: [],
    dogMembers: [],
    bodyMetrics: [],
    routines: [],
    activityTypes: [],
  });
});

const invalidCases: Array<{
  name: string;
  patch: Partial<CompleteArgs>;
  error: string;
}> = [
  { name: "blank name", patch: { name: "   " }, error: "INVALID_NAME" },
  {
    name: "name over 64 characters",
    patch: { name: ` ${"Z".repeat(65)} ` },
    error: "INVALID_NAME",
  },
  {
    name: "malformed birthday",
    patch: { birthday: "2026-2-14" },
    error: "INVALID_BIRTHDAY",
  },
  {
    name: "impossible birthday",
    patch: { birthday: "2026-02-30" },
    error: "INVALID_BIRTHDAY",
  },
  {
    name: "future birthday",
    patch: { birthday: "9999-12-31" },
    error: "INVALID_BIRTHDAY",
  },
  {
    name: "invalid timezone",
    patch: { timezone: "Mars/Olympus" },
    error: "INVALID_TIMEZONE",
  },
  { name: "zero weight", patch: { weightKg: 0 }, error: "INVALID_WEIGHT" },
  {
    name: "negative weight",
    patch: { weightKg: -1 },
    error: "INVALID_WEIGHT",
  },
  {
    name: "weight over 500 kilograms",
    patch: { weightKg: 500.01 },
    error: "INVALID_WEIGHT",
  },
  {
    name: "infinite weight",
    patch: { weightKg: Infinity },
    error: "INVALID_WEIGHT",
  },
  {
    name: "NaN weight",
    patch: { weightKg: Number.NaN },
    error: "INVALID_WEIGHT",
  },
  {
    name: "no meals",
    patch: { mealRoutines: [] },
    error: "INVALID_MEALS",
  },
  {
    name: "blank meal label",
    patch: { mealRoutines: [{ label: " ", timeOfDay: "07:30" }] },
    error: "INVALID_MEALS",
  },
  {
    name: "duplicate trimmed meal labels",
    patch: {
      mealRoutines: [
        { label: "Breakfast", timeOfDay: "07:30" },
        { label: " breakfast ", timeOfDay: "09:30" },
      ],
    },
    error: "INVALID_MEALS",
  },
  {
    name: "non-padded meal time",
    patch: { mealRoutines: [{ label: "Breakfast", timeOfDay: "7:30" }] },
    error: "INVALID_MEALS",
  },
  {
    name: "out-of-range meal time",
    patch: { mealRoutines: [{ label: "Breakfast", timeOfDay: "24:00" }] },
    error: "INVALID_MEALS",
  },
];

test.each(invalidCases)(
  "rejects $name and leaves every domain table empty",
  async ({ patch, error }) => {
    const t = convexTest(schema, modules);
    const userId = await t.run(({ db }) => db.insert("users", {}));
    const user = t.withIdentity({ subject: `${userId}|test-session` });

    await expect(
      user.mutation(api.onboarding.complete, { ...validArgs, ...patch }),
    ).rejects.toThrow(error);
    expect(await readDomainTables(t)).toEqual({
      dogs: [],
      dogMembers: [],
      bodyMetrics: [],
      routines: [],
      activityTypes: [],
    });
  },
);
