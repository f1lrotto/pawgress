/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { maxWalkEvents } from "./lib/events";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const birthdayStart = Date.parse("2024-01-15T00:00:00.000Z");
const walkStart = Date.parse("2026-01-15T10:00:00.000Z");

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

test("walk functions require authentication and dog membership", async () => {
  const { dogId, owner, stranger, t } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });

  await expect(t.query(api.walks.active, { dogId })).rejects.toThrow(
    "UNAUTHENTICATED",
  );
  await expect(
    t.mutation(api.walks.start, { dogId, at: walkStart }),
  ).rejects.toThrow("UNAUTHENTICATED");
  await expect(stranger.query(api.walks.active, { dogId })).rejects.toThrow(
    "FORBIDDEN",
  );
  await expect(
    stranger.mutation(api.walks.start, { dogId, at: walkStart }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    stranger.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: walkStart + 1_000,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    stranger.mutation(api.walks.logPotty, {
      dogId,
      walkId,
      kind: "pee",
      at: walkStart,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    stranger.mutation(api.walks.createWithPotty, {
      dogId,
      kind: "poop",
      pottyAt: walkStart,
      walkStartedAt: walkStart,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    stranger.mutation(api.walks.undoReconstruction, {
      dogId,
      eventId: walkId,
      walkId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    stranger.mutation(api.walks.updateDiary, {
      dogId,
      walkId,
      note: "No access",
    }),
  ).rejects.toThrow("FORBIDDEN");
});

test("start enforces one active walk transactionally and members can participate", async () => {
  const { dogId, member, owner } = await setup();
  await expect(owner.query(api.walks.active, { dogId })).resolves.toBeNull();

  const starts = await Promise.allSettled([
    owner.mutation(api.walks.start, {
      dogId,
      at: walkStart,
      note: "  Morning loop  ",
    }),
    member.mutation(api.walks.start, { dogId, at: walkStart + 1 }),
  ]);
  expect(starts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(starts.filter(({ status }) => status === "rejected")).toHaveLength(1);
  expect(starts.find(({ status }) => status === "rejected")).toMatchObject({
    reason: expect.any(Error),
  });

  const active = await owner.query(api.walks.active, { dogId });
  expect(active).toEqual(
    expect.objectContaining({
      dogId,
      kind: "walk",
    }),
  );
  await expect(
    owner.mutation(api.walks.start, { dogId, at: walkStart + 2 }),
  ).rejects.toThrow("WALK_ALREADY_ACTIVE");
});

test("end validates duration and boundaries, then permits the next walk", async () => {
  const { dogId, member, owner } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });

  await expect(
    member.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: walkStart - 1,
    }),
  ).rejects.toThrow("INVALID_WALK_DURATION");
  await expect(
    member.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: Date.now() + 10 * 60_000,
    }),
  ).rejects.toThrow("INVALID_TIMESTAMP");
  await expect(owner.query(api.walks.active, { dogId })).resolves.toEqual(
    expect.objectContaining({ _id: walkId }),
  );

  await expect(
    member.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: walkStart,
      note: "  Tiny first walk  ",
    }),
  ).resolves.toBe(walkStart);
  await expect(owner.query(api.walks.active, { dogId })).resolves.toBeNull();
  await expect(
    owner.mutation(api.walks.start, { dogId, at: walkStart + 1 }),
  ).resolves.toBeDefined();
});

test("walk timestamps and notes share event validation", async () => {
  const { dogId, owner, t } = await setup();

  await expect(
    owner.mutation(api.walks.start, { dogId, at: birthdayStart - 1 }),
  ).rejects.toThrow("INVALID_TIMESTAMP");
  await expect(
    owner.mutation(api.walks.start, {
      dogId,
      at: Date.now() + 10 * 60_000,
    }),
  ).rejects.toThrow("INVALID_TIMESTAMP");
  await expect(
    owner.mutation(api.walks.start, {
      dogId,
      at: walkStart,
      note: "x".repeat(501),
    }),
  ).rejects.toThrow("INVALID_NOTE");
  expect(await t.run(({ db }) => db.query("events").collect())).toEqual([]);
  await expect(
    owner.mutation(api.walks.start, { dogId, at: birthdayStart }),
  ).resolves.toBeDefined();
});

test("end is idempotent for compatible concurrent completions", async () => {
  const { dogId, owner, t } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const completions = [walkStart + 10_000, walkStart + 20_000];

  const results = await Promise.all([
    owner.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: completions[0],
      note: "Park loop",
    }),
    owner.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: completions[1],
      note: "  Park loop  ",
    }),
  ]);
  expect(results[0]).toBe(results[1]);
  expect(completions).toContain(results[0]);
  await expect(
    owner.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: completions[0],
      note: "Park loop",
    }),
  ).resolves.toBe(results[0]);
  await expect(
    owner.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: completions[1],
      note: "Conflicting diary",
    }),
  ).rejects.toThrow("WALK_ALREADY_ENDED");

  const walk = await t.run(({ db }) => db.get("events", walkId));
  expect(walk?.endedAt).toBe(results[0]);
  expect(walk?.note).toBe("Park loop");
});

test("ended walks never gain diary text through completion retries", async () => {
  const { dogId, owner, t } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const endedAt = walkStart + 10_000;
  await owner.mutation(api.walks.end, { dogId, walkId, endedAt });

  await expect(
    owner.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: endedAt + 1,
      note: "Late diary",
    }),
  ).rejects.toThrow("WALK_ALREADY_ENDED");
  await expect(
    owner.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: endedAt + 1,
    }),
  ).resolves.toBe(endedAt);
  expect(await t.run(({ db }) => db.get("events", walkId))).not.toHaveProperty(
    "note",
  );
});

test("potty logs are linked and require an active walk", async () => {
  const { dogId, member, memberId, owner } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const peeId = await member.mutation(api.walks.logPotty, {
    dogId,
    walkId,
    kind: "pee",
    peePlace: "outside",
    at: walkStart,
    note: "  By the gate  ",
  });
  await expect(
    member.mutation(api.walks.logPotty, {
      dogId,
      walkId,
      kind: "poop",
      at: walkStart - 1,
    }),
  ).rejects.toThrow("INVALID_WALK_TIMESTAMP");
  await expect(
    member.mutation(api.walks.logPotty, {
      dogId,
      walkId,
      kind: "pee",
      peePlace: "outside",
      at: Date.now() + 10 * 60_000,
    }),
  ).rejects.toThrow("INVALID_TIMESTAMP");

  const endedAt = walkStart + 60_000;
  await owner.mutation(api.walks.end, { dogId, walkId, endedAt });
  await expect(
    member.mutation(api.walks.logPotty, {
      dogId,
      walkId,
      kind: "pee",
      peePlace: "outside",
      at: endedAt,
    }),
  ).rejects.toThrow("WALK_NOT_ACTIVE");
  await expect(
    member.mutation(api.walks.logPotty, {
      dogId,
      walkId,
      kind: "meal" as never,
      at: walkStart,
    }),
  ).rejects.toThrow();

  const recent = await owner.query(api.events.listRecent, { dogId, limit: 3 });
  expect(recent).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        _id: peeId,
        kind: "pee",
        note: "By the gate",
        userId: memberId,
        walkId,
      }),
    ]),
  );
});

test("creates active and completed walks with their potty atomically", async () => {
  const { dogId, owner, t } = await setup();
  const activePottyAt = walkStart + 5 * 60_000;
  const active = await owner.mutation(api.walks.createWithPotty, {
    dogId,
    kind: "pee",
    peePlace: "outside",
    pottyAt: activePottyAt,
    walkStartedAt: walkStart,
    note: "  Near the gate  ",
  });
  await expect(owner.query(api.walks.active, { dogId })).resolves.toEqual(
    expect.objectContaining({ _id: active.walkId, at: walkStart }),
  );
  expect(await t.run(({ db }) => db.get("events", active.eventId))).toEqual(
    expect.objectContaining({
      at: activePottyAt,
      kind: "pee",
      note: "Near the gate",
      peePlace: "outside",
      walkId: active.walkId,
    }),
  );

  await owner.mutation(api.walks.end, {
    dogId,
    walkId: active.walkId,
    endedAt: activePottyAt,
  });
  const completedStart = activePottyAt;
  const completedPottyAt = completedStart + 5 * 60_000;
  const completedEnd = completedStart + 20 * 60_000;
  const completed = await owner.mutation(api.walks.createWithPotty, {
    dogId,
    kind: "poop",
    pottyAt: completedPottyAt,
    walkStartedAt: completedStart,
    walkEndedAt: completedEnd,
  });
  expect(await t.run(({ db }) => db.get("events", completed.walkId))).toEqual(
    expect.objectContaining({
      at: completedStart,
      endedAt: completedEnd,
      kind: "walk",
    }),
  );
  expect(await t.run(({ db }) => db.get("events", completed.eventId))).toEqual(
    expect.objectContaining({ kind: "poop", walkId: completed.walkId }),
  );
});

test("creates a complete walk with multiple timed potty events", async () => {
  const { dogId, member, memberId, t } = await setup();
  const endedAt = walkStart + 30 * 60_000;
  const peeAt = walkStart + 7 * 60_000;
  const poopAt = walkStart + 19 * 60_000;

  const created = await member.mutation(api.walks.createComplete, {
    dogId,
    walkStartedAt: walkStart,
    walkEndedAt: endedAt,
    pottyEvents: [
      { kind: "poop", at: poopAt },
      { kind: "pee", at: peeAt },
    ],
  });
  const [walk, pottyEvents] = await t.run(async ({ db }) =>
    Promise.all([
      db.get("events", created.walkId),
      db
        .query("events")
        .withIndex("by_walk_at", (q) => q.eq("walkId", created.walkId))
        .collect(),
    ]),
  );

  expect(walk).toEqual(
    expect.objectContaining({
      at: walkStart,
      endedAt,
      kind: "walk",
      userId: memberId,
    }),
  );
  expect(created.eventIds).toHaveLength(2);
  expect(pottyEvents).toEqual([
    expect.objectContaining({
      at: peeAt,
      kind: "pee",
      peePlace: "outside",
    }),
    expect.objectContaining({ at: poopAt, kind: "poop" }),
  ]);
});

test("rejects invalid complete walks without partial rows", async () => {
  const { dogId, owner, t } = await setup();
  const invalid = [
    {
      walkStartedAt: walkStart,
      walkEndedAt: walkStart,
      pottyEvents: [],
      error: "INVALID_WALK_INTERVAL",
    },
    {
      walkStartedAt: walkStart,
      walkEndedAt: walkStart + 20 * 60_000,
      pottyEvents: [{ kind: "pee" as const, at: walkStart - 1 }],
      error: "INVALID_WALK_TIMESTAMP",
    },
  ];

  for (const { error, ...args } of invalid) {
    await expect(
      owner.mutation(api.walks.createComplete, { dogId, ...args }),
    ).rejects.toThrow(error);
  }
  await expect(
    owner.mutation(api.walks.createComplete, {
      dogId,
      walkStartedAt: walkStart,
      walkEndedAt: walkStart + 20 * 60_000,
      pottyEvents: Array.from({ length: maxWalkEvents + 1 }, (_, index) => ({
        kind: "poop" as const,
        at: walkStart + index,
      })),
    }),
  ).rejects.toThrow("WALK_EVENT_LIMIT");
  expect(await t.run(({ db }) => db.query("events").collect())).toEqual([]);
});

test("rejects invalid reconstructed potty intervals without partial rows", async () => {
  const { dogId, owner, t } = await setup();
  const invalid = [
    {
      kind: "pee" as const,
      peePlace: "inside" as const,
      pottyAt: walkStart + 5 * 60_000,
      walkStartedAt: walkStart,
      walkEndedAt: walkStart + 20 * 60_000,
    },
    {
      kind: "poop" as const,
      pottyAt: walkStart,
      walkStartedAt: walkStart + 1,
      walkEndedAt: walkStart + 20 * 60_000,
    },
    {
      kind: "poop" as const,
      pottyAt: walkStart + 10 * 60_000,
      walkStartedAt: walkStart,
      walkEndedAt: walkStart + 5 * 60_000,
    },
    {
      kind: "poop" as const,
      pottyAt: walkStart,
      walkStartedAt: walkStart,
      walkEndedAt: walkStart,
    },
  ];
  for (const args of invalid) {
    await expect(
      owner.mutation(api.walks.createWithPotty, { dogId, ...args }),
    ).rejects.toThrow("INVALID_WALK_INTERVAL");
  }
  await expect(
    owner.mutation(api.walks.createWithPotty, {
      dogId,
      kind: "poop",
      note: "x".repeat(501),
      pottyAt: walkStart + 5 * 60_000,
      walkStartedAt: walkStart,
      walkEndedAt: walkStart + 20 * 60_000,
    }),
  ).rejects.toThrow("INVALID_NOTE");
  expect(await t.run(({ db }) => db.query("events").collect())).toEqual([]);
});

test("reconstructs beside an active walk but rejects overlap", async () => {
  const { dogId, owner, t } = await setup();
  const activeAt = walkStart + 60 * 60_000;
  await owner.mutation(api.walks.start, { dogId, at: activeAt });
  const created = await owner.mutation(api.walks.createWithPotty, {
    dogId,
    kind: "poop",
    pottyAt: walkStart + 30 * 60_000,
    walkStartedAt: walkStart,
    walkEndedAt: activeAt,
  });
  const count = await t.run(({ db }) => db.query("events").collect());
  expect(count).toHaveLength(3);

  await expect(
    owner.mutation(api.walks.createWithPotty, {
      dogId,
      kind: "poop",
      pottyAt: activeAt - 1,
      walkStartedAt: walkStart + 30 * 60_000,
      walkEndedAt: activeAt + 1,
    }),
  ).rejects.toThrow("INVALID_WALK_INTERVAL");
  expect(await t.run(({ db }) => db.query("events").collect())).toHaveLength(3);
  expect(created).toEqual({
    eventId: expect.any(String),
    walkId: expect.any(String),
  });
});

test("concurrent active walk creation leaves one complete pair", async () => {
  const { dogId, member, owner, t } = await setup();
  const results = await Promise.allSettled([
    owner.mutation(api.walks.createWithPotty, {
      dogId,
      kind: "pee",
      peePlace: "outside",
      pottyAt: walkStart + 5 * 60_000,
      walkStartedAt: walkStart,
    }),
    member.mutation(api.walks.createWithPotty, {
      dogId,
      kind: "poop",
      pottyAt: walkStart + 5 * 60_000,
      walkStartedAt: walkStart,
    }),
  ]);
  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const events = await t.run(({ db }) => db.query("events").collect());
  expect(events).toHaveLength(2);
  const walk = events.find(({ kind }) => kind === "walk");
  const potty = events.find(({ kind }) => kind !== "walk");
  expect(potty?.walkId).toBe(walk?._id);
});

test("undoes an unchanged reconstruction and refuses one with new events", async () => {
  const { dogId, owner, ownerId, t } = await setup();
  const create = () =>
    owner.mutation(api.walks.createWithPotty, {
      dogId,
      kind: "poop",
      pottyAt: walkStart + 5 * 60_000,
      walkStartedAt: walkStart,
      walkEndedAt: walkStart + 20 * 60_000,
    });
  const first = await create();
  await expect(
    owner.mutation(api.walks.undoReconstruction, { dogId, ...first }),
  ).resolves.toBeNull();
  await expect(
    owner.mutation(api.walks.undoReconstruction, { dogId, ...first }),
  ).resolves.toBeNull();
  expect(await t.run(({ db }) => db.query("events").collect())).toEqual([]);

  const second = await create();
  await t.run(({ db }) =>
    db.insert("events", {
      dogId,
      userId: ownerId,
      kind: "poop",
      at: walkStart + 10 * 60_000,
      walkId: second.walkId,
    }),
  );
  await expect(
    owner.mutation(api.walks.undoReconstruction, { dogId, ...second }),
  ).rejects.toThrow("RECONSTRUCTION_CHANGED");
  expect(await t.run(({ db }) => db.query("events").collect())).toHaveLength(3);
});

test("end cannot precede linked potty logs and accepts their boundary", async () => {
  const { dogId, owner } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const pottyAt = walkStart + 30_000;
  await owner.mutation(api.walks.logPotty, {
    dogId,
    walkId,
    kind: "pee",
    peePlace: "outside",
    at: pottyAt,
  });

  await expect(
    owner.mutation(api.walks.end, {
      dogId,
      walkId,
      endedAt: pottyAt - 1,
    }),
  ).rejects.toThrow("INVALID_WALK_TIMESTAMP");
  await expect(
    owner.mutation(api.walks.end, { dogId, walkId, endedAt: pottyAt }),
  ).resolves.toBe(pottyAt);
});

test("concurrent end and later potty logging preserve the interval", async () => {
  const { dogId, owner, t } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const endedAt = walkStart + 10_000;
  const pottyAt = endedAt + 1;
  const results = await Promise.allSettled([
    owner.mutation(api.walks.end, { dogId, walkId, endedAt }),
    owner.mutation(api.walks.logPotty, {
      dogId,
      walkId,
      kind: "pee",
      peePlace: "outside",
      at: pottyAt,
    }),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const [walk, linked] = await t.run(async ({ db }) =>
    Promise.all([
      db.get("events", walkId),
      db
        .query("events")
        .withIndex("by_walk_at", (q) => q.eq("walkId", walkId))
        .collect(),
    ]),
  );
  expect(
    linked.every(({ at }) => walk?.endedAt === undefined || at <= walk.endedAt),
  ).toBe(true);
});

test("backdated walk starts cannot overlap the latest completed walk", async () => {
  const { dogId, owner } = await setup();
  const firstWalkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const endedAt = walkStart + 60_000;
  await owner.mutation(api.walks.end, { dogId, walkId: firstWalkId, endedAt });

  await expect(
    owner.mutation(api.walks.start, { dogId, at: endedAt - 1 }),
  ).rejects.toThrow("INVALID_WALK_INTERVAL");
  await expect(
    owner.mutation(api.walks.start, { dogId, at: endedAt }),
  ).resolves.toBeDefined();
});

test("generic walk edits preserve linked intervals and removal detaches potty", async () => {
  const { dogId, owner, t } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const pottyAt = walkStart + 20_000;
  const pottyId = await owner.mutation(api.walks.logPotty, {
    dogId,
    walkId,
    kind: "pee",
    peePlace: "outside",
    at: pottyAt,
  });

  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: walkId,
      at: pottyAt + 1,
    }),
  ).rejects.toThrow("INVALID_WALK_INTERVAL");
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: walkId,
      endedAt: pottyAt - 1,
    }),
  ).rejects.toThrow("INVALID_WALK_INTERVAL");
  await owner.mutation(api.events.update, {
    dogId,
    eventId: walkId,
    endedAt: pottyAt,
  });
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: pottyId,
      at: walkStart - 1,
    }),
  ).rejects.toThrow("INVALID_WALK_TIMESTAMP");
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: pottyId,
      at: pottyAt + 1,
    }),
  ).rejects.toThrow("INVALID_WALK_TIMESTAMP");

  await owner.mutation(api.events.remove, { dogId, eventId: walkId });
  await expect(
    owner.mutation(api.events.remove, { dogId, eventId: walkId }),
  ).resolves.toBeNull();
  const potty = await t.run(({ db }) => db.get("events", pottyId));
  expect(potty).not.toHaveProperty("walkId");
});

test("generic walk edits preserve adjacent walk boundaries", async () => {
  const { dogId, owner } = await setup();
  const firstWalkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const secondStart = walkStart + 10_000;
  await owner.mutation(api.walks.end, {
    dogId,
    walkId: firstWalkId,
    endedAt: secondStart,
  });
  const secondWalkId = await owner.mutation(api.walks.start, {
    dogId,
    at: secondStart,
  });
  const thirdStart = walkStart + 20_000;
  await owner.mutation(api.walks.end, {
    dogId,
    walkId: secondWalkId,
    endedAt: thirdStart,
  });
  const activeWalkId = await owner.mutation(api.walks.start, {
    dogId,
    at: thirdStart,
  });

  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: firstWalkId,
      endedAt: secondStart + 1,
    }),
  ).rejects.toThrow("INVALID_WALK_INTERVAL");
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: secondWalkId,
      at: secondStart - 1,
    }),
  ).rejects.toThrow("INVALID_WALK_INTERVAL");
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: activeWalkId,
      at: thirdStart - 1,
    }),
  ).rejects.toThrow("INVALID_WALK_INTERVAL");

  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: firstWalkId,
      endedAt: secondStart,
    }),
  ).resolves.toBeNull();
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: secondWalkId,
      at: secondStart,
      endedAt: thirdStart,
    }),
  ).resolves.toBeNull();
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId: activeWalkId,
      at: thirdStart,
    }),
  ).resolves.toBeNull();
});

test("concurrent walk start and prior extension cannot create overlap", async () => {
  const { dogId, owner, t } = await setup();
  const firstWalkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  await owner.mutation(api.walks.end, {
    dogId,
    walkId: firstWalkId,
    endedAt: walkStart + 10_000,
  });
  const nextStart = walkStart + 20_000;
  const results = await Promise.allSettled([
    owner.mutation(api.walks.start, { dogId, at: nextStart }),
    owner.mutation(api.events.update, {
      dogId,
      eventId: firstWalkId,
      endedAt: nextStart + 1,
    }),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const walks = await t.run(({ db }) =>
    db
      .query("events")
      .withIndex("by_dog_kind_at", (q) =>
        q.eq("dogId", dogId).eq("kind", "walk"),
      )
      .collect(),
  );
  expect(
    walks.every(
      (walk, index) =>
        index === walks.length - 1 ||
        (walk.endedAt !== undefined && walk.endedAt <= walks[index + 1].at),
    ),
  ).toBe(true);
});

test("walk potty logs cap at 100 and capped walks remain deletable", async () => {
  const { dogId, owner, t } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const pottyIds: Array<Id<"events">> = [];
  for (let index = 0; index < 100; index += 1) {
    pottyIds.push(
      await owner.mutation(api.walks.logPotty, {
        dogId,
        walkId,
        kind: index % 2 === 0 ? "pee" : "poop",
        ...(index % 2 === 0 ? { peePlace: "outside" as const } : {}),
        at: walkStart + index,
      }),
    );
  }
  expect(pottyIds).toHaveLength(100);
  await expect(
    owner.mutation(api.walks.logPotty, {
      dogId,
      walkId,
      kind: "pee",
      peePlace: "outside",
      at: walkStart + 100,
    }),
  ).rejects.toThrow("WALK_EVENT_LIMIT");

  await expect(
    owner.mutation(api.events.remove, { dogId, eventId: walkId }),
  ).resolves.toBeNull();
  const pottyEvents = await t.run(async ({ db }) =>
    Promise.all(pottyIds.map((eventId) => db.get("events", eventId))),
  );
  expect(pottyEvents).toHaveLength(100);
  expect(pottyEvents.every((event) => event?.walkId === undefined)).toBe(true);
});

test("walk targets cannot cross dog or event-kind boundaries", async () => {
  const { dogId, otherDogId, owner } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
  });
  const eventId = await owner.mutation(api.events.logQuick, {
    dogId,
    kind: "pee",
    peePlace: "inside",
    at: walkStart,
  });

  await expect(
    owner.mutation(api.walks.end, {
      dogId: otherDogId,
      walkId,
      endedAt: walkStart + 1,
    }),
  ).rejects.toThrow("EVENT_NOT_FOUND");
  await expect(
    owner.mutation(api.walks.logPotty, {
      dogId: otherDogId,
      walkId,
      kind: "pee",
      peePlace: "outside",
      at: walkStart,
    }),
  ).rejects.toThrow("EVENT_NOT_FOUND");
  await expect(
    owner.mutation(api.walks.updateDiary, {
      dogId: otherDogId,
      walkId,
      note: "Wrong dog",
    }),
  ).rejects.toThrow("EVENT_NOT_FOUND");
  await expect(
    owner.mutation(api.walks.end, {
      dogId,
      walkId: eventId,
      endedAt: walkStart + 1,
    }),
  ).rejects.toThrow("WALK_NOT_FOUND");
  await expect(
    owner.mutation(api.walks.logPotty, {
      dogId,
      walkId: eventId,
      kind: "pee",
      peePlace: "outside",
      at: walkStart,
    }),
  ).rejects.toThrow("WALK_NOT_FOUND");
  await expect(
    owner.mutation(api.walks.updateDiary, {
      dogId,
      walkId: eventId,
      note: "Not a walk",
    }),
  ).rejects.toThrow("WALK_NOT_FOUND");
});

test("members can update, clear, and validate the walk diary", async () => {
  const { dogId, member, owner, t } = await setup();
  const walkId = await owner.mutation(api.walks.start, {
    dogId,
    at: walkStart,
    note: "Start",
  });

  await member.mutation(api.walks.updateDiary, {
    dogId,
    walkId,
    note: "  Great loose-leash work  ",
  });
  await expect(
    member.mutation(api.walks.updateDiary, {
      dogId,
      walkId,
      note: "x".repeat(501),
    }),
  ).rejects.toThrow("INVALID_NOTE");
  expect(await t.run(({ db }) => db.get("events", walkId))).toEqual(
    expect.objectContaining({ note: "Great loose-leash work" }),
  );

  await member.mutation(api.walks.updateDiary, {
    dogId,
    walkId,
    note: null,
  });
  expect(await t.run(({ db }) => db.get("events", walkId))).not.toHaveProperty(
    "note",
  );
});
