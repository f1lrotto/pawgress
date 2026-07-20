import { ConvexError, v } from "convex/values";

import { dogMutation, dogQuery } from "./lib/functions";
import {
  assertWalkInterval,
  event,
  maxWalkEvents,
  normalizeNote,
  peePlace,
  requireDog,
  requireEventForDog,
  validateDogTimestamp,
  validatePeePlace,
} from "./lib/events";
import {
  assertRestDeletion,
  assertRestMove,
  assertRestTransition,
  isRestKind,
} from "./lib/rest";

const maxAmount = 10_000;
const maxListLimit = 100;

const quickKinds = [
  "pee",
  "poop",
  "meal",
  "water",
  "treat",
  "wake",
  "sleep",
] as const;
type QuickKind = (typeof quickKinds)[number];

const quickKind = v.union(
  v.literal("pee"),
  v.literal("poop"),
  v.literal("meal"),
  v.literal("water"),
  v.literal("treat"),
  v.literal("wake"),
  v.literal("sleep"),
);

const normalizeAmount = (kind: string, amount: number) => {
  if (
    (kind !== "meal" && kind !== "treat") ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > maxAmount
  ) {
    throw new ConvexError("INVALID_AMOUNT");
  }
  return amount;
};

const validateLimit = (limit: number) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > maxListLimit) {
    throw new ConvexError("INVALID_LIMIT");
  }
  return limit;
};

export const logQuick = dogMutation({
  args: {
    kind: quickKind,
    at: v.number(),
    note: v.optional(v.string()),
    amount: v.optional(v.number()),
    peePlace: v.optional(peePlace),
  },
  returns: v.id("events"),
  handler: async (ctx, { dogId, kind, at, note, amount, peePlace }) => {
    const dog = await requireDog(ctx, dogId);
    const timestamp = validateDogTimestamp(at, dog);
    if (isRestKind(kind)) {
      await assertRestTransition(ctx, dogId, kind, timestamp);
    }
    return ctx.db.insert("events", {
      dogId,
      userId: ctx.userId,
      kind,
      at: timestamp,
      note: note === undefined ? undefined : normalizeNote(note),
      amount: amount === undefined ? undefined : normalizeAmount(kind, amount),
      peePlace: validatePeePlace(kind, peePlace),
    });
  },
});

export const update = dogMutation({
  args: {
    eventId: v.id("events"),
    at: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    note: v.optional(v.union(v.string(), v.null())),
    amount: v.optional(v.union(v.number(), v.null())),
    peePlace: v.optional(peePlace),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { dogId, eventId, at, endedAt, note, amount, peePlace },
  ) => {
    if (
      at === undefined &&
      endedAt === undefined &&
      note === undefined &&
      amount === undefined &&
      peePlace === undefined
    ) {
      throw new ConvexError("INVALID_UPDATE");
    }
    const existing = await requireEventForDog(ctx, dogId, eventId);
    if (peePlace !== undefined) validatePeePlace(existing.kind, peePlace);
    if (
      endedAt !== undefined &&
      existing.kind !== "walk" &&
      existing.kind !== "play"
    ) {
      throw new ConvexError("INVALID_UPDATE");
    }
    const dog =
      at === undefined && endedAt === undefined
        ? undefined
        : await requireDog(ctx, dogId);
    const timestamp =
      at === undefined ? undefined : validateDogTimestamp(at, dog!);
    const endTimestamp =
      endedAt === undefined ? undefined : validateDogTimestamp(endedAt, dog!);

    if (existing.kind === "play") {
      const nextAt = timestamp ?? existing.at;
      const nextEndedAt = endTimestamp ?? existing.endedAt;
      if (nextEndedAt !== undefined && nextEndedAt < nextAt) {
        throw new ConvexError("INVALID_PLAY_INTERVAL");
      }
    } else if (existing.kind === "walk") {
      const nextAt = timestamp ?? existing.at;
      const nextEndedAt = endTimestamp ?? existing.endedAt;
      const [firstPotty, lastPotty] = await Promise.all([
        ctx.db
          .query("events")
          .withIndex("by_walk_at", (q) => q.eq("walkId", eventId))
          .first(),
        ctx.db
          .query("events")
          .withIndex("by_walk_at", (q) => q.eq("walkId", eventId))
          .order("desc")
          .first(),
      ]);
      await assertWalkInterval(ctx, dogId, nextAt, nextEndedAt, eventId);
      if (
        (nextEndedAt !== undefined && nextAt > nextEndedAt) ||
        (firstPotty !== null && firstPotty.at < nextAt) ||
        (nextEndedAt !== undefined &&
          lastPotty !== null &&
          lastPotty.at > nextEndedAt)
      ) {
        throw new ConvexError("INVALID_WALK_INTERVAL");
      }
    } else if (existing.walkId !== undefined && timestamp !== undefined) {
      const walk = await ctx.db.get("events", existing.walkId);
      if (
        walk === null ||
        walk.kind !== "walk" ||
        walk.dogId !== dogId ||
        timestamp < walk.at ||
        (walk.endedAt !== undefined && timestamp > walk.endedAt)
      ) {
        throw new ConvexError("INVALID_WALK_TIMESTAMP");
      }
    }
    if (timestamp !== undefined && isRestKind(existing.kind)) {
      await assertRestMove(ctx, existing, timestamp);
    }
    await ctx.db.patch("events", eventId, {
      ...(timestamp === undefined ? {} : { at: timestamp }),
      ...(endTimestamp === undefined ? {} : { endedAt: endTimestamp }),
      ...(note === undefined
        ? {}
        : { note: note === null ? undefined : normalizeNote(note) }),
      ...(amount === undefined
        ? {}
        : {
            amount:
              amount === null
                ? undefined
                : normalizeAmount(existing.kind, amount),
          }),
      ...(peePlace === undefined ? {} : { peePlace }),
      ...(peePlace === "inside" ? { walkId: undefined } : {}),
    });
    return null;
  },
});

export const remove = dogMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { dogId, eventId }) => {
    const existing = await ctx.db.get("events", eventId);
    if (existing === null) return null;
    if (existing.dogId !== dogId) throw new ConvexError("EVENT_NOT_FOUND");
    if (isRestKind(existing.kind)) await assertRestDeletion(ctx, existing);
    if (existing.kind === "walk") {
      const linkedEvents = await ctx.db
        .query("events")
        .withIndex("by_walk_at", (q) => q.eq("walkId", eventId))
        .take(maxWalkEvents + 1);
      if (linkedEvents.length > maxWalkEvents) {
        throw new ConvexError("WALK_EVENT_LIMIT");
      }
      await Promise.all(
        linkedEvents.map(({ _id }) =>
          ctx.db.patch("events", _id, { walkId: undefined }),
        ),
      );
    }
    await ctx.db.delete("events", eventId);
    return null;
  },
});

export const listRecent = dogQuery({
  args: { limit: v.number() },
  returns: v.array(event),
  handler: (ctx, { dogId, limit }) =>
    ctx.db
      .query("events")
      .withIndex("by_dog_at", (q) => q.eq("dogId", dogId))
      .order("desc")
      .take(validateLimit(limit)),
});

export const waterCount = dogQuery({
  args: { startAt: v.number(), endAt: v.number() },
  returns: v.number(),
  handler: async (ctx, { dogId, startAt, endAt }) => {
    if (
      !Number.isFinite(startAt) ||
      !Number.isFinite(endAt) ||
      startAt < 0 ||
      endAt <= startAt ||
      endAt - startAt > 48 * 60 * 60_000
    ) {
      throw new ConvexError("INVALID_TIME_RANGE");
    }
    return (
      await ctx.db
        .query("events")
        .withIndex("by_dog_kind_at", (q) =>
          q
            .eq("dogId", dogId)
            .eq("kind", "water")
            .gte("at", startAt)
            .lt("at", endAt),
        )
        .collect()
    ).length;
  },
});

export const latestByKind = dogQuery({
  args: {},
  returns: v.object({
    pee: v.union(event, v.null()),
    poop: v.union(event, v.null()),
    meal: v.union(event, v.null()),
    water: v.union(event, v.null()),
    treat: v.union(event, v.null()),
    wake: v.union(event, v.null()),
    sleep: v.union(event, v.null()),
    walk: v.union(event, v.null()),
  }),
  handler: async (ctx, { dogId }) => {
    const findLatest = (kind: QuickKind | "walk") =>
      ctx.db
        .query("events")
        .withIndex("by_dog_kind_at", (q) =>
          q.eq("dogId", dogId).eq("kind", kind),
        )
        .order("desc")
        .first();
    const [pee, poop, meal, water, treat, wake, sleep, walk] =
      await Promise.all([...quickKinds.map(findLatest), findLatest("walk")]);
    return { pee, poop, meal, water, treat, wake, sleep, walk };
  },
});
