import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { dogMutation, dogQuery } from "./lib/functions";
import { normalizeNote, requireDog, validateDogTimestamp } from "./lib/events";

const maxActivityTypes = 100;
const maxEmojiLength = 16;
const maxNameLength = 64;
const maxWindowMs = 27 * 60 * 60 * 1_000;

const activityType = v.object({
  _id: v.id("activityTypes"),
  _creationTime: v.number(),
  dogId: v.id("dogs"),
  name: v.string(),
  emoji: v.optional(v.string()),
  isArchived: v.boolean(),
});

const dayActivity = v.object({
  activityTypeId: v.id("activityTypes"),
  activityName: v.string(),
});

const normalizeName = (name: string) => {
  const normalized = name.normalize("NFKC").trim();
  if (!normalized || normalized.length > maxNameLength) {
    throw new ConvexError("INVALID_ACTIVITY_NAME");
  }
  return normalized;
};

const normalizeEmoji = (emoji: string) => {
  const normalized = emoji.normalize("NFKC").trim();
  if (normalized.length > maxEmojiLength) {
    throw new ConvexError("INVALID_ACTIVITY_EMOJI");
  }
  return normalized || undefined;
};

const duplicateKey = (name: string) => name.normalize("NFKC").toLowerCase();

const validateLimit = (limit: number) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > maxActivityTypes) {
    throw new ConvexError("INVALID_LIMIT");
  }
  return limit;
};

const requireActivityType = async (
  ctx: MutationCtx | QueryCtx,
  dogId: Id<"dogs">,
  activityTypeId: Id<"activityTypes">,
) => {
  const value = await ctx.db.get("activityTypes", activityTypeId);
  if (value === null || value.dogId !== dogId) {
    throw new ConvexError("ACTIVITY_TYPE_NOT_FOUND");
  }
  return value;
};

export const list = dogQuery({
  args: {
    includeArchived: v.optional(v.boolean()),
    limit: v.number(),
  },
  returns: v.array(activityType),
  handler: (ctx, { dogId, includeArchived = false, limit }) => {
    const query = ctx.db
      .query("activityTypes")
      .withIndex("by_dog", (q) => q.eq("dogId", dogId));
    return (
      includeArchived
        ? query
        : query.filter((q) => q.eq(q.field("isArchived"), false))
    ).take(validateLimit(limit));
  },
});

export const listDay = dogQuery({
  args: {
    startAt: v.number(),
    endAt: v.number(),
  },
  returns: v.array(dayActivity),
  handler: async (ctx, { dogId, startAt, endAt }) => {
    if (
      !Number.isFinite(startAt) ||
      !Number.isFinite(endAt) ||
      startAt < 0 ||
      startAt >= endAt ||
      endAt - startAt > maxWindowMs
    ) {
      throw new ConvexError("INVALID_ENRICHMENT_WINDOW");
    }
    const events = await ctx.db
      .query("events")
      .withIndex("by_dog_kind_at", (q) =>
        q
          .eq("dogId", dogId)
          .eq("kind", "play")
          .gte("at", startAt)
          .lt("at", endAt),
      )
      .order("desc")
      .collect();
    return Promise.all(
      events.map(async ({ activityTypeId }) => {
        if (activityTypeId === undefined) {
          throw new ConvexError("ACTIVITY_TYPE_NOT_FOUND");
        }
        const type = await requireActivityType(ctx, dogId, activityTypeId);
        return { activityTypeId, activityName: type.name };
      }),
    );
  },
});

export const create = dogMutation({
  args: {
    name: v.string(),
    emoji: v.optional(v.string()),
  },
  returns: v.id("activityTypes"),
  handler: async (ctx, { dogId, name, emoji }) => {
    const normalizedName = normalizeName(name);
    const existing = await ctx.db
      .query("activityTypes")
      .withIndex("by_dog", (q) => q.eq("dogId", dogId))
      .take(maxActivityTypes);
    if (
      existing.some(
        (value) => duplicateKey(value.name) === duplicateKey(normalizedName),
      )
    ) {
      throw new ConvexError("DUPLICATE_ACTIVITY_TYPE");
    }
    if (existing.length >= maxActivityTypes) {
      throw new ConvexError("ACTIVITY_TYPE_LIMIT");
    }
    return ctx.db.insert("activityTypes", {
      dogId,
      name: normalizedName,
      emoji: emoji === undefined ? undefined : normalizeEmoji(emoji),
      isArchived: false,
    });
  },
});

export const setArchived = dogMutation({
  args: {
    activityTypeId: v.id("activityTypes"),
    isArchived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { dogId, activityTypeId, isArchived }) => {
    await requireActivityType(ctx, dogId, activityTypeId);
    await ctx.db.patch("activityTypes", activityTypeId, { isArchived });
    return null;
  },
});

export const logPlay = dogMutation({
  args: {
    activityTypeId: v.id("activityTypes"),
    at: v.number(),
    endedAt: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.id("events"),
  handler: async (ctx, { dogId, activityTypeId, at, endedAt, note }) => {
    const type = await requireActivityType(ctx, dogId, activityTypeId);
    if (type.isArchived) throw new ConvexError("ACTIVITY_TYPE_ARCHIVED");
    const dog = await requireDog(ctx, dogId);
    const timestamp = validateDogTimestamp(at, dog);
    const endTimestamp =
      endedAt === undefined ? undefined : validateDogTimestamp(endedAt, dog);
    if (endTimestamp !== undefined && endTimestamp < timestamp) {
      throw new ConvexError("INVALID_PLAY_INTERVAL");
    }
    return ctx.db.insert("events", {
      dogId,
      userId: ctx.userId,
      kind: "play",
      activityTypeId,
      at: timestamp,
      endedAt: endTimestamp,
      note: note === undefined ? undefined : normalizeNote(note),
    });
  },
});

export const logPlays = dogMutation({
  args: {
    activityTypeIds: v.array(v.id("activityTypes")),
    at: v.number(),
  },
  returns: v.array(v.id("events")),
  handler: async (ctx, { dogId, activityTypeIds, at }) => {
    if (
      activityTypeIds.length === 0 ||
      activityTypeIds.length > maxActivityTypes ||
      new Set(activityTypeIds).size !== activityTypeIds.length
    ) {
      throw new ConvexError("INVALID_ACTIVITY_TYPES");
    }
    const dog = await requireDog(ctx, dogId);
    const timestamp = validateDogTimestamp(at, dog);
    const types = await Promise.all(
      activityTypeIds.map((activityTypeId) =>
        requireActivityType(ctx, dogId, activityTypeId),
      ),
    );
    if (types.some(({ isArchived }) => isArchived)) {
      throw new ConvexError("ACTIVITY_TYPE_ARCHIVED");
    }
    return Promise.all(
      activityTypeIds.map((activityTypeId) =>
        ctx.db.insert("events", {
          dogId,
          userId: ctx.userId,
          kind: "play",
          activityTypeId,
          at: timestamp,
        }),
      ),
    );
  },
});
