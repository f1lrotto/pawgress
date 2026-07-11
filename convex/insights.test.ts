import type { FunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.{ts,tsx}");
const day = 86_400_000;

type InsightsApi = {
  pottyByHour: FunctionReference<"query">;
  walkIntervals: FunctionReference<"query">;
  sleepByDay: FunctionReference<"query">;
  dayRatings: FunctionReference<"query">;
};
const insights = (api as unknown as { insights: InsightsApi }).insights;

const setup = async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", {});
    const memberId = await db.insert("users", {});
    const strangerId = await db.insert("users", {});
    const dogId = await db.insert("dogs", {
      name: "Zoe",
      birthday: "2024-01-01",
      timezone: "Europe/Bratislava",
      createdBy: ownerId,
    });
    const otherDogId = await db.insert("dogs", {
      name: "Luna",
      birthday: "2024-01-01",
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
    owner: t.withIdentity({ subject: `${ids.ownerId}|test-session` }),
    member: t.withIdentity({ subject: `${ids.memberId}|test-session` }),
    stranger: t.withIdentity({ subject: `${ids.strangerId}|test-session` }),
  };
};

const eventArgs = { startAt: 0, endAt: day };
const sleepArgs = {
  days: [{ date: "2026-07-10", startAt: 0, endAt: day }],
};
const ratingArgs = { startDate: "2026-01-01", endDate: "2026-01-31" };

describe("insights authorization and validation", () => {
  it("authorizes every query and rejects other dogs", async () => {
    const { t, member, stranger, dogId, otherDogId } = await setup();
    const calls = [
      [insights.pottyByHour, eventArgs],
      [insights.walkIntervals, eventArgs],
      [insights.sleepByDay, sleepArgs],
      [insights.dayRatings, ratingArgs],
    ] as const;

    for (const [reference, args] of calls) {
      await expect(t.query(reference, { dogId, ...args })).rejects.toThrow(
        "UNAUTHENTICATED",
      );
      await expect(
        stranger.query(reference, { dogId, ...args }),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        member.query(reference, { dogId: otherDogId, ...args }),
      ).rejects.toThrow("FORBIDDEN");
    }
  });

  it("rejects malformed or over-wide event windows", async () => {
    const { owner, dogId } = await setup();
    for (const window of [
      { startAt: -1, endAt: 1 },
      { startAt: 1, endAt: 1 },
      { startAt: 2, endAt: 1 },
      { startAt: 0, endAt: 93 * day + 1 },
    ]) {
      await expect(
        owner.query(insights.pottyByHour, { dogId, ...window }),
      ).rejects.toThrow("INVALID_INSIGHT_WINDOW");
      await expect(
        owner.query(insights.walkIntervals, { dogId, ...window }),
      ).rejects.toThrow("INVALID_INSIGHT_WINDOW");
    }
  });

  it("rejects rather than truncating an over-cap event kind", async () => {
    const { t, owner, dogId, ownerId } = await setup();
    await t.run(({ db }) =>
      Promise.all(
        Array.from({ length: 5_001 }, (_, at) =>
          db.insert("events", {
            dogId,
            userId: ownerId,
            kind: "pee",
            at,
          }),
        ),
      ),
    );
    await expect(
      owner.query(insights.pottyByHour, {
        dogId,
        startAt: 0,
        endAt: 5_002,
      }),
    ).rejects.toThrow("INSIGHT_EVENT_LIMIT");
  });
});

describe("insight aggregations", () => {
  it("buckets inclusive-start/exclusive-end potty events in the dog timezone", async () => {
    const { t, owner, dogId, ownerId } = await setup();
    const firstRepeated = Date.parse("2026-10-25T00:30:00Z");
    const secondRepeated = Date.parse("2026-10-25T01:30:00Z");
    await t.run(({ db }) =>
      Promise.all([
        db.insert("events", {
          dogId,
          userId: ownerId,
          kind: "pee",
          at: firstRepeated,
          peePlace: "inside",
        }),
        db.insert("events", {
          dogId,
          userId: ownerId,
          kind: "pee",
          at: secondRepeated,
          peePlace: "outside",
        }),
        db.insert("events", {
          dogId,
          userId: ownerId,
          kind: "poop",
          at: secondRepeated + 1,
        }),
      ]),
    );

    const result = await owner.query(insights.pottyByHour, {
      dogId,
      startAt: firstRepeated,
      endAt: secondRepeated + 1,
    });
    expect(result).toHaveLength(24);
    expect(result[2]).toEqual({
      hour: 2,
      peeInside: 1,
      peeOutside: 1,
      poop: 0,
    });
  });

  it("builds completed walk intervals with exact meal boundaries", async () => {
    const { t, owner, dogId, ownerId } = await setup();
    await t.run(({ db }) =>
      Promise.all([
        db.insert("events", {
          dogId,
          userId: ownerId,
          kind: "walk",
          at: 10,
          endedAt: 20,
        }),
        db.insert("events", {
          dogId,
          userId: ownerId,
          kind: "walk",
          at: 25,
        }),
        db.insert("events", {
          dogId,
          userId: ownerId,
          kind: "walk",
          at: 30,
          endedAt: 40,
        }),
        ...[20, 29, 30].map((at) =>
          db.insert("events", {
            dogId,
            userId: ownerId,
            kind: "meal",
            at,
          }),
        ),
      ]),
    );

    await expect(
      owner.query(insights.walkIntervals, {
        dogId,
        startAt: 10,
        endAt: 41,
      }),
    ).resolves.toEqual([
      {
        fromWalkAt: 10,
        fromWalkEndedAt: 20,
        toWalkAt: 30,
        intervalMs: 10,
        mealAts: [20, 29],
      },
    ]);
  });

  it("seeds sleep before the window and clips carry-in, crossing, and open sleep", async () => {
    const { t, owner, dogId, ownerId } = await setup();
    const insert = (kind: "wake" | "sleep", at: number) =>
      t.run(({ db }) =>
        db.insert("events", { dogId, userId: ownerId, kind, at }),
      );
    await insert("sleep", 500);
    await insert("wake", 1_500);
    await insert("sleep", 1_800);
    await insert("wake", 2_500);
    await insert("sleep", 2_700);

    await expect(
      owner.query(insights.sleepByDay, {
        dogId,
        days: [
          { date: "2026-07-09", startAt: 1_000, endAt: 2_000 },
          { date: "2026-07-10", startAt: 2_000, endAt: 3_000 },
        ],
      }),
    ).resolves.toEqual([
      { date: "2026-07-09", sleepMs: 700 },
      { date: "2026-07-10", sleepMs: 800 },
    ]);
  });

  it("validates adjacent sleep day windows", async () => {
    const { owner, dogId } = await setup();
    for (const days of [
      [],
      [{ date: "2026-02-30", startAt: 0, endAt: day }],
      [{ date: "2026-07-10", startAt: 0, endAt: 27 * 3_600_000 + 1 }],
      [
        { date: "2026-07-09", startAt: 0, endAt: day },
        { date: "2026-07-11", startAt: day, endAt: 2 * day },
      ],
      [
        { date: "2026-07-09", startAt: 0, endAt: day },
        { date: "2026-07-10", startAt: day + 1, endAt: 2 * day },
      ],
      Array.from({ length: 32 }, (_, index) => ({
        date: `2026-01-${String(index + 1).padStart(2, "0")}`,
        startAt: index * day,
        endAt: (index + 1) * day,
      })),
    ]) {
      await expect(
        owner.query(insights.sleepByDay, { dogId, days }),
      ).rejects.toThrow("INVALID_SLEEP_DAYS");
    }
  });

  it("returns only rated days in date order and validates the range", async () => {
    const { t, owner, dogId } = await setup();
    await t.run(({ db }) =>
      Promise.all([
        db.insert("agendaDays", {
          dogId,
          date: "2026-01-03",
          nextGoalId: 1,
          enrichmentGoals: [],
          trainingGoals: [],
          rating: 5,
        }),
        db.insert("agendaDays", {
          dogId,
          date: "2026-01-01",
          nextGoalId: 1,
          enrichmentGoals: [],
          trainingGoals: [],
          rating: 3,
        }),
        db.insert("agendaDays", {
          dogId,
          date: "2026-01-02",
          nextGoalId: 1,
          enrichmentGoals: [],
          trainingGoals: [],
        }),
      ]),
    );

    await expect(
      owner.query(insights.dayRatings, {
        dogId,
        startDate: "2026-01-01",
        endDate: "2026-01-03",
      }),
    ).resolves.toEqual([
      { date: "2026-01-01", rating: 3 },
      { date: "2026-01-03", rating: 5 },
    ]);

    await t.run(({ db }) =>
      Promise.all(
        Array.from({ length: 364 }, () =>
          db.insert("agendaDays", {
            dogId,
            date: "2026-01-02",
            nextGoalId: 1,
            enrichmentGoals: [],
            trainingGoals: [],
          }),
        ),
      ),
    );
    await expect(
      owner.query(insights.dayRatings, {
        dogId,
        startDate: "2026-01-01",
        endDate: "2026-01-03",
      }),
    ).rejects.toThrow("INSIGHT_RATING_LIMIT");

    for (const range of [
      { startDate: "2026-02-30", endDate: "2026-03-01" },
      { startDate: "2026-03-01", endDate: "2026-02-28" },
      { startDate: "2024-01-01", endDate: "2025-01-01" },
    ]) {
      await expect(
        owner.query(insights.dayRatings, { dogId, ...range }),
      ).rejects.toThrow("INVALID_RATING_RANGE");
    }
  });
});
