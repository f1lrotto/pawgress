import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
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
import { dogMutation, dogQuery } from "./lib/functions";

const pottyKind = v.union(v.literal("pee"), v.literal("poop"));
const completePottyEvent = v.object({
  kind: pottyKind,
  at: v.number(),
});

const findActiveWalk = (ctx: QueryCtx | MutationCtx, dogId: Id<"dogs">) =>
  ctx.db
    .query("events")
    .withIndex("by_dog_kind_ended_at", (q) =>
      q.eq("dogId", dogId).eq("kind", "walk").eq("endedAt", undefined),
    )
    .unique();

const findLatestPotty = (ctx: MutationCtx, walkId: Id<"events">) =>
  ctx.db
    .query("events")
    .withIndex("by_walk_at", (q) => q.eq("walkId", walkId))
    .order("desc")
    .first();

const requireWalk = async (
  ctx: MutationCtx,
  dogId: Id<"dogs">,
  walkId: Id<"events">,
) => {
  const walk = await requireEventForDog(ctx, dogId, walkId);
  if (walk.kind !== "walk") throw new ConvexError("WALK_NOT_FOUND");
  return walk;
};

export const start = dogMutation({
  args: { at: v.number(), note: v.optional(v.string()) },
  returns: v.id("events"),
  handler: async (ctx, { dogId, at, note }) => {
    const dog = await requireDog(ctx, dogId);
    const timestamp = validateDogTimestamp(at, dog);
    const normalizedNote = note === undefined ? undefined : normalizeNote(note);
    if ((await findActiveWalk(ctx, dogId)) !== null) {
      throw new ConvexError("WALK_ALREADY_ACTIVE");
    }
    await assertWalkInterval(ctx, dogId, timestamp, undefined);
    return ctx.db.insert("events", {
      dogId,
      userId: ctx.userId,
      kind: "walk",
      at: timestamp,
      note: normalizedNote,
    });
  },
});

export const active = dogQuery({
  args: {},
  returns: v.union(event, v.null()),
  handler: (ctx, { dogId }) => findActiveWalk(ctx, dogId),
});

export const end = dogMutation({
  args: {
    walkId: v.id("events"),
    endedAt: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, { dogId, walkId, endedAt, note }) => {
    const walk = await requireWalk(ctx, dogId, walkId);
    const timestamp = validateDogTimestamp(
      endedAt,
      await requireDog(ctx, dogId),
    );
    if (timestamp < walk.at) throw new ConvexError("INVALID_WALK_DURATION");
    const completionNote = note === undefined ? undefined : normalizeNote(note);

    if (walk.endedAt !== undefined) {
      if (completionNote !== undefined && completionNote !== walk.note) {
        throw new ConvexError("WALK_ALREADY_ENDED");
      }
      return walk.endedAt;
    }

    const latestPotty = await findLatestPotty(ctx, walkId);
    if (latestPotty !== null && latestPotty.at > timestamp) {
      throw new ConvexError("INVALID_WALK_TIMESTAMP");
    }

    await ctx.db.patch("events", walkId, {
      endedAt: timestamp,
      ...(completionNote === undefined ? {} : { note: completionNote }),
    });
    return timestamp;
  },
});

export const logPotty = dogMutation({
  args: {
    walkId: v.id("events"),
    kind: pottyKind,
    at: v.number(),
    note: v.optional(v.string()),
    peePlace: v.optional(peePlace),
  },
  returns: v.id("events"),
  handler: async (ctx, { dogId, walkId, kind, at, note, peePlace }) => {
    const walk = await requireWalk(ctx, dogId, walkId);
    if (walk.endedAt !== undefined) throw new ConvexError("WALK_NOT_ACTIVE");
    validatePeePlace(kind, peePlace);
    if (peePlace === "inside") throw new ConvexError("INVALID_PEE_PLACE");
    const timestamp = validateDogTimestamp(at, await requireDog(ctx, dogId));
    if (timestamp < walk.at) {
      throw new ConvexError("INVALID_WALK_TIMESTAMP");
    }
    const linkedEvents = await ctx.db
      .query("events")
      .withIndex("by_walk_at", (q) => q.eq("walkId", walkId))
      .take(maxWalkEvents + 1);
    if (linkedEvents.length >= maxWalkEvents) {
      throw new ConvexError("WALK_EVENT_LIMIT");
    }
    return ctx.db.insert("events", {
      dogId,
      userId: ctx.userId,
      kind,
      at: timestamp,
      note: note === undefined ? undefined : normalizeNote(note),
      walkId,
      peePlace,
    });
  },
});

export const createWithPotty = dogMutation({
  args: {
    kind: pottyKind,
    pottyAt: v.number(),
    walkStartedAt: v.number(),
    walkEndedAt: v.optional(v.number()),
    note: v.optional(v.string()),
    peePlace: v.optional(peePlace),
  },
  returns: v.object({
    eventId: v.id("events"),
    walkId: v.id("events"),
  }),
  handler: async (
    ctx,
    { dogId, kind, pottyAt, walkStartedAt, walkEndedAt, note, peePlace },
  ) => {
    const dog = await requireDog(ctx, dogId);
    const eventAt = validateDogTimestamp(pottyAt, dog);
    const startedAt = validateDogTimestamp(walkStartedAt, dog);
    const endedAt =
      walkEndedAt === undefined
        ? undefined
        : validateDogTimestamp(walkEndedAt, dog);
    validatePeePlace(kind, peePlace);
    if (
      peePlace === "inside" ||
      startedAt > eventAt ||
      (endedAt !== undefined && (endedAt < eventAt || endedAt <= startedAt))
    ) {
      throw new ConvexError("INVALID_WALK_INTERVAL");
    }
    if (endedAt === undefined && (await findActiveWalk(ctx, dogId)) !== null) {
      throw new ConvexError("WALK_ALREADY_ACTIVE");
    }
    await assertWalkInterval(ctx, dogId, startedAt, endedAt);

    const walkId = await ctx.db.insert("events", {
      dogId,
      userId: ctx.userId,
      kind: "walk",
      at: startedAt,
      endedAt,
    });
    const eventId = await ctx.db.insert("events", {
      dogId,
      userId: ctx.userId,
      kind,
      at: eventAt,
      note: note === undefined ? undefined : normalizeNote(note),
      walkId,
      peePlace,
    });
    return { eventId, walkId };
  },
});

export const createComplete = dogMutation({
  args: {
    walkStartedAt: v.number(),
    walkEndedAt: v.number(),
    pottyEvents: v.array(completePottyEvent),
  },
  returns: v.object({
    eventIds: v.array(v.id("events")),
    walkId: v.id("events"),
  }),
  handler: async (ctx, { dogId, pottyEvents, walkStartedAt, walkEndedAt }) => {
    const dog = await requireDog(ctx, dogId);
    const startedAt = validateDogTimestamp(walkStartedAt, dog);
    const endedAt = validateDogTimestamp(walkEndedAt, dog);
    if (endedAt <= startedAt) throw new ConvexError("INVALID_WALK_INTERVAL");
    if (pottyEvents.length > maxWalkEvents) {
      throw new ConvexError("WALK_EVENT_LIMIT");
    }
    const events = pottyEvents
      .map(({ at, kind }) => ({
        at: validateDogTimestamp(at, dog),
        kind,
      }))
      .sort((a, b) => a.at - b.at);
    if (events.some(({ at }) => at < startedAt || at > endedAt)) {
      throw new ConvexError("INVALID_WALK_TIMESTAMP");
    }
    await assertWalkInterval(ctx, dogId, startedAt, endedAt);

    const walkId = await ctx.db.insert("events", {
      dogId,
      userId: ctx.userId,
      kind: "walk",
      at: startedAt,
      endedAt,
    });
    const eventIds = await Promise.all(
      events.map(({ at, kind }) =>
        ctx.db.insert("events", {
          dogId,
          userId: ctx.userId,
          kind,
          at,
          walkId,
          ...(kind === "pee" ? { peePlace: "outside" as const } : {}),
        }),
      ),
    );
    return { eventIds, walkId };
  },
});

export const undoReconstruction = dogMutation({
  args: { eventId: v.id("events"), walkId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { dogId, eventId, walkId }) => {
    const [event, walk, linkedEvents] = await Promise.all([
      ctx.db.get("events", eventId),
      ctx.db.get("events", walkId),
      ctx.db
        .query("events")
        .withIndex("by_walk_at", (q) => q.eq("walkId", walkId))
        .take(2),
    ]);
    if (event === null && walk === null) return null;
    if (
      event === null ||
      walk === null ||
      event.dogId !== dogId ||
      walk.dogId !== dogId ||
      walk.kind !== "walk" ||
      walk.endedAt === undefined ||
      (event.kind !== "pee" && event.kind !== "poop") ||
      event.walkId !== walkId ||
      linkedEvents.length !== 1 ||
      linkedEvents[0]._id !== eventId
    ) {
      throw new ConvexError("RECONSTRUCTION_CHANGED");
    }
    await Promise.all([
      ctx.db.delete("events", eventId),
      ctx.db.delete("events", walkId),
    ]);
    return null;
  },
});

export const updateDiary = dogMutation({
  args: {
    walkId: v.id("events"),
    note: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { dogId, walkId, note }) => {
    await requireWalk(ctx, dogId, walkId);
    await ctx.db.patch("events", walkId, {
      note: note === null ? undefined : normalizeNote(note),
    });
    return null;
  },
});
