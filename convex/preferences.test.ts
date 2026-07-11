/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { maxPreferenceDocuments } from "./preferences";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const setup = async () => {
  const t = convexTest(schema, modules);
  const [firstId, secondId] = await t.run(async ({ db }) =>
    Promise.all([
      db.insert("users", { email: "first@example.com" }),
      db.insert("users", { email: "second@example.com" }),
    ]),
  );
  const as = (userId: Id<"users">) =>
    t.withIdentity({ subject: `${userId}|test-session` });
  return { first: as(firstId), firstId, second: as(secondId), secondId, t };
};

const listPreferences = (t: TestConvex<typeof schema>, userId: Id<"users">) =>
  t.run(({ db }) =>
    db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("asc")
      .collect(),
  );

test("requires authentication and a supported locale", async () => {
  const { first, t } = await setup();

  await expect(t.query(api.preferences.current)).rejects.toThrow(
    "UNAUTHENTICATED",
  );
  await expect(
    t.mutation(api.preferences.setLocale, { locale: "en" }),
  ).rejects.toThrow("UNAUTHENTICATED");
  await expect(
    first.mutation(api.preferences.setLocale, { locale: "de" as "en" }),
  ).rejects.toThrow();
});

test("persists one idempotent preference per user", async () => {
  const { first, firstId, t } = await setup();

  await expect(first.query(api.preferences.current)).resolves.toBeNull();
  await expect(
    first.mutation(api.preferences.setLocale, { locale: "sk" }),
  ).resolves.toBeNull();
  await first.mutation(api.preferences.setLocale, { locale: "sk" });

  await expect(first.query(api.preferences.current)).resolves.toBe("sk");
  await expect(listPreferences(t, firstId)).resolves.toHaveLength(1);
});

test("isolates preferences by authenticated user", async () => {
  const { first, second } = await setup();

  await first.mutation(api.preferences.setLocale, { locale: "sk" });
  await second.mutation(api.preferences.setLocale, { locale: "en" });

  await expect(first.query(api.preferences.current)).resolves.toBe("sk");
  await expect(second.query(api.preferences.current)).resolves.toBe("en");
});

test("serializes concurrent first writes and updates to one document", async () => {
  const { first, firstId, t } = await setup();
  const preferences = () => listPreferences(t, firstId);

  await Promise.all([
    first.mutation(api.preferences.setLocale, { locale: "en" }),
    first.mutation(api.preferences.setLocale, { locale: "sk" }),
  ]);
  expect(await preferences()).toHaveLength(1);

  const current = await first.query(api.preferences.current);
  const next = current === "en" ? "sk" : "en";
  await Promise.all([
    first.mutation(api.preferences.setLocale, { locale: next }),
    first.mutation(api.preferences.setLocale, { locale: next }),
  ]);
  await expect(first.query(api.preferences.current)).resolves.toBe(next);
  expect(await preferences()).toHaveLength(1);
});

test("reads conflicting duplicates deterministically and collapses them", async () => {
  const { first, firstId, t } = await setup();
  const oldestId = await t.run(async ({ db }) => {
    const oldest = await db.insert("userPreferences", {
      userId: firstId,
      locale: "sk",
    });
    await db.insert("userPreferences", { userId: firstId, locale: "en" });
    return oldest;
  });

  await expect(first.query(api.preferences.current)).resolves.toBe("sk");
  await expect(first.query(api.preferences.current)).resolves.toBe("sk");
  await first.mutation(api.preferences.setLocale, { locale: "en" });

  await expect(listPreferences(t, firstId)).resolves.toEqual([
    expect.objectContaining({ _id: oldestId, userId: firstId, locale: "en" }),
  ]);
});

test("rejects corruption beyond the cap without partial writes", async () => {
  const { first, firstId, t } = await setup();
  await t.run(({ db }) =>
    Promise.all(
      Array.from({ length: maxPreferenceDocuments + 1 }, (_, index) =>
        db.insert("userPreferences", {
          userId: firstId,
          locale: index % 2 === 0 ? "en" : "sk",
        }),
      ),
    ),
  );
  const before = await listPreferences(t, firstId);

  await expect(first.query(api.preferences.current)).rejects.toThrow(
    "PREFERENCE_CORRUPTION_LIMIT",
  );
  await expect(
    first.mutation(api.preferences.setLocale, { locale: "sk" }),
  ).rejects.toThrow("PREFERENCE_CORRUPTION_LIMIT");
  expect(await listPreferences(t, firstId)).toEqual(before);
});
