/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import {
  maxDogMemberships,
  maxWaterIntervalMinutes,
  minWaterIntervalMinutes,
} from "./dogs";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

test("rejects signed-out access to a user's dogs", async () => {
  const t = convexTest(schema, modules);

  await expect(t.query(api.dogs.listMine)).rejects.toThrow("UNAUTHENTICATED");
});

test("lists the same dog with each user's membership role", async () => {
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
      return { dogId, ownerId, memberId, strangerId };
    },
  );

  await expect(
    t
      .withIdentity({ subject: `${ownerId}|test-session` })
      .query(api.dogs.listMine),
  ).resolves.toEqual([
    expect.objectContaining({ _id: dogId, name: "Zoe", role: "owner" }),
  ]);
  await expect(
    t
      .withIdentity({ subject: `${memberId}|test-session` })
      .query(api.dogs.listMine),
  ).resolves.toEqual([
    expect.objectContaining({ _id: dogId, name: "Zoe", role: "member" }),
  ]);
  await expect(
    t
      .withIdentity({ subject: `${strangerId}|test-session` })
      .query(api.dogs.listMine),
  ).resolves.toEqual([]);
});

test("shares an optional validated water interval with the household", async () => {
  const t = convexTest(schema, modules);
  const { dogId, memberId, ownerId } = await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", {});
    const memberId = await db.insert("users", {});
    const dogId = await db.insert("dogs", {
      name: "Zoe",
      birthday: "2024-01-01",
      timezone: "UTC",
      createdBy: ownerId,
    });
    await Promise.all([
      db.insert("dogMembers", { dogId, userId: ownerId, role: "owner" }),
      db.insert("dogMembers", { dogId, userId: memberId, role: "member" }),
    ]);
    return { dogId, memberId, ownerId };
  });
  const owner = t.withIdentity({ subject: `${ownerId}|test-session` });
  const member = t.withIdentity({ subject: `${memberId}|test-session` });

  await member.mutation(api.dogs.setWaterTracking, {
    dogId,
    intervalMinutes: 120,
  });
  await expect(owner.query(api.dogs.listMine)).resolves.toEqual([
    expect.objectContaining({ _id: dogId, waterIntervalMinutes: 120 }),
  ]);

  for (const intervalMinutes of [
    minWaterIntervalMinutes - 1,
    maxWaterIntervalMinutes + 1,
    120.5,
  ]) {
    await expect(
      owner.mutation(api.dogs.setWaterTracking, { dogId, intervalMinutes }),
    ).rejects.toThrow("INVALID_WATER_INTERVAL");
  }

  await owner.mutation(api.dogs.setWaterTracking, {
    dogId,
    intervalMinutes: null,
  });
  expect((await member.query(api.dogs.listMine))[0]).not.toHaveProperty(
    "waterIntervalMinutes",
  );
});

test("lists multiple dogs in deterministic name order with exact roles", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(({ db }) => db.insert("users", {}));
  const dogIds = await t.run(async ({ db }) => {
    const dogs = await Promise.all(
      [
        ["Zoe", "member"],
        ["Alfie", "owner"],
        ["Alfie", "member"],
      ].map(async ([name, role]) => {
        const dogId = await db.insert("dogs", {
          name,
          birthday: "2024-01-01",
          timezone: "UTC",
          createdBy: userId,
        });
        await db.insert("dogMembers", {
          dogId,
          userId,
          role: role as "owner" | "member",
        });
        return dogId;
      }),
    );
    return dogs;
  });
  const user = t.withIdentity({ subject: `${userId}|test-session` });

  const first = await user.query(api.dogs.listMine);
  const second = await user.query(api.dogs.listMine);
  expect(first).toEqual(second);
  expect(first.map(({ _id, name, role }) => ({ _id, name, role }))).toEqual([
    { _id: dogIds[1], name: "Alfie", role: "owner" },
    { _id: dogIds[2], name: "Alfie", role: "member" },
    { _id: dogIds[0], name: "Zoe", role: "member" },
  ]);
});

test("deduplicates matching roles and rejects conflicting duplicate roles", async () => {
  const t = convexTest(schema, modules);
  const { dogId, userId } = await t.run(async ({ db }) => {
    const userId = await db.insert("users", {});
    const dogId = await db.insert("dogs", {
      name: "Zoe",
      birthday: "2024-01-01",
      timezone: "UTC",
      createdBy: userId,
    });
    await Promise.all([
      db.insert("dogMembers", { dogId, userId, role: "member" }),
      db.insert("dogMembers", { dogId, userId, role: "member" }),
    ]);
    return { dogId, userId };
  });
  const user = t.withIdentity({ subject: `${userId}|test-session` });

  await expect(user.query(api.dogs.listMine)).resolves.toEqual([
    expect.objectContaining({ _id: dogId, role: "member" }),
  ]);
  await t.run(({ db }) =>
    db.insert("dogMembers", { dogId, userId, role: "owner" }),
  );
  await expect(user.query(api.dogs.listMine)).rejects.toThrow(
    "CONFLICTING_DOG_MEMBERSHIP",
  );
});

test("rejects membership overflow instead of truncating dogs", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(({ db }) => db.insert("users", {}));
  await t.run(async ({ db }) => {
    for (let index = 0; index <= maxDogMemberships; index += 1) {
      const dogId = await db.insert("dogs", {
        name: `Dog ${String(index).padStart(3, "0")}`,
        birthday: "2024-01-01",
        timezone: "UTC",
        createdBy: userId,
      });
      await db.insert("dogMembers", {
        dogId,
        userId,
        role: index === 0 ? "owner" : "member",
      });
    }
  });

  await expect(
    t
      .withIdentity({ subject: `${userId}|test-session` })
      .query(api.dogs.listMine),
  ).rejects.toThrow("DOG_MEMBERSHIP_LIMIT");
});
