import type { FunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.{ts,tsx}");
const timezone = "UTC";
const today = new Date().toLocaleDateString("sv-SE", { timeZone: timezone });
const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const yesterday = shiftDate(today, -1);
const tomorrow = shiftDate(today, 1);

type AgendaApi = {
  get: FunctionReference<"query">;
  addGoal: FunctionReference<"mutation">;
  setGoalDone: FunctionReference<"mutation">;
  removeGoal: FunctionReference<"mutation">;
  setWin: FunctionReference<"mutation">;
  setRating: FunctionReference<"mutation">;
  setDiary: FunctionReference<"mutation">;
};
const agenda = (api as unknown as { agenda: AgendaApi }).agenda;

const setup = async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", {});
    const memberId = await db.insert("users", {});
    const strangerId = await db.insert("users", {});
    const dogId = await db.insert("dogs", {
      name: "Zoe",
      birthday: "2024-01-01",
      timezone,
      createdBy: ownerId,
    });
    const otherDogId = await db.insert("dogs", {
      name: "Luna",
      birthday: "2024-01-01",
      timezone,
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

const listDays = (
  t: Awaited<ReturnType<typeof setup>>["t"],
  dogId: Awaited<ReturnType<typeof setup>>["dogId"],
  date = today,
) =>
  t.run(({ db }) =>
    db
      .query("agendaDays")
      .withIndex("by_dog_date", (q) => q.eq("dogId", dogId).eq("date", date))
      .collect(),
  );

describe("agenda", () => {
  it("authorizes every surface and rejects cross-dog access", async () => {
    const { t, member, stranger, dogId, otherDogId } = await setup();
    await expect(t.query(agenda.get, { dogId, date: today })).rejects.toThrow(
      "UNAUTHENTICATED",
    );
    await expect(
      stranger.query(agenda.get, { dogId, date: today }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      member.query(agenda.get, { dogId: otherDogId, date: today }),
    ).rejects.toThrow("FORBIDDEN");

    const writes = [
      [agenda.addGoal, { category: "enrichment", text: "Sniff" }],
      [agenda.setGoalDone, { category: "enrichment", goalId: 1, done: true }],
      [agenda.removeGoal, { category: "enrichment", goalId: 1 }],
      [agenda.setWin, { win: "Calm greeting" }],
      [agenda.setRating, { rating: 5 }],
      [agenda.setDiary, { diary: "A steady day" }],
    ] as const;

    for (const [reference, args] of writes) {
      await expect(
        t.mutation(reference, { dogId, date: today, ...args }),
      ).rejects.toThrow("UNAUTHENTICATED");
      await expect(
        member.mutation(reference, {
          dogId: otherDogId,
          date: today,
          ...args,
        }),
      ).rejects.toThrow("FORBIDDEN");
    }
  });

  it("validates calendar dates and keeps yesterday readable but immutable", async () => {
    const { t, owner, dogId } = await setup();
    for (const date of ["", "2026-2-03", "0000-01-01", "2026-02-30"]) {
      await expect(owner.query(agenda.get, { dogId, date })).rejects.toThrow(
        "INVALID_AGENDA_DATE",
      );
    }
    await expect(
      owner.mutation(agenda.setWin, {
        dogId,
        date: "2026-02-30",
        win: "No",
      }),
    ).rejects.toThrow("INVALID_AGENDA_DATE");
    await t.run(({ db }) =>
      db.insert("agendaDays", {
        dogId,
        date: yesterday,
        nextGoalId: 1,
        enrichmentGoals: [],
        trainingGoals: [],
        win: "Yesterday's win",
      }),
    );
    await expect(
      owner.query(agenda.get, { dogId, date: yesterday }),
    ).resolves.toEqual(expect.objectContaining({ win: "Yesterday's win" }));
    await expect(
      owner.query(agenda.get, { dogId, date: tomorrow }),
    ).resolves.toBeNull();

    const readonlyWrites = [
      owner.mutation(agenda.addGoal, {
        dogId,
        date: yesterday,
        category: "enrichment",
        text: "No",
      }),
      owner.mutation(agenda.setGoalDone, {
        dogId,
        date: yesterday,
        category: "enrichment",
        goalId: 1,
        done: true,
      }),
      owner.mutation(agenda.removeGoal, {
        dogId,
        date: yesterday,
        category: "enrichment",
        goalId: 1,
      }),
      owner.mutation(agenda.setWin, {
        dogId,
        date: yesterday,
        win: "No",
      }),
      owner.mutation(agenda.setRating, {
        dogId,
        date: yesterday,
        rating: 3,
      }),
      owner.mutation(agenda.setDiary, {
        dogId,
        date: yesterday,
        diary: "No",
      }),
    ];
    for (const write of readonlyWrites) {
      await expect(write).rejects.toThrow("AGENDA_READ_ONLY");
    }
    await expect(
      owner.mutation(agenda.setWin, { dogId, date: tomorrow, win: "Soon" }),
    ).rejects.toThrow("AGENDA_READ_ONLY");
  });

  it("creates one day for simultaneous category additions with stable IDs", async () => {
    const { owner, t, dogId, otherDogId } = await setup();
    const ids = await Promise.all([
      owner.mutation(agenda.addGoal, {
        dogId,
        date: today,
        category: "enrichment",
        text: "  Ｓniff the garden  ",
      }),
      owner.mutation(agenda.addGoal, {
        dogId,
        date: today,
        category: "training",
        text: "Settle on the mat",
      }),
    ]);
    expect(new Set(ids)).toEqual(new Set([1, 2]));
    const [day] = await listDays(t, dogId);
    expect(day.nextGoalId).toBe(3);
    expect(day.enrichmentGoals).toEqual([
      expect.objectContaining({ text: "Sniff the garden", done: false }),
    ]);
    expect(day.trainingGoals).toEqual([
      expect.objectContaining({ text: "Settle on the mat", done: false }),
    ]);
    expect(await listDays(t, dogId)).toHaveLength(1);

    const otherGoalId = await owner.mutation(agenda.addGoal, {
      dogId: otherDogId,
      date: today,
      category: "enrichment",
      text: "Other dog",
    });
    expect(otherGoalId).toBe(1);
    await owner.mutation(agenda.setGoalDone, {
      dogId,
      date: today,
      category: "enrichment",
      goalId: day.enrichmentGoals[0]!.id,
      done: true,
    });
    expect(
      (await owner.query(agenda.get, { dogId: otherDogId, date: today }))!
        .enrichmentGoals[0]!.done,
    ).toBe(false);
  });

  it("normalizes and bounds goals without partial writes", async () => {
    const { owner, t, dogId } = await setup();
    for (const text of ["   ", "x".repeat(161)]) {
      await expect(
        owner.mutation(agenda.addGoal, {
          dogId,
          date: today,
          category: "enrichment",
          text,
        }),
      ).rejects.toThrow("INVALID_AGENDA_GOAL");
    }
    expect(await listDays(t, dogId)).toEqual([]);
    await owner.mutation(agenda.addGoal, {
      dogId,
      date: today,
      category: "enrichment",
      text: "Valid",
    });
    for (const goalId of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        owner.mutation(agenda.setGoalDone, {
          dogId,
          date: today,
          category: "enrichment",
          goalId,
          done: true,
        }),
      ).rejects.toThrow("INVALID_GOAL_ID");
    }
  });

  it("serializes the goal cap race", async () => {
    const { owner, t, dogId } = await setup();
    await t.run(({ db }) =>
      db.insert("agendaDays", {
        dogId,
        date: today,
        nextGoalId: 20,
        enrichmentGoals: Array.from({ length: 19 }, (_, index) => ({
          id: index + 1,
          text: `Goal ${index + 1}`,
          done: false,
        })),
        trainingGoals: [],
      }),
    );
    const results = await Promise.allSettled([
      owner.mutation(agenda.addGoal, {
        dogId,
        date: today,
        category: "enrichment",
        text: "Contender one",
      }),
      owner.mutation(agenda.addGoal, {
        dogId,
        date: today,
        category: "enrichment",
        text: "Contender two",
      }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(String(rejected?.reason)).toContain("AGENDA_GOAL_LIMIT");
    const [day] = await listDays(t, dogId);
    expect(day.enrichmentGoals).toHaveLength(20);
    expect(day.nextGoalId).toBe(21);
  });

  it("toggles concurrent goals and rejects missing or removed targets", async () => {
    const { owner, dogId } = await setup();
    const [first, second] = await Promise.all([
      owner.mutation(agenda.addGoal, {
        dogId,
        date: today,
        category: "training",
        text: "Recall",
      }),
      owner.mutation(agenda.addGoal, {
        dogId,
        date: today,
        category: "training",
        text: "Settle",
      }),
    ]);
    await Promise.all([
      owner.mutation(agenda.setGoalDone, {
        dogId,
        date: today,
        category: "training",
        goalId: first,
        done: true,
      }),
      owner.mutation(agenda.setGoalDone, {
        dogId,
        date: today,
        category: "training",
        goalId: second,
        done: true,
      }),
    ]);
    expect(
      (await owner.query(agenda.get, { dogId, date: today }))!.trainingGoals,
    ).toEqual([
      expect.objectContaining({ id: first, done: true }),
      expect.objectContaining({ id: second, done: true }),
    ]);
    await expect(
      owner.mutation(agenda.setGoalDone, {
        dogId,
        date: today,
        category: "training",
        goalId: 999,
        done: true,
      }),
    ).rejects.toThrow("AGENDA_GOAL_NOT_FOUND");
    await owner.mutation(agenda.removeGoal, {
      dogId,
      date: today,
      category: "training",
      goalId: first,
    });
    await expect(
      owner.mutation(agenda.setGoalDone, {
        dogId,
        date: today,
        category: "training",
        goalId: first,
        done: false,
      }),
    ).rejects.toThrow("AGENDA_GOAL_NOT_FOUND");
  });

  it("removes idempotently without crossing categories", async () => {
    const { owner, dogId } = await setup();
    const goalId = await owner.mutation(agenda.addGoal, {
      dogId,
      date: today,
      category: "enrichment",
      text: "Find treats",
    });
    await expect(
      owner.mutation(agenda.removeGoal, {
        dogId,
        date: today,
        category: "training",
        goalId,
      }),
    ).resolves.toBeNull();
    expect(
      (await owner.query(agenda.get, { dogId, date: today }))!.enrichmentGoals,
    ).toHaveLength(1);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        owner.mutation(agenda.removeGoal, {
          dogId,
          date: today,
          category: "enrichment",
          goalId,
        }),
      ).resolves.toBeNull();
    }
    expect(
      (await owner.query(agenda.get, { dogId, date: today }))!.enrichmentGoals,
    ).toEqual([]);
  });

  it("sets, isolates, and clears reflection fields without empty documents", async () => {
    const { owner, t, dogId, otherDogId } = await setup();
    await owner.mutation(agenda.setWin, {
      dogId,
      date: today,
      win: "  Calm greeting  ",
    });
    await owner.mutation(agenda.setRating, { dogId, date: today, rating: 4 });
    await owner.mutation(agenda.setDiary, {
      dogId,
      date: today,
      diary: "  Settled after dinner.  ",
    });
    await owner.mutation(agenda.setWin, {
      dogId,
      date: today,
      win: "Loose lead",
    });
    expect(await owner.query(agenda.get, { dogId, date: today })).toEqual(
      expect.objectContaining({
        win: "Loose lead",
        rating: 4,
        diary: "Settled after dinner.",
      }),
    );
    await owner.mutation(agenda.setWin, { dogId, date: today, win: null });
    await owner.mutation(agenda.setRating, {
      dogId,
      date: today,
      rating: null,
    });
    await owner.mutation(agenda.setDiary, { dogId, date: today, diary: "  " });
    const cleared = await owner.query(agenda.get, { dogId, date: today });
    expect(cleared).not.toHaveProperty("win");
    expect(cleared).not.toHaveProperty("rating");
    expect(cleared).not.toHaveProperty("diary");

    await owner.mutation(agenda.setWin, {
      dogId: otherDogId,
      date: today,
      win: null,
    });
    await owner.mutation(agenda.setRating, {
      dogId: otherDogId,
      date: today,
      rating: null,
    });
    await owner.mutation(agenda.setDiary, {
      dogId: otherDogId,
      date: today,
      diary: null,
    });
    expect(await listDays(t, otherDogId)).toEqual([]);
  });

  it("rejects invalid reflection values transactionally", async () => {
    const { owner, t, dogId } = await setup();
    await expect(
      owner.mutation(agenda.setWin, {
        dogId,
        date: today,
        win: "x".repeat(501),
      }),
    ).rejects.toThrow("INVALID_AGENDA_WIN");
    await expect(
      owner.mutation(agenda.setDiary, {
        dogId,
        date: today,
        diary: "x".repeat(4_001),
      }),
    ).rejects.toThrow("INVALID_AGENDA_DIARY");
    for (const rating of [0, 6, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        owner.mutation(agenda.setRating, { dogId, date: today, rating }),
      ).rejects.toThrow("INVALID_AGENDA_RATING");
    }
    expect(await listDays(t, dogId)).toEqual([]);
  });

  it("merges concurrent reflection first writes into one day", async () => {
    const { owner, t, dogId } = await setup();
    await Promise.all([
      owner.mutation(agenda.setWin, { dogId, date: today, win: "Recall" }),
      owner.mutation(agenda.setRating, { dogId, date: today, rating: 5 }),
      owner.mutation(agenda.setDiary, {
        dogId,
        date: today,
        diary: "A bright finish.",
      }),
    ]);
    expect(await listDays(t, dogId)).toHaveLength(1);
    expect(await owner.query(agenda.get, { dogId, date: today })).toEqual(
      expect.objectContaining({
        win: "Recall",
        rating: 5,
        diary: "A bright finish.",
      }),
    );
  });
});
