import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { validateDogTimestamp } from "./lib/events";
import { dogMutation, dogQuery } from "./lib/functions";

const maxCommands = 100;
const maxDescriptionLength = 1_000;
const maxHowToTrainLength = 2_000;
const maxNameLength = 64;
const maxNotesLength = 500;
const maxSessions = 100;

const status = v.union(
  v.literal("learning"),
  v.literal("solid"),
  v.literal("mastered"),
);

const command = v.object({
  _id: v.id("trainingCommands"),
  _creationTime: v.number(),
  dogId: v.id("dogs"),
  name: v.string(),
  description: v.optional(v.string()),
  howToTrain: v.optional(v.string()),
  status,
  isArchived: v.boolean(),
});

const session = v.object({
  _id: v.id("trainingSessions"),
  _creationTime: v.number(),
  dogId: v.id("dogs"),
  commandId: v.id("trainingCommands"),
  at: v.number(),
  rating: v.number(),
  notes: v.optional(v.string()),
});

const normalizeName = (name: string) => {
  const value = name.normalize("NFKC").trim();
  if (!value || value.length > maxNameLength) {
    throw new ConvexError("INVALID_NAME");
  }
  return value;
};

const nameKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

const normalizeText = (
  value: string | null | undefined,
  maxLength: number,
  error: string,
) => {
  if (value === null || value === undefined) return undefined;
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length > maxLength) throw new ConvexError(error);
  return normalized || undefined;
};

const validateLimit = (limit: number, max: number) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new ConvexError("INVALID_LIMIT");
  }
  return limit;
};

const publicCommand = ({
  _id,
  _creationTime,
  dogId,
  name,
  description,
  howToTrain,
  status,
  isArchived,
}: Doc<"trainingCommands">) => ({
  _id,
  _creationTime,
  dogId,
  name,
  description,
  howToTrain,
  status,
  isArchived,
});

const requireCommand = async (
  ctx: QueryCtx | MutationCtx,
  dogId: Id<"dogs">,
  commandId: Id<"trainingCommands">,
) => {
  const value = await ctx.db.get("trainingCommands", commandId);
  if (value === null || value.dogId !== dogId) {
    throw new ConvexError("COMMAND_NOT_FOUND");
  }
  return value;
};

const requireUniqueActiveName = async (
  ctx: MutationCtx,
  dogId: Id<"dogs">,
  normalizedName: string,
  excluding?: Id<"trainingCommands">,
) => {
  const duplicate = await ctx.db
    .query("trainingCommands")
    .withIndex("by_dog_archived_name", (q) =>
      q
        .eq("dogId", dogId)
        .eq("isArchived", false)
        .eq("normalizedName", normalizedName),
    )
    .first();
  if (duplicate !== null && duplicate._id !== excluding) {
    throw new ConvexError("DUPLICATE_COMMAND");
  }
};

export const list = dogQuery({
  args: {
    includeArchived: v.optional(v.boolean()),
    limit: v.number(),
  },
  returns: v.array(command),
  handler: async (ctx, { dogId, includeArchived = false, limit }) => {
    const query = ctx.db
      .query("trainingCommands")
      .withIndex("by_dog_archived_name", (q) =>
        includeArchived
          ? q.eq("dogId", dogId)
          : q.eq("dogId", dogId).eq("isArchived", false),
      );
    return (await query.take(validateLimit(limit, maxCommands))).map(
      publicCommand,
    );
  },
});

export const get = dogQuery({
  args: {
    commandId: v.id("trainingCommands"),
    sessionLimit: v.number(),
  },
  returns: v.object({ command, sessions: v.array(session) }),
  handler: async (ctx, { dogId, commandId, sessionLimit }) => {
    const value = await requireCommand(ctx, dogId, commandId);
    const sessions = await ctx.db
      .query("trainingSessions")
      .withIndex("by_command_at", (q) => q.eq("commandId", commandId))
      .order("desc")
      .take(validateLimit(sessionLimit, maxSessions));
    return { command: publicCommand(value), sessions };
  },
});

export const create = dogMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    howToTrain: v.optional(v.string()),
  },
  returns: v.id("trainingCommands"),
  handler: async (ctx, { dogId, name, description, howToTrain }) => {
    const normalizedName = normalizeName(name);
    const key = nameKey(normalizedName);
    const existing = await ctx.db
      .query("trainingCommands")
      .withIndex("by_dog_archived_name", (q) => q.eq("dogId", dogId))
      .take(maxCommands);
    if (existing.length >= maxCommands) {
      throw new ConvexError("COMMAND_LIMIT");
    }
    await requireUniqueActiveName(ctx, dogId, key);
    return ctx.db.insert("trainingCommands", {
      dogId,
      name: normalizedName,
      normalizedName: key,
      description: normalizeText(
        description,
        maxDescriptionLength,
        "INVALID_DESCRIPTION",
      ),
      howToTrain: normalizeText(
        howToTrain,
        maxHowToTrainLength,
        "INVALID_HOW_TO_TRAIN",
      ),
      status: "learning",
      isArchived: false,
    });
  },
});

export const update = dogMutation({
  args: {
    commandId: v.id("trainingCommands"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    howToTrain: v.optional(v.union(v.string(), v.null())),
    status: v.optional(status),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { dogId, commandId, name, description, howToTrain, status },
  ) => {
    if (
      name === undefined &&
      description === undefined &&
      howToTrain === undefined &&
      status === undefined
    ) {
      throw new ConvexError("INVALID_UPDATE");
    }
    const existing = await requireCommand(ctx, dogId, commandId);
    const normalizedName = name === undefined ? undefined : normalizeName(name);
    const key =
      normalizedName === undefined ? undefined : nameKey(normalizedName);
    if (!existing.isArchived && key !== undefined) {
      await requireUniqueActiveName(ctx, dogId, key, commandId);
    }
    await ctx.db.patch("trainingCommands", commandId, {
      ...(normalizedName === undefined
        ? {}
        : { name: normalizedName, normalizedName: key }),
      ...(description === undefined
        ? {}
        : {
            description: normalizeText(
              description,
              maxDescriptionLength,
              "INVALID_DESCRIPTION",
            ),
          }),
      ...(howToTrain === undefined
        ? {}
        : {
            howToTrain: normalizeText(
              howToTrain,
              maxHowToTrainLength,
              "INVALID_HOW_TO_TRAIN",
            ),
          }),
      ...(status === undefined ? {} : { status }),
    });
    return null;
  },
});

export const setArchived = dogMutation({
  args: {
    commandId: v.id("trainingCommands"),
    isArchived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { dogId, commandId, isArchived }) => {
    const existing = await requireCommand(ctx, dogId, commandId);
    if (!isArchived) {
      await requireUniqueActiveName(
        ctx,
        dogId,
        existing.normalizedName,
        commandId,
      );
    }
    await ctx.db.patch("trainingCommands", commandId, { isArchived });
    return null;
  },
});

export const logSession = dogMutation({
  args: {
    commandId: v.id("trainingCommands"),
    at: v.number(),
    rating: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.id("trainingSessions"),
  handler: async (ctx, { dogId, commandId, at, rating, notes }) => {
    const existing = await requireCommand(ctx, dogId, commandId);
    if (existing.isArchived) throw new ConvexError("COMMAND_ARCHIVED");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ConvexError("INVALID_RATING");
    }
    const dog = await ctx.db.get("dogs", dogId);
    if (dog === null) throw new ConvexError("DOG_NOT_FOUND");
    return ctx.db.insert("trainingSessions", {
      dogId,
      commandId,
      at: validateDogTimestamp(at, dog),
      rating,
      notes: normalizeText(notes, maxNotesLength, "INVALID_NOTES"),
    });
  },
});
