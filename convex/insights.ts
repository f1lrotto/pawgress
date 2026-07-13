import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { dogQuery } from "./lib/functions";
import {
  bucketPottyByHour,
  buildOutingIntervals,
  type InsightDay,
  type RestEvent,
  sumSleepByDay,
} from "./lib/insights";

const dayMs = 86_400_000;
const maxEvents = 5_000;
const maxRatingDays = 366;
const maxWindowMs = 93 * dayMs;
const insightDay = v.object({
  date: v.string(),
  startAt: v.number(),
  endAt: v.number(),
});
const pottyBucket = v.object({
  hour: v.number(),
  peeInside: v.number(),
  peeOutside: v.number(),
  poop: v.number(),
});
const outingKind = v.union(
  v.literal("walk"),
  v.literal("pee"),
  v.literal("poop"),
);
const walkInterval = v.object({
  fromWalkAt: v.number(),
  fromWalkEndedAt: v.number(),
  toWalkAt: v.number(),
  toKinds: v.array(outingKind),
  intervalMs: v.number(),
  mealAts: v.array(v.number()),
});
const sleepTotal = v.object({ date: v.string(), sleepMs: v.number() });
const dayRating = v.object({ date: v.string(), rating: v.number() });

const validateWindow = (startAt: number, endAt: number) => {
  if (
    !Number.isFinite(startAt) ||
    !Number.isFinite(endAt) ||
    startAt < 0 ||
    startAt >= endAt ||
    endAt - startAt > maxWindowMs
  ) {
    throw new ConvexError("INVALID_INSIGHT_WINDOW");
  }
};

const bounded = async <Value>(values: Promise<Value[]>) => {
  const result = await values;
  if (result.length > maxEvents) {
    throw new ConvexError("INSIGHT_EVENT_LIMIT");
  }
  return result;
};

const eventsByKind = (
  ctx: QueryCtx,
  dogId: Id<"dogs">,
  kind: "pee" | "poop" | "meal" | "walk" | "wake" | "sleep",
  startAt: number,
  endAt: number,
) =>
  bounded(
    ctx.db
      .query("events")
      .withIndex("by_dog_kind_at", (q) =>
        q
          .eq("dogId", dogId)
          .eq("kind", kind)
          .gte("at", startAt)
          .lt("at", endAt),
      )
      .order("asc")
      .take(maxEvents + 1),
  );

const parseDate = (date: string) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date.startsWith("0000") ||
    Number.isNaN(value.valueOf()) ||
    value.toISOString().slice(0, 10) !== date
  ) {
    return null;
  }
  return value;
};

const nextDate = (date: string) => {
  const value = parseDate(date);
  if (!value) return null;
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

const validateDays = (days: InsightDay[]) => {
  if (days.length < 1 || days.length > 31) {
    throw new ConvexError("INVALID_SLEEP_DAYS");
  }
  for (const [index, value] of days.entries()) {
    if (
      !parseDate(value.date) ||
      !Number.isFinite(value.startAt) ||
      !Number.isFinite(value.endAt) ||
      value.startAt < 0 ||
      value.startAt >= value.endAt ||
      value.endAt - value.startAt > 27 * 3_600_000
    ) {
      throw new ConvexError("INVALID_SLEEP_DAYS");
    }
    const previous = days[index - 1];
    if (
      previous &&
      (nextDate(previous.date) !== value.date ||
        previous.endAt !== value.startAt)
    ) {
      throw new ConvexError("INVALID_SLEEP_DAYS");
    }
  }
};

export const pottyByHour = dogQuery({
  args: { startAt: v.number(), endAt: v.number() },
  returns: v.array(pottyBucket),
  handler: async (ctx, { dogId, startAt, endAt }) => {
    validateWindow(startAt, endAt);
    const [dog, pee, poop] = await Promise.all([
      ctx.db.get("dogs", dogId),
      eventsByKind(ctx, dogId, "pee", startAt, endAt),
      eventsByKind(ctx, dogId, "poop", startAt, endAt),
    ]);
    if (dog === null) throw new ConvexError("DOG_NOT_FOUND");
    try {
      return bucketPottyByHour(
        [
          ...pee.map(({ at, peePlace }) => ({
            kind: "pee" as const,
            at,
            peePlace,
          })),
          ...poop.map(({ at }) => ({ kind: "poop" as const, at })),
        ],
        dog.timezone,
      );
    } catch {
      throw new ConvexError("INVALID_TIMEZONE");
    }
  },
});

export const walkIntervals = dogQuery({
  args: { startAt: v.number(), endAt: v.number() },
  returns: v.array(walkInterval),
  handler: async (ctx, { dogId, startAt, endAt }) => {
    validateWindow(startAt, endAt);
    const [walks, pees, poops, meals] = await Promise.all([
      eventsByKind(ctx, dogId, "walk", startAt, endAt),
      eventsByKind(ctx, dogId, "pee", startAt, endAt),
      eventsByKind(ctx, dogId, "poop", startAt, endAt),
      eventsByKind(ctx, dogId, "meal", startAt, endAt),
    ]);
    return buildOutingIntervals(
      [
        ...walks.flatMap(({ at, endedAt }) =>
          endedAt === undefined ? [] : [{ at, endedAt, kind: "walk" as const }],
        ),
        ...pees.flatMap(({ at, peePlace, walkId }) =>
          peePlace === "outside" && walkId === undefined
            ? [{ at, endedAt: at, kind: "pee" as const }]
            : [],
        ),
        ...poops.flatMap(({ at, walkId }) =>
          walkId === undefined
            ? [{ at, endedAt: at, kind: "poop" as const }]
            : [],
        ),
      ],
      meals,
    );
  },
});

export const sleepByDay = dogQuery({
  args: { days: v.array(insightDay), now: v.optional(v.number()) },
  returns: v.array(sleepTotal),
  handler: async (ctx, { dogId, days, now }) => {
    validateDays(days);
    const startAt = days[0].startAt;
    const currentAt = now ?? Date.now();
    if (!Number.isFinite(currentAt) || currentAt < startAt) {
      throw new ConvexError("INVALID_SLEEP_NOW");
    }
    const endAt = Math.min(currentAt, days.at(-1)!.endAt);
    const [wakeSeed, sleepSeed, wakes, sleeps] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_dog_kind_at", (q) =>
          q.eq("dogId", dogId).eq("kind", "wake").lt("at", startAt),
        )
        .order("desc")
        .take(1),
      ctx.db
        .query("events")
        .withIndex("by_dog_kind_at", (q) =>
          q.eq("dogId", dogId).eq("kind", "sleep").lt("at", startAt),
        )
        .order("desc")
        .take(1),
      eventsByKind(ctx, dogId, "wake", startAt, endAt),
      eventsByKind(ctx, dogId, "sleep", startAt, endAt),
    ]);
    const seedEvents: RestEvent[] = [
      ...wakeSeed.map(({ at }) => ({ kind: "wake", at }) as const),
      ...sleepSeed.map(({ at }) => ({ kind: "sleep", at }) as const),
    ];
    const seed = seedEvents.length
      ? seedEvents.reduce((latest, event) =>
          event.at >= latest.at ? event : latest,
        )
      : null;
    const events: RestEvent[] = [
      ...wakes.map(({ at }) => ({ kind: "wake", at }) as const),
      ...sleeps.map(({ at }) => ({ kind: "sleep", at }) as const),
    ];
    return sumSleepByDay(events, days, seed, currentAt);
  },
});

export const dayRatings = dogQuery({
  args: { startDate: v.string(), endDate: v.string() },
  returns: v.array(dayRating),
  handler: async (ctx, { dogId, startDate, endDate }) => {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (
      !start ||
      !end ||
      start > end ||
      (end.valueOf() - start.valueOf()) / dayMs + 1 > maxRatingDays
    ) {
      throw new ConvexError("INVALID_RATING_RANGE");
    }
    const days = await ctx.db
      .query("agendaDays")
      .withIndex("by_dog_date", (q) =>
        q.eq("dogId", dogId).gte("date", startDate).lte("date", endDate),
      )
      .order("asc")
      .take(maxRatingDays + 1);
    if (days.length > maxRatingDays) {
      throw new ConvexError("INSIGHT_RATING_LIMIT");
    }
    return days.flatMap(({ date, rating }) =>
      rating === undefined ? [] : [{ date, rating }],
    );
  },
});
