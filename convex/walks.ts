import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
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

const findActiveWalk = (ctx: QueryCtx | MutationCtx, dogId: Id<"dogs">) =>
  ctx.db
    .query("events")
    .withIndex("by_dog_kind_ended_at", (q) =>
      q.eq("dogId", dogId).eq("kind", "walk").eq("endedAt", undefined),
    )
    .unique();

const findLatestWalk = (ctx: MutationCtx, dogId: Id<"dogs">) =>
  ctx.db
    .query("events")
    .withIndex("by_dog_kind_at", (q) => q.eq("dogId", dogId).eq("kind", "walk"))
    .order("desc")
    .first();

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
    const latestWalk = await findLatestWalk(ctx, dogId);
    if (latestWalk?.endedAt !== undefined && timestamp < latestWalk.endedAt) {
      throw new ConvexError("INVALID_WALK_INTERVAL");
    }
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
