/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import { maxWalkEvents } from "./lib/events";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const birthdayStart = Date.parse("2026-02-13T23:00:00.000Z");
const validAt = birthdayStart + 60_000;

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
      name: "Milo",
      birthday: "2025-11-01",
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
    member: t.withIdentity({ subject: `${ids.memberId}|test-session` }),
    owner: t.withIdentity({ subject: `${ids.ownerId}|test-session` }),
    stranger: t.withIdentity({ subject: `${ids.strangerId}|test-session` }),
  };
};

test("requires authentication and dog membership", async () => {
  const { dogId, member, stranger, t } = await setup();
  const event = {
    dogId,
    kind: "pee" as const,
    at: validAt,
    peePlace: "outside" as const,
  };

  await expect(t.mutation(api.events.logQuick, event)).rejects.toThrow(
    "UNAUTHENTICATED",
  );
  await expect(stranger.mutation(api.events.logQuick, event)).rejects.toThrow(
    "FORBIDDEN",
  );
  await expect(
    stranger.query(api.events.listRecent, { dogId, limit: 10 }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    member.mutation(api.events.logQuick, event),
  ).resolves.toBeDefined();
});

test("orders backdated events and returns the latest quick event by kind", async () => {
  const { dogId, owner } = await setup();
  const peeId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "pee",
    peePlace: "outside",
    at: validAt + 3_000,
    note: "  Garden  ",
  });
  const mealId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "meal",
    at: validAt + 1_000,
    amount: 120,
  });
  const poopId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "poop",
    at: validAt + 2_000,
  });
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "pee",
    peePlace: "inside",
    at: validAt + 500,
  });

  await expect(
    owner.query(api.events.listRecent, { dogId, limit: 3 }),
  ).resolves.toEqual([
    expect.objectContaining({
      _id: peeId,
      at: validAt + 3_000,
      note: "Garden",
    }),
    expect.objectContaining({ _id: poopId, at: validAt + 2_000 }),
    expect.objectContaining({
      _id: mealId,
      at: validAt + 1_000,
      amount: 120,
    }),
  ]);
  await expect(
    owner.query(api.events.latestByKind, { dogId }),
  ).resolves.toEqual({
    pee: expect.objectContaining({ _id: peeId, at: validAt + 3_000 }),
    poop: expect.objectContaining({ _id: poopId, at: validAt + 2_000 }),
    meal: expect.objectContaining({ _id: mealId, at: validAt + 1_000 }),
    water: null,
    treat: null,
    wake: null,
    sleep: null,
    walk: null,
  });
});

test("requires pee place and allows changing it", async () => {
  const { dogId, owner } = await setup();
  await expect(
    owner.mutation(api.events.logQuick, {
      dogId,
      kind: "pee",
      at: validAt,
    }),
  ).rejects.toThrow("INVALID_PEE_PLACE");
  await expect(
    owner.mutation(api.events.logQuick, {
      dogId,
      kind: "poop",
      at: validAt,
      peePlace: "inside",
    }),
  ).rejects.toThrow("INVALID_PEE_PLACE");
  const eventId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "pee",
    at: validAt,
    peePlace: "inside",
  });
  await owner.mutation(api.events.update, {
    dogId,
    eventId,
    peePlace: "outside",
  });
  await expect(
    owner.query(api.events.listRecent, { dogId, limit: 1 }),
  ).resolves.toEqual([expect.objectContaining({ peePlace: "outside" })]);
});

test("returns the latest active or completed walk", async () => {
  const { dogId, owner } = await setup();
  const completedId = await owner.mutation(api.walks.start, {
    dogId,
    at: validAt,
  });
  await owner.mutation(api.walks.end, {
    dogId,
    walkId: completedId,
    endedAt: validAt + 1_000,
  });
  expect((await owner.query(api.events.latestByKind, { dogId })).walk).toEqual(
    expect.objectContaining({
      _id: completedId,
      at: validAt,
      endedAt: validAt + 1_000,
      kind: "walk",
    }),
  );

  const activeId = await owner.mutation(api.walks.start, {
    dogId,
    at: validAt + 2_000,
  });
  expect((await owner.query(api.events.latestByKind, { dogId })).walk).toEqual(
    expect.objectContaining({
      _id: activeId,
      at: validAt + 2_000,
      kind: "walk",
    }),
  );
});

test("refuses to partially delete a legacy walk over the child cap", async () => {
  const { dogId, owner, ownerId, t } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: validAt,
  });
  await t.run(async ({ db }) => {
    await Promise.all(
      Array.from({ length: maxWalkEvents + 1 }, (_, index) =>
        db.insert("events", {
          dogId,
          userId: ownerId,
          kind: index % 2 === 0 ? "pee" : "poop",
          at: validAt + index,
          walkId,
        }),
      ),
    );
  });

  await expect(
    owner.mutation(api.events.remove, { dogId, eventId: walkId }),
  ).rejects.toThrow("WALK_EVENT_LIMIT");
  const [walk, linkedEvents] = await t.run(async ({ db }) =>
    Promise.all([
      db.get("events", walkId),
      db
        .query("events")
        .withIndex("by_walk_at", (q) => q.eq("walkId", walkId))
        .collect(),
    ]),
  );
  expect(walk).not.toBeNull();
  expect(linkedEvents).toHaveLength(maxWalkEvents + 1);
  expect(linkedEvents.every((event) => event.walkId === walkId)).toBe(true);
});

test("edits and removes household events without crossing dog boundaries", async () => {
  const { dogId, member, otherDogId, owner, ownerId } = await setup();
  const eventId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "meal",
    at: validAt,
    note: "Breakfast",
    amount: 100,
  });
  const otherEventId = await owner.mutation(api.events.logQuick, {
    dogId: otherDogId,
    kind: "pee",
    peePlace: "outside",
    at: validAt + 2_000,
  });

  await member.mutation(api.events.update, {
    dogId,
    eventId,
    at: validAt + 1_500,
    note: "  Late breakfast  ",
    amount: 125,
  });
  await expect(
    owner.query(api.events.listRecent, { dogId, limit: 10 }),
  ).resolves.toEqual([
    expect.objectContaining({
      _id: eventId,
      at: validAt + 1_500,
      note: "Late breakfast",
      amount: 125,
      userId: ownerId,
    }),
  ]);

  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: otherEventId,
      note: "Wrong dog",
    }),
  ).rejects.toThrow("EVENT_NOT_FOUND");
  await expect(
    owner.mutation(api.events.remove, { dogId, eventId: otherEventId }),
  ).rejects.toThrow("EVENT_NOT_FOUND");
  await expect(
    member.mutation(api.events.remove, {
      dogId: otherDogId,
      eventId: otherEventId,
    }),
  ).rejects.toThrow("FORBIDDEN");

  await member.mutation(api.events.update, {
    dogId,
    eventId,
    note: null,
    amount: null,
  });
  const [cleared] = await owner.query(api.events.listRecent, {
    dogId,
    limit: 1,
  });
  expect(cleared).not.toHaveProperty("note");
  expect(cleared).not.toHaveProperty("amount");

  await expect(
    member.mutation(api.events.remove, { dogId, eventId }),
  ).resolves.toBeNull();
  await expect(
    member.mutation(api.events.remove, { dogId, eventId }),
  ).resolves.toBeNull();
  await expect(
    owner.query(api.events.listRecent, { dogId, limit: 10 }),
  ).resolves.toEqual([]);
});

test("rejects invalid event payloads and list limits without changing data", async () => {
  const { dogId, owner, t } = await setup();
  const invalidLogs = [
    [{ dogId, kind: "pee" as const, at: -1 }, "INVALID_TIMESTAMP"],
    [
      { dogId, kind: "pee" as const, at: Date.now() + 10 * 60 * 1_000 },
      "INVALID_TIMESTAMP",
    ],
    [
      { dogId, kind: "pee" as const, at: validAt, note: "x".repeat(501) },
      "INVALID_NOTE",
    ],
    [{ dogId, kind: "pee" as const, at: validAt, amount: 1 }, "INVALID_AMOUNT"],
    [
      { dogId, kind: "meal" as const, at: validAt, amount: 0 },
      "INVALID_AMOUNT",
    ],
    [
      { dogId, kind: "meal" as const, at: validAt, amount: 10_001 },
      "INVALID_AMOUNT",
    ],
  ] as const;

  for (const [args, error] of invalidLogs) {
    await expect(owner.mutation(api.events.logQuick, args)).rejects.toThrow(
      error,
    );
  }
  expect(await t.run(({ db }) => db.query("events").collect())).toEqual([]);

  const eventId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "pee",
    peePlace: "inside",
    at: validAt,
  });
  await expect(
    owner.mutation(api.events.update, { dogId, eventId }),
  ).rejects.toThrow("INVALID_UPDATE");
  await expect(
    owner.mutation(api.events.update, { dogId, eventId, amount: 1 }),
  ).rejects.toThrow("INVALID_AMOUNT");
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId,
      endedAt: validAt + 1,
    }),
  ).rejects.toThrow("INVALID_UPDATE");
  await expect(
    owner.mutation(api.events.update, { dogId, eventId, at: -1 }),
  ).rejects.toThrow("INVALID_TIMESTAMP");
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId,
      note: "x".repeat(501),
    }),
  ).rejects.toThrow("INVALID_NOTE");
  await expect(
    owner.query(api.events.listRecent, { dogId, limit: 0 }),
  ).rejects.toThrow("INVALID_LIMIT");
  await expect(
    owner.query(api.events.listRecent, { dogId, limit: 101 }),
  ).rejects.toThrow("INVALID_LIMIT");
  await expect(
    owner.query(api.events.listRecent, { dogId, limit: 1.5 }),
  ).rejects.toThrow("INVALID_LIMIT");

  await expect(
    owner.query(api.events.listRecent, { dogId, limit: 1 }),
  ).resolves.toEqual([
    expect.objectContaining({ _id: eventId, at: validAt, kind: "pee" }),
  ]);
});

test("accepts the birthday boundary and rejects the preceding dog-local date", async () => {
  const { dogId, owner } = await setup();

  await expect(
    owner.mutation(api.events.logQuick, {
      dogId,
      kind: "pee",
      peePlace: "inside",
      at: birthdayStart - 1,
    }),
  ).rejects.toThrow("INVALID_TIMESTAMP");
  const eventId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "pee",
    peePlace: "inside",
    at: birthdayStart,
  });
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId,
      at: birthdayStart - 1,
    }),
  ).rejects.toThrow("INVALID_TIMESTAMP");
  await expect(
    owner.query(api.events.listRecent, { dogId, limit: 1 }),
  ).resolves.toEqual([
    expect.objectContaining({ _id: eventId, at: birthdayStart }),
  ]);
});

test("accepts exact payload, timestamp, and list bounds", async () => {
  const { dogId, owner, ownerId, t } = await setup();
  const futureBoundary = Date.now() + 5 * 60 * 1_000;
  const note = "x".repeat(500);
  const eventId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "meal",
    at: futureBoundary,
    note,
    amount: 10_000,
  });
  await t.run(async ({ db }) => {
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        db.insert("events", {
          dogId,
          userId: ownerId,
          kind: "pee",
          at: validAt + index,
        }),
      ),
    );
  });

  const recent = await owner.query(api.events.listRecent, {
    dogId,
    limit: 100,
  });
  expect(recent).toHaveLength(100);
  expect(recent[0]).toEqual(
    expect.objectContaining({
      _id: eventId,
      at: futureBoundary,
      note,
      amount: 10_000,
    }),
  );
});

test("round-trips every quick kind and rejects deferred event kinds", async () => {
  const { dogId, owner } = await setup();
  const kinds = [
    "pee",
    "poop",
    "meal",
    "water",
    "treat",
    "wake",
    "sleep",
  ] as const;
  const ids = await Promise.all(
    kinds.map((kind, index) =>
      owner.mutation(api.events.logQuick, {
        dogId,
        kind,
        at: validAt + index,
        ...(kind === "meal" || kind === "treat" ? { amount: index + 1 } : {}),
        ...(kind === "pee" ? { peePlace: "outside" as const } : {}),
      }),
    ),
  );

  const latest = await owner.query(api.events.latestByKind, { dogId });
  kinds.forEach((kind, index) => {
    expect(latest[kind]).toEqual(
      expect.objectContaining({ _id: ids[index], kind }),
    );
  });
  await expect(
    owner.mutation(api.events.logQuick, {
      dogId,
      kind: "walk" as never,
      at: validAt,
    }),
  ).rejects.toThrow();
  await expect(
    owner.mutation(api.events.logQuick, {
      dogId,
      kind: "play" as never,
      at: validAt,
    }),
  ).rejects.toThrow();
  await expect(
    owner.mutation(api.events.logQuick, {
      dogId,
      kind: "note" as never,
      at: validAt,
    }),
  ).rejects.toThrow();
});

test("counts today's water events in a half-open time range", async () => {
  const { dogId, owner } = await setup();
  await Promise.all(
    [1_000, 2_000, 3_000].map((offset) =>
      owner.mutation(api.events.logQuick, {
        dogId,
        kind: "water",
        at: validAt + offset,
      }),
    ),
  );
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "meal",
    at: validAt + 2_000,
  });

  await expect(
    owner.query(api.events.waterCount, {
      dogId,
      startAt: validAt + 2_000,
      endAt: validAt + 4_000,
    }),
  ).resolves.toBe(2);
  await expect(
    owner.query(api.events.waterCount, {
      dogId,
      startAt: validAt,
      endAt: validAt,
    }),
  ).rejects.toThrow("INVALID_TIME_RANGE");
});
