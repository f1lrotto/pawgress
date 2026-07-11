import type { FunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.{ts,tsx}");
const birthdayAt = Date.parse("2026-02-13T23:00:00.000Z");

type BodyMetricsApi = {
  listRecent: FunctionReference<"query">;
  create: FunctionReference<"mutation">;
  update: FunctionReference<"mutation">;
  remove: FunctionReference<"mutation">;
};
const bodyMetrics = (api as unknown as { bodyMetrics: BodyMetricsApi })
  .bodyMetrics;

const setup = async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", {});
    const memberId = await db.insert("users", {});
    const strangerId = await db.insert("users", {});
    const dogId = await db.insert("dogs", {
      name: "Zoe",
      birthday: "2026-02-14",
      timezone: "Europe/Bratislava",
      createdBy: ownerId,
    });
    const otherDogId = await db.insert("dogs", {
      name: "Luna",
      birthday: "2026-02-14",
      timezone: "Europe/Bratislava",
      createdBy: ownerId,
    });
    await Promise.all([
      db.insert("dogMembers", { dogId, userId: ownerId, role: "owner" }),
      db.insert("dogMembers", { dogId, userId: memberId, role: "member" }),
      db.insert("dogMembers", {
        dogId: otherDogId,
        userId: ownerId,
        role: "owner",
      }),
    ]);
    return { dogId, memberId, otherDogId, ownerId, strangerId };
  });
  return {
    ...ids,
    t,
    owner: t.withIdentity({ subject: `${ids.ownerId}|test-session` }),
    member: t.withIdentity({ subject: `${ids.memberId}|test-session` }),
    stranger: t.withIdentity({ subject: `${ids.strangerId}|test-session` }),
  };
};

const records = (
  t: Awaited<ReturnType<typeof setup>>["t"],
  dogId: Awaited<ReturnType<typeof setup>>["dogId"],
) =>
  t.run(({ db }) =>
    db
      .query("bodyMetrics")
      .withIndex("by_dog_at", (q) => q.eq("dogId", dogId))
      .collect(),
  );

describe("body metrics", () => {
  it("authorizes every surface and rejects cross-dog record IDs", async () => {
    const { t, owner, member, stranger, dogId, otherDogId } = await setup();
    const createArgs = { dogId, at: birthdayAt, weightKg: 4.2 };

    await expect(
      t.query(bodyMetrics.listRecent, { dogId, limit: 10 }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(t.mutation(bodyMetrics.create, createArgs)).rejects.toThrow(
      "UNAUTHENTICATED",
    );
    await expect(
      stranger.query(bodyMetrics.listRecent, { dogId, limit: 10 }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      member.query(bodyMetrics.listRecent, { dogId: otherDogId, limit: 10 }),
    ).rejects.toThrow("FORBIDDEN");

    const otherMetricId = await owner.mutation(bodyMetrics.create, {
      dogId: otherDogId,
      at: birthdayAt,
      weightKg: 5,
    });
    await expect(
      t.mutation(bodyMetrics.update, {
        dogId: otherDogId,
        metricId: otherMetricId,
        weightKg: 6,
      }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      stranger.mutation(bodyMetrics.remove, {
        dogId: otherDogId,
        metricId: otherMetricId,
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      owner.mutation(bodyMetrics.update, {
        dogId,
        metricId: otherMetricId,
        weightKg: 6,
      }),
    ).rejects.toThrow("BODY_METRIC_NOT_FOUND");
    await expect(
      owner.mutation(bodyMetrics.remove, { dogId, metricId: otherMetricId }),
    ).rejects.toThrow("BODY_METRIC_NOT_FOUND");
  });

  it("lists newest records first with a bounded integer limit", async () => {
    const { t, owner, dogId } = await setup();
    const ids = await t.run(async ({ db }) =>
      Promise.all(
        [1, 3, 2].map((offset) =>
          db.insert("bodyMetrics", {
            dogId,
            at: birthdayAt + offset,
            weightKg: offset,
          }),
        ),
      ),
    );

    await expect(
      owner.query(bodyMetrics.listRecent, { dogId, limit: 2 }),
    ).resolves.toEqual([
      expect.objectContaining({ _id: ids[1], at: birthdayAt + 3 }),
      expect.objectContaining({ _id: ids[2], at: birthdayAt + 2 }),
    ]);
    for (const limit of [0, 1.5, 501]) {
      await expect(
        owner.query(bodyMetrics.listRecent, { dogId, limit }),
      ).rejects.toThrow("INVALID_LIMIT");
    }
  });

  it("creates one or more bounded measurements", async () => {
    const { owner, dogId } = await setup();
    const metricId = await owner.mutation(bodyMetrics.create, {
      dogId,
      at: birthdayAt,
      weightKg: 500,
      neckCm: 500,
      chestCm: 42.5,
      backCm: 38,
    });
    await expect(
      owner.query(bodyMetrics.listRecent, { dogId, limit: 1 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: metricId,
        weightKg: 500,
        neckCm: 500,
        chestCm: 42.5,
        backCm: 38,
      }),
    ]);

    await expect(
      owner.mutation(bodyMetrics.create, { dogId, at: birthdayAt }),
    ).rejects.toThrow("EMPTY_BODY_METRIC");
    for (const weightKg of [0, -1, 500.01]) {
      await expect(
        owner.mutation(bodyMetrics.create, {
          dogId,
          at: birthdayAt,
          weightKg,
        }),
      ).rejects.toThrow("INVALID_WEIGHT");
    }
    for (const value of [0, -1, 500.01]) {
      await expect(
        owner.mutation(bodyMetrics.create, {
          dogId,
          at: birthdayAt,
          neckCm: value,
        }),
      ).rejects.toThrow("INVALID_MEASUREMENT");
    }
  });

  it("uses dog-local birthday and future timestamp validation", async () => {
    const { t, owner, dogId, ownerId } = await setup();
    await expect(
      owner.mutation(bodyMetrics.create, {
        dogId,
        at: birthdayAt,
        weightKg: 4,
      }),
    ).resolves.toBeDefined();
    await expect(
      owner.mutation(bodyMetrics.create, {
        dogId,
        at: birthdayAt - 1,
        weightKg: 4,
      }),
    ).rejects.toThrow("INVALID_TIMESTAMP");
    await expect(
      owner.mutation(bodyMetrics.create, {
        dogId,
        at: Date.now() + 10 * 60_000,
        weightKg: 4,
      }),
    ).rejects.toThrow("INVALID_TIMESTAMP");

    const invalidZoneDogId = await t.run(async ({ db }) => {
      const id = await db.insert("dogs", {
        name: "Orbit",
        birthday: "2024-01-01",
        timezone: "Mars/Olympus",
        createdBy: ownerId,
      });
      await db.insert("dogMembers", {
        dogId: id,
        userId: ownerId,
        role: "owner",
      });
      return id;
    });
    await expect(
      owner.mutation(bodyMetrics.create, {
        dogId: invalidZoneDogId,
        at: birthdayAt,
        weightKg: 4,
      }),
    ).rejects.toThrow("INVALID_TIMESTAMP");
  });

  it("updates partially, clears fields, and preserves one measurement", async () => {
    const { owner, dogId } = await setup();
    const metricId = await owner.mutation(bodyMetrics.create, {
      dogId,
      at: birthdayAt,
      weightKg: 4,
      neckCm: 20,
      chestCm: 30,
    });
    await owner.mutation(bodyMetrics.update, {
      dogId,
      metricId,
      at: birthdayAt + 1_000,
      weightKg: null,
      chestCm: 31,
    });
    await expect(
      owner.query(bodyMetrics.listRecent, { dogId, limit: 1 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: metricId,
        at: birthdayAt + 1_000,
        neckCm: 20,
        chestCm: 31,
      }),
    ]);
    const [updated] = await owner.query(bodyMetrics.listRecent, {
      dogId,
      limit: 1,
    });
    expect(updated).not.toHaveProperty("weightKg");

    await expect(
      owner.mutation(bodyMetrics.update, { dogId, metricId }),
    ).rejects.toThrow("INVALID_UPDATE");
    await expect(
      owner.mutation(bodyMetrics.update, {
        dogId,
        metricId,
        neckCm: null,
        chestCm: null,
      }),
    ).rejects.toThrow("EMPTY_BODY_METRIC");
    await expect(
      owner.mutation(bodyMetrics.update, {
        dogId,
        metricId,
        at: birthdayAt - 1,
        chestCm: 99,
      }),
    ).rejects.toThrow("INVALID_TIMESTAMP");
    await expect(
      owner.mutation(bodyMetrics.update, {
        dogId,
        metricId,
        chestCm: 500.01,
      }),
    ).rejects.toThrow("INVALID_MEASUREMENT");
    await expect(
      owner.query(bodyMetrics.listRecent, { dogId, limit: 1 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: metricId,
        at: birthdayAt + 1_000,
        neckCm: 20,
        chestCm: 31,
      }),
    ]);
  });

  it("removes idempotently without affecting other dogs", async () => {
    const { t, owner, dogId } = await setup();
    const metricId = await owner.mutation(bodyMetrics.create, {
      dogId,
      at: birthdayAt,
      backCm: 30,
    });

    await expect(
      owner.mutation(bodyMetrics.remove, { dogId, metricId }),
    ).resolves.toBeNull();
    await expect(
      owner.mutation(bodyMetrics.remove, { dogId, metricId }),
    ).resolves.toBeNull();
    await expect(records(t, dogId)).resolves.toEqual([]);
  });
});
