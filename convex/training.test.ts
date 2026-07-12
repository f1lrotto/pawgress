import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.{ts,tsx}");
const birthday = "2024-01-01";
const birthdayAt = Date.parse("2023-12-31T23:00:00.000Z");
const firstSessionAt = Date.UTC(2026, 0, 1);

const setup = async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {});
    const memberId = await ctx.db.insert("users", {});
    const strangerId = await ctx.db.insert("users", {});
    const dogId = await ctx.db.insert("dogs", {
      name: "Zoe",
      birthday,
      timezone: "Europe/Bratislava",
      createdBy: ownerId,
    });
    const otherDogId = await ctx.db.insert("dogs", {
      name: "Luna",
      birthday,
      timezone: "Europe/Bratislava",
      createdBy: ownerId,
    });
    await Promise.all([
      ctx.db.insert("dogMembers", {
        dogId,
        userId: ownerId,
        role: "owner",
      }),
      ctx.db.insert("dogMembers", {
        dogId,
        userId: memberId,
        role: "member",
      }),
      ctx.db.insert("dogMembers", {
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

const seedCommands = (
  { t, dogId }: Awaited<ReturnType<typeof setup>>,
  count = 99,
) =>
  t.run(({ db }) =>
    Promise.all(
      Array.from({ length: count }, (_, index) =>
        db.insert("trainingCommands", {
          dogId,
          name: `Seed ${index}`,
          normalizedName: `seed ${index}`,
          status: "learning",
          isArchived: index % 2 === 0,
        }),
      ),
    ),
  );

describe("training", () => {
  it("tracks a command from learning through mastered with recent sessions", async () => {
    const { owner, member, dogId } = await setup();
    const commandId = await owner.mutation(api.training.create, {
      dogId,
      name: "  Loose-leash walking  ",
      description: "  Walk without pulling.  ",
      howToTrain: "  Reward a slack lead.  ",
    });

    expect(await owner.query(api.training.list, { dogId, limit: 20 })).toEqual([
      expect.objectContaining({
        _id: commandId,
        name: "Loose-leash walking",
        description: "Walk without pulling.",
        howToTrain: "Reward a slack lead.",
        status: "learning",
        isArchived: false,
      }),
    ]);

    await owner.mutation(api.training.update, {
      dogId,
      commandId,
      status: "solid",
    });
    await owner.mutation(api.training.logSession, {
      dogId,
      commandId,
      at: firstSessionAt,
      rating: 3,
      notes: "  Distracted near traffic.  ",
    });
    await member.mutation(api.training.logSession, {
      dogId,
      commandId,
      at: firstSessionAt + 1_000,
      rating: 5,
    });
    await owner.mutation(api.training.update, {
      dogId,
      commandId,
      status: "mastered",
    });

    const detail = await owner.query(api.training.get, {
      dogId,
      commandId,
      sessionLimit: 10,
    });
    expect(detail.command.status).toBe("mastered");
    expect(
      detail.sessions.map(({ at, rating, notes }) => ({ at, rating, notes })),
    ).toEqual([
      { at: firstSessionAt + 1_000, rating: 5, notes: undefined },
      { at: firstSessionAt, rating: 3, notes: "Distracted near traffic." },
    ]);
  });

  it("lists a local-day window with command names", async () => {
    const { owner, dogId } = await setup();
    const sitId = await owner.mutation(api.training.create, {
      dogId,
      name: "Sit",
    });
    const stayId = await owner.mutation(api.training.create, {
      dogId,
      name: "Stay",
    });
    await Promise.all([
      owner.mutation(api.training.logSession, {
        dogId,
        commandId: sitId,
        at: firstSessionAt,
        rating: 3,
      }),
      owner.mutation(api.training.logSession, {
        dogId,
        commandId: stayId,
        at: firstSessionAt + 1_000,
        rating: 5,
      }),
    ]);

    expect(
      await owner.query(api.training.listDay, {
        dogId,
        startAt: firstSessionAt,
        endAt: firstSessionAt + 2_000,
      }),
    ).toEqual([
      expect.objectContaining({
        commandId: stayId,
        commandName: "Stay",
        rating: 5,
      }),
      expect.objectContaining({
        commandId: sitId,
        commandName: "Sit",
        rating: 3,
      }),
    ]);
    await expect(
      owner.query(api.training.listDay, {
        dogId,
        startAt: 10,
        endAt: 10,
      }),
    ).rejects.toThrow("INVALID_TRAINING_WINDOW");
  });

  it("validates bounds and prevents normalized active-name duplicates", async () => {
    const { owner, dogId } = await setup();

    await expect(
      owner.mutation(api.training.create, { dogId, name: "   " }),
    ).rejects.toThrow("INVALID_NAME");
    await expect(
      owner.mutation(api.training.create, { dogId, name: "x".repeat(65) }),
    ).rejects.toThrow("INVALID_NAME");
    await expect(
      owner.mutation(api.training.create, {
        dogId,
        name: "Sit",
        description: "x".repeat(1_001),
      }),
    ).rejects.toThrow("INVALID_DESCRIPTION");
    await expect(
      owner.mutation(api.training.create, {
        dogId,
        name: "Sit",
        howToTrain: "x".repeat(2_001),
      }),
    ).rejects.toThrow("INVALID_HOW_TO_TRAIN");

    const sitId = await owner.mutation(api.training.create, {
      dogId,
      name: "Sit",
    });
    const stayId = await owner.mutation(api.training.create, {
      dogId,
      name: "Stay",
    });
    await expect(
      owner.mutation(api.training.create, { dogId, name: "  sit  " }),
    ).rejects.toThrow("DUPLICATE_COMMAND");
    await expect(
      owner.mutation(api.training.update, {
        dogId,
        commandId: stayId,
        name: " SIT ",
      }),
    ).rejects.toThrow("DUPLICATE_COMMAND");
    await expect(
      owner.mutation(api.training.update, { dogId, commandId: sitId }),
    ).rejects.toThrow("INVALID_UPDATE");
    await expect(
      owner.query(api.training.list, { dogId, limit: 0 }),
    ).rejects.toThrow("INVALID_LIMIT");
    await expect(
      owner.query(api.training.get, {
        dogId,
        commandId: sitId,
        sessionLimit: 101,
      }),
    ).rejects.toThrow("INVALID_LIMIT");
  });

  it("caps total active and archived commands at 100", async () => {
    const context = await setup();
    const { owner, dogId, t } = context;
    await seedCommands(context);

    await expect(
      owner.mutation(api.training.create, { dogId, name: "At capacity" }),
    ).resolves.toBeDefined();
    await expect(
      owner.mutation(api.training.create, { dogId, name: "One too many" }),
    ).rejects.toThrow("COMMAND_LIMIT");
    await expect(
      t.run(({ db }) =>
        db
          .query("trainingCommands")
          .withIndex("by_dog_archived_name", (q) => q.eq("dogId", dogId))
          .take(101),
      ),
    ).resolves.toHaveLength(100);
  });

  it("serializes concurrent creates at the command cap", async () => {
    const context = await setup();
    const { owner, dogId, t } = context;
    await seedCommands(context);

    const results = await Promise.allSettled([
      owner.mutation(api.training.create, { dogId, name: "First contender" }),
      owner.mutation(api.training.create, { dogId, name: "Second contender" }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(String(rejected?.reason)).toContain("COMMAND_LIMIT");
    await expect(
      t.run(({ db }) =>
        db
          .query("trainingCommands")
          .withIndex("by_dog_archived_name", (q) => q.eq("dogId", dogId))
          .take(101),
      ),
    ).resolves.toHaveLength(100);
  });

  it("serializes concurrent normalized-name duplicates", async () => {
    const { owner, dogId } = await setup();

    const results = await Promise.allSettled([
      owner.mutation(api.training.create, { dogId, name: "  Place  " }),
      owner.mutation(api.training.create, { dogId, name: "place" }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(String(rejected?.reason)).toContain("DUPLICATE_COMMAND");
  });

  it("keeps archived history readable and protects active commands", async () => {
    const { owner, dogId } = await setup();
    const archivedId = await owner.mutation(api.training.create, {
      dogId,
      name: "Recall",
    });
    await owner.mutation(api.training.logSession, {
      dogId,
      commandId: archivedId,
      at: firstSessionAt,
      rating: 4,
    });
    await owner.mutation(api.training.setArchived, {
      dogId,
      commandId: archivedId,
      isArchived: true,
    });

    expect(await owner.query(api.training.list, { dogId, limit: 20 })).toEqual(
      [],
    );
    expect(
      await owner.query(api.training.list, {
        dogId,
        limit: 20,
        includeArchived: true,
      }),
    ).toEqual([expect.objectContaining({ _id: archivedId, isArchived: true })]);
    expect(
      await owner.query(api.training.get, {
        dogId,
        commandId: archivedId,
        sessionLimit: 10,
      }),
    ).toEqual(
      expect.objectContaining({
        command: expect.objectContaining({ _id: archivedId, isArchived: true }),
        sessions: [expect.objectContaining({ rating: 4 })],
      }),
    );
    await expect(
      owner.mutation(api.training.logSession, {
        dogId,
        commandId: archivedId,
        at: firstSessionAt + 1,
        rating: 5,
      }),
    ).rejects.toThrow("COMMAND_ARCHIVED");

    const activeId = await owner.mutation(api.training.create, {
      dogId,
      name: " recall ",
    });
    await expect(
      owner.mutation(api.training.setArchived, {
        dogId,
        commandId: archivedId,
        isArchived: false,
      }),
    ).rejects.toThrow("DUPLICATE_COMMAND");
    await owner.mutation(api.training.setArchived, {
      dogId,
      commandId: activeId,
      isArchived: true,
    });
    await owner.mutation(api.training.setArchived, {
      dogId,
      commandId: archivedId,
      isArchived: false,
    });
  });

  it("enforces membership and dog ownership for every command operation", async () => {
    const { t, owner, member, stranger, dogId, otherDogId } = await setup();
    const commandId = await member.mutation(api.training.create, {
      dogId,
      name: "Down",
    });

    await expect(
      t.query(api.training.list, { dogId, limit: 10 }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      stranger.query(api.training.get, { dogId, commandId, sessionLimit: 10 }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      stranger.mutation(api.training.update, {
        dogId,
        commandId,
        status: "solid",
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      owner.mutation(api.training.setArchived, {
        dogId: otherDogId,
        commandId,
        isArchived: true,
      }),
    ).rejects.toThrow("COMMAND_NOT_FOUND");
    await expect(
      owner.mutation(api.training.logSession, {
        dogId: otherDogId,
        commandId,
        at: firstSessionAt,
        rating: 3,
      }),
    ).rejects.toThrow("COMMAND_NOT_FOUND");
  });

  it("validates session timestamps, ratings, notes, and bounded recency", async () => {
    const { owner, dogId } = await setup();
    const commandId = await owner.mutation(api.training.create, {
      dogId,
      name: "Wait",
    });

    for (const rating of [0, 1.5, 6]) {
      await expect(
        owner.mutation(api.training.logSession, {
          dogId,
          commandId,
          at: firstSessionAt,
          rating,
        }),
      ).rejects.toThrow("INVALID_RATING");
    }
    await expect(
      owner.mutation(api.training.logSession, {
        dogId,
        commandId,
        at: birthdayAt - 1,
        rating: 3,
      }),
    ).rejects.toThrow("INVALID_TIMESTAMP");
    await expect(
      owner.mutation(api.training.logSession, {
        dogId,
        commandId,
        at: Date.now() + 6 * 60_000,
        rating: 3,
      }),
    ).rejects.toThrow("INVALID_TIMESTAMP");
    await expect(
      owner.mutation(api.training.logSession, {
        dogId,
        commandId,
        at: firstSessionAt,
        rating: 3,
        notes: "x".repeat(501),
      }),
    ).rejects.toThrow("INVALID_NOTES");

    await Promise.all(
      [1, 2, 3].map((rating, index) =>
        owner.mutation(api.training.logSession, {
          dogId,
          commandId,
          at: firstSessionAt + index,
          rating,
        }),
      ),
    );
    const detail = await owner.query(api.training.get, {
      dogId,
      commandId,
      sessionLimit: 2,
    });
    expect(detail.sessions.map(({ rating }) => rating)).toEqual([3, 2]);
  });

  it("logs several commands atomically with one assessment", async () => {
    const { owner, dogId, otherDogId, t } = await setup();
    const [sitId, stayId, archivedId, otherId] = await Promise.all([
      owner.mutation(api.training.create, { dogId, name: "Sit" }),
      owner.mutation(api.training.create, { dogId, name: "Stay" }),
      owner.mutation(api.training.create, { dogId, name: "Archived" }),
      owner.mutation(api.training.create, { dogId: otherDogId, name: "Other" }),
    ]);
    await owner.mutation(api.training.setArchived, {
      dogId,
      commandId: archivedId,
      isArchived: true,
    });

    const ids = await owner.mutation(api.training.logSessions, {
      dogId,
      commandIds: [sitId, stayId],
      at: firstSessionAt,
      rating: 5,
    });
    expect(ids).toHaveLength(2);
    expect(
      await t.run(({ db }) =>
        db
          .query("trainingSessions")
          .withIndex("by_dog_at", (q) => q.eq("dogId", dogId))
          .collect(),
      ),
    ).toEqual([
      expect.objectContaining({
        commandId: sitId,
        at: firstSessionAt,
        rating: 5,
      }),
      expect.objectContaining({
        commandId: stayId,
        at: firstSessionAt,
        rating: 5,
      }),
    ]);

    for (const commandIds of [
      [],
      [sitId, sitId],
      [sitId, archivedId],
      [sitId, otherId],
    ]) {
      await expect(
        owner.mutation(api.training.logSessions, {
          dogId,
          commandIds,
          at: firstSessionAt + 1,
          rating: 3,
        }),
      ).rejects.toThrow();
    }
    expect(
      await t.run(({ db }) =>
        db
          .query("trainingSessions")
          .withIndex("by_dog_at", (q) => q.eq("dogId", dogId))
          .collect(),
      ),
    ).toHaveLength(2);
  });
});
