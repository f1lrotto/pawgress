/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const validAt = Date.parse("2026-07-09T10:00:00Z");

const setup = async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", {});
    const memberId = await db.insert("users", {});
    const strangerId = await db.insert("users", {});
    const dogId = await db.insert("dogs", {
      name: "Zoe",
      birthday: "2024-01-15",
      timezone: "Europe/Bratislava",
      createdBy: ownerId,
    });
    const otherDogId = await db.insert("dogs", {
      name: "Milo",
      birthday: "2024-01-15",
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
    const activeId = await db.insert("activityTypes", {
      dogId,
      name: "Tug",
      emoji: "🪢",
      isArchived: false,
    });
    const archivedId = await db.insert("activityTypes", {
      dogId,
      name: "Old game",
      isArchived: true,
    });
    const otherTypeId = await db.insert("activityTypes", {
      dogId: otherDogId,
      name: "Other dog activity",
      isArchived: false,
    });
    return {
      activeId,
      archivedId,
      dogId,
      memberId,
      otherDogId,
      otherTypeId,
      ownerId,
      strangerId,
    };
  });
  return {
    ...ids,
    t,
    member: t.withIdentity({ subject: `${ids.memberId}|test-session` }),
    owner: t.withIdentity({ subject: `${ids.ownerId}|test-session` }),
    stranger: t.withIdentity({ subject: `${ids.strangerId}|test-session` }),
  };
};

test("lists a bounded authorized active picker with optional archives", async () => {
  const { dogId, member, owner, stranger, t } = await setup();

  await expect(
    t.query(api.activityTypes.list, { dogId, limit: 10 }),
  ).rejects.toThrow("UNAUTHENTICATED");
  await expect(
    stranger.query(api.activityTypes.list, { dogId, limit: 10 }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    member.query(api.activityTypes.list, { dogId, limit: 10 }),
  ).resolves.toEqual([
    expect.objectContaining({ name: "Tug", isArchived: false }),
  ]);
  await expect(
    owner.query(api.activityTypes.list, {
      dogId,
      includeArchived: true,
      limit: 10,
    }),
  ).resolves.toEqual([
    expect.objectContaining({ name: "Tug", isArchived: false }),
    expect.objectContaining({ name: "Old game", isArchived: true }),
  ]);
  await expect(
    owner.query(api.activityTypes.list, {
      dogId,
      includeArchived: true,
      limit: 1,
    }),
  ).resolves.toHaveLength(1);
});

test("creates, logs, archives, and restores a custom Cafe visit", async () => {
  const { dogId, member, owner, t } = await setup();
  const activityTypeId = await member.mutation(api.activityTypes.create, {
    dogId,
    name: "  Cafe visit  ",
    emoji: "  ☕  ",
  });
  const eventId = await owner.mutation(api.activityTypes.logPlay, {
    dogId,
    activityTypeId,
    at: validAt,
    endedAt: validAt + 30 * 60_000,
    note: "  Calm around cups  ",
  });

  await expect(
    owner.mutation(api.activityTypes.setArchived, {
      dogId,
      activityTypeId,
      isArchived: true,
    }),
  ).resolves.toBeNull();
  await expect(
    owner.query(api.activityTypes.list, { dogId, limit: 10 }),
  ).resolves.not.toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Cafe visit" })]),
  );
  await expect(
    owner.query(api.activityTypes.list, {
      dogId,
      includeArchived: true,
      limit: 10,
    }),
  ).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        _id: activityTypeId,
        emoji: "☕",
        isArchived: true,
        name: "Cafe visit",
      }),
    ]),
  );
  await expect(
    owner.mutation(api.activityTypes.logPlay, {
      dogId,
      activityTypeId,
      at: validAt + 60 * 60_000,
    }),
  ).rejects.toThrow("ACTIVITY_TYPE_ARCHIVED");
  await expect(t.run(({ db }) => db.get(eventId))).resolves.toEqual(
    expect.objectContaining({
      activityTypeId,
      at: validAt,
      endedAt: validAt + 30 * 60_000,
      kind: "play",
      note: "Calm around cups",
    }),
  );

  await owner.mutation(api.activityTypes.setArchived, {
    dogId,
    activityTypeId,
    isArchived: false,
  });
  await expect(
    owner.query(api.activityTypes.list, { dogId, limit: 10 }),
  ).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "Cafe visit", isArchived: false }),
    ]),
  );
});

test("protects writes across membership and dog boundaries", async () => {
  const { dogId, otherTypeId, owner, stranger } = await setup();

  await expect(
    stranger.mutation(api.activityTypes.create, {
      dogId,
      name: "Forbidden",
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    stranger.mutation(api.activityTypes.logPlay, {
      dogId,
      activityTypeId: otherTypeId,
      at: validAt,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    owner.mutation(api.activityTypes.logPlay, {
      dogId,
      activityTypeId: otherTypeId,
      at: validAt,
    }),
  ).rejects.toThrow("ACTIVITY_TYPE_NOT_FOUND");
  await expect(
    owner.mutation(api.activityTypes.setArchived, {
      dogId,
      activityTypeId: otherTypeId,
      isArchived: true,
    }),
  ).rejects.toThrow("ACTIVITY_TYPE_NOT_FOUND");
});

test("rejects duplicate names and input or list bounds", async () => {
  const { dogId, owner, t } = await setup();
  await owner.mutation(api.activityTypes.create, {
    dogId,
    name: "Cafe visit",
  });

  await expect(
    owner.mutation(api.activityTypes.create, {
      dogId,
      name: "  cafe VISIT  ",
    }),
  ).rejects.toThrow("DUPLICATE_ACTIVITY_TYPE");
  for (const name of ["   ", "x".repeat(65)]) {
    await expect(
      owner.mutation(api.activityTypes.create, { dogId, name }),
    ).rejects.toThrow("INVALID_ACTIVITY_NAME");
  }
  await expect(
    owner.mutation(api.activityTypes.create, {
      dogId,
      name: "Too expressive",
      emoji: "x".repeat(17),
    }),
  ).rejects.toThrow("INVALID_ACTIVITY_EMOJI");
  for (const limit of [0, 101, 1.5]) {
    await expect(
      owner.query(api.activityTypes.list, { dogId, limit }),
    ).rejects.toThrow("INVALID_LIMIT");
  }

  await t.run(async ({ db }) => {
    await Promise.all(
      Array.from({ length: 97 }, (_, index) =>
        db.insert("activityTypes", {
          dogId,
          name: `Activity ${index}`,
          isArchived: false,
        }),
      ),
    );
  });
  await expect(
    owner.mutation(api.activityTypes.create, {
      dogId,
      name: "One too many",
    }),
  ).rejects.toThrow("ACTIVITY_TYPE_LIMIT");
});

test("validates play timestamps, intervals, and notes", async () => {
  const { activeId, dogId, owner } = await setup();

  await expect(
    owner.mutation(api.activityTypes.logPlay, {
      dogId,
      activityTypeId: activeId,
      at: validAt,
      endedAt: validAt - 1,
    }),
  ).rejects.toThrow("INVALID_PLAY_INTERVAL");
  for (const args of [
    { at: -1 },
    { at: Date.now() + 10 * 60_000 },
    { at: validAt, endedAt: Date.now() + 10 * 60_000 },
  ]) {
    await expect(
      owner.mutation(api.activityTypes.logPlay, {
        dogId,
        activityTypeId: activeId,
        ...args,
      }),
    ).rejects.toThrow("INVALID_TIMESTAMP");
  }
  await expect(
    owner.mutation(api.activityTypes.logPlay, {
      dogId,
      activityTypeId: activeId,
      at: validAt,
      note: "x".repeat(501),
    }),
  ).rejects.toThrow("INVALID_NOTE");
});

test("edits Play duration without allowing inverted intervals", async () => {
  const { activeId, dogId, owner, t } = await setup();
  const endedAt = validAt + 30 * 60_000;
  const eventId = await owner.mutation(api.activityTypes.logPlay, {
    dogId,
    activityTypeId: activeId,
    at: validAt,
    endedAt,
  });

  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId,
      at: endedAt + 1,
    }),
  ).rejects.toThrow("INVALID_PLAY_INTERVAL");
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId,
      endedAt: validAt - 1,
    }),
  ).rejects.toThrow("INVALID_PLAY_INTERVAL");
  await expect(t.run(({ db }) => db.get(eventId))).resolves.toEqual(
    expect.objectContaining({ at: validAt, endedAt }),
  );

  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId,
      endedAt: validAt,
    }),
  ).resolves.toBeNull();
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId,
      at: validAt - 60_000,
    }),
  ).resolves.toBeNull();
  await expect(
    owner.mutation(api.events.update, {
      dogId,
      eventId,
      endedAt: validAt + 10 * 60_000,
    }),
  ).resolves.toBeNull();
  await expect(t.run(({ db }) => db.get(eventId))).resolves.toEqual(
    expect.objectContaining({
      at: validAt - 60_000,
      endedAt: validAt + 10 * 60_000,
    }),
  );
});
