/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const baseAt = Date.parse("2026-01-15T10:00:00.000Z");

const setup = async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", {});
    const memberId = await db.insert("users", {});
    const strangerId = await db.insert("users", {});
    const dogId = await db.insert("dogs", {
      name: "Zoe",
      birthday: "2024-01-15",
      timezone: "UTC",
      createdBy: ownerId,
    });
    const otherDogId = await db.insert("dogs", {
      name: "Milo",
      birthday: "2024-01-15",
      timezone: "UTC",
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

test("rest events start without state and alternate awake and asleep", async () => {
  const { dogId, member, owner } = await setup();
  const initial = await owner.query(api.events.latestByKind, { dogId });
  expect(initial.wake).toBeNull();
  expect(initial.sleep).toBeNull();

  const wakeId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt,
  });
  await expect(
    member.mutation(api.events.logQuick, {
      dogId,
      kind: "wake",
      at: baseAt + 1,
    }),
  ).rejects.toThrow("INVALID_REST_TRANSITION");
  const sleepId = await member.mutation(api.events.logQuick, {
    dogId,
    kind: "sleep",
    at: baseAt + 2,
  });
  await expect(
    owner.mutation(api.events.logQuick, {
      dogId,
      kind: "sleep",
      at: baseAt + 3,
    }),
  ).rejects.toThrow("INVALID_REST_TRANSITION");

  const asleep = await owner.query(api.events.latestByKind, { dogId });
  expect(asleep.wake).toEqual(expect.objectContaining({ _id: wakeId }));
  expect(asleep.sleep).toEqual(expect.objectContaining({ _id: sleepId }));
  expect(asleep.sleep!.at).toBeGreaterThan(asleep.wake!.at);

  const latestWakeId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt + 4,
  });
  const awake = await owner.query(api.events.latestByKind, { dogId });
  expect(awake.wake).toEqual(expect.objectContaining({ _id: latestWakeId }));
  expect(awake.wake!.at).toBeGreaterThan(awake.sleep!.at);
});

test("backdated rest transitions must fit both chronological neighbors", async () => {
  const { dogId, owner } = await setup();
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "sleep",
    at: baseAt + 300,
  });
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt + 100,
  });
  await expect(
    owner.mutation(api.events.logQuick, {
      dogId,
      kind: "sleep",
      at: baseAt + 50,
    }),
  ).resolves.toBeDefined();

  for (const [kind, at] of [
    ["wake", baseAt + 200],
    ["sleep", baseAt + 200],
    ["wake", baseAt + 300],
    ["sleep", baseAt + 300],
  ] as const) {
    await expect(
      owner.mutation(api.events.logQuick, { dogId, kind, at }),
    ).rejects.toThrow("INVALID_REST_TRANSITION");
  }
});

test("logs a complete sleep interval atomically", async () => {
  const { dogId, member, owner } = await setup();
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt,
  });

  const created = await member.mutation(api.events.logRestInterval, {
    dogId,
    startedAt: baseAt + 100,
    endedAt: baseAt + 200,
  });
  const recent = await owner.query(api.events.listRecent, { dogId, limit: 3 });

  expect(created).toEqual({
    sleepId: expect.any(String),
    wakeId: expect.any(String),
  });
  expect(recent.map(({ kind }) => kind)).toEqual(["wake", "sleep", "wake"]);
  expect(recent[0]).toEqual(
    expect.objectContaining({ _id: created.wakeId, at: baseAt + 200 }),
  );
  expect(recent[1]).toEqual(
    expect.objectContaining({ _id: created.sleepId, at: baseAt + 100 }),
  );
});

test("logs complete sleep before and after an existing interval", async () => {
  const { dogId, owner } = await setup();
  await owner.mutation(api.events.logRestInterval, {
    dogId,
    startedAt: baseAt + 300,
    endedAt: baseAt + 400,
  });

  await expect(
    owner.mutation(api.events.logRestInterval, {
      dogId,
      startedAt: baseAt + 100,
      endedAt: baseAt + 200,
    }),
  ).resolves.toEqual({
    sleepId: expect.any(String),
    wakeId: expect.any(String),
  });
  await expect(
    owner.mutation(api.events.logRestInterval, {
      dogId,
      startedAt: baseAt + 500,
      endedAt: baseAt + 600,
    }),
  ).resolves.toEqual({
    sleepId: expect.any(String),
    wakeId: expect.any(String),
  });

  const recent = await owner.query(api.events.listRecent, { dogId, limit: 6 });
  expect(recent.map(({ kind }) => kind)).toEqual([
    "wake",
    "sleep",
    "wake",
    "sleep",
    "wake",
    "sleep",
  ]);
});

test("rejects invalid complete sleep intervals without partial rows", async () => {
  const { dogId, owner } = await setup();
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt,
  });
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "sleep",
    at: baseAt + 200,
  });
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt + 300,
  });

  await expect(
    owner.mutation(api.events.logRestInterval, {
      dogId,
      startedAt: baseAt + 100,
      endedAt: baseAt + 250,
    }),
  ).rejects.toThrow("INVALID_REST_TRANSITION");
  await expect(
    owner.mutation(api.events.logRestInterval, {
      dogId,
      startedAt: baseAt + 400,
      endedAt: baseAt + 400,
    }),
  ).rejects.toThrow("INVALID_REST_INTERVAL");

  const recent = await owner.query(api.events.listRecent, { dogId, limit: 10 });
  expect(recent.map(({ kind }) => kind)).toEqual(["wake", "sleep", "wake"]);
});

test("concurrent household transitions preserve a single next state", async () => {
  const { dogId, member, owner } = await setup();
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt,
  });

  const results = await Promise.allSettled([
    owner.mutation(api.events.logQuick, {
      dogId,
      kind: "sleep",
      at: baseAt + 10,
    }),
    member.mutation(api.events.logQuick, {
      dogId,
      kind: "sleep",
      at: baseAt + 20,
    }),
  ]);
  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  expect(String(rejected?.reason)).toContain("INVALID_REST_TRANSITION");

  const recent = await owner.query(api.events.listRecent, { dogId, limit: 10 });
  expect(recent.filter(({ kind }) => kind === "sleep")).toHaveLength(1);
});

test("moving a rest event preserves both its old and new neighbors", async () => {
  const { dogId, member, owner } = await setup();
  const firstWakeId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt + 100,
  });
  const sleepId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "sleep",
    at: baseAt + 200,
  });
  const lastWakeId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt + 300,
  });

  await member.mutation(api.events.update, {
    dogId,
    eventId: sleepId,
    at: baseAt + 250,
    note: "  Settled quickly  ",
  });
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: sleepId,
      at: baseAt + 350,
    }),
  ).rejects.toThrow("INVALID_REST_TRANSITION");
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: sleepId,
      at: baseAt + 300,
    }),
  ).rejects.toThrow("INVALID_REST_TRANSITION");
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: firstWakeId,
      at: baseAt + 50,
    }),
  ).resolves.toBeNull();
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: lastWakeId,
      at: baseAt + 350,
    }),
  ).resolves.toBeNull();

  const events = await owner.query(api.events.listRecent, { dogId, limit: 3 });
  expect(events.map(({ kind }) => kind)).toEqual(["wake", "sleep", "wake"]);
  expect(events.find(({ _id }) => _id === sleepId)).toEqual(
    expect.objectContaining({ at: baseAt + 250, note: "Settled quickly" }),
  );
});

test("deleting rest transitions allows endpoints but protects the middle", async () => {
  const { dogId, owner } = await setup();
  const firstWakeId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt + 100,
  });
  const sleepId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "sleep",
    at: baseAt + 200,
  });
  const lastWakeId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt + 300,
  });

  await expect(
    owner.mutation(api.events.remove, { dogId, eventId: sleepId }),
  ).rejects.toThrow("INVALID_REST_TRANSITION");
  await expect(
    owner.mutation(api.events.remove, { dogId, eventId: firstWakeId }),
  ).resolves.toBeNull();
  await expect(
    owner.mutation(api.events.remove, { dogId, eventId: lastWakeId }),
  ).resolves.toBeNull();
  await expect(
    owner.mutation(api.events.remove, { dogId, eventId: lastWakeId }),
  ).resolves.toBeNull();

  const latest = await owner.query(api.events.latestByKind, { dogId });
  expect(latest.wake).toBeNull();
  expect(latest.sleep).toEqual(expect.objectContaining({ _id: sleepId }));
});

test("rest rules leave non-rest event logging, movement, and deletion unchanged", async () => {
  const { dogId, owner } = await setup();
  await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "wake",
    at: baseAt,
  });
  const peeId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "pee",
    peePlace: "outside",
    at: baseAt,
  });
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: peeId,
      at: baseAt,
      note: "Same timestamp is fine",
    }),
  ).resolves.toBeNull();
  await expect(
    owner.mutation(api.events.remove, { dogId, eventId: peeId }),
  ).resolves.toBeNull();
});

test("rest mutations retain membership and cross-dog protection", async () => {
  const { dogId, member, otherDogId, owner, stranger } = await setup();
  await expect(
    stranger.mutation(api.events.logQuick, {
      dogId,
      kind: "wake",
      at: baseAt,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    stranger.query(api.events.latestByKind, { dogId }),
  ).rejects.toThrow("FORBIDDEN");

  const eventId = await member.mutation(api.events.logQuick, {
    dogId,
    kind: "sleep",
    at: baseAt,
  });
  await expect(
    owner.mutation(api.events.update, {
      dogId: otherDogId,
      eventId,
      at: baseAt + 1,
    }),
  ).rejects.toThrow("EVENT_NOT_FOUND");
  await expect(
    owner.mutation(api.events.remove, {
      dogId: otherDogId,
      eventId,
    }),
  ).rejects.toThrow("EVENT_NOT_FOUND");
});
