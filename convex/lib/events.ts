import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const maxFutureMs = 5 * 60 * 1_000;
const maxNoteLength = 500;
export const maxWalkEvents = 100;
export const peePlace = v.union(v.literal("inside"), v.literal("outside"));

export const event = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  dogId: v.id("dogs"),
  userId: v.id("users"),
  kind: v.union(
    v.literal("pee"),
    v.literal("poop"),
    v.literal("meal"),
    v.literal("water"),
    v.literal("treat"),
    v.literal("wake"),
    v.literal("sleep"),
    v.literal("walk"),
    v.literal("play"),
    v.literal("note"),
  ),
  at: v.number(),
  endedAt: v.optional(v.number()),
  note: v.optional(v.string()),
  activityTypeId: v.optional(v.id("activityTypes")),
  amount: v.optional(v.number()),
  walkId: v.optional(v.id("events")),
  peePlace: v.optional(peePlace),
});

export const validatePeePlace = (
  kind: string,
  place: "inside" | "outside" | undefined,
) => {
  if ((kind === "pee") !== (place !== undefined)) {
    throw new ConvexError("INVALID_PEE_PLACE");
  }
  return place;
};

export const validateDogTimestamp = (
  at: number,
  dog: { birthday: string; timezone: string },
  now = Date.now(),
) => {
  if (!Number.isFinite(at) || at < 0 || at > now + maxFutureMs) {
    throw new ConvexError("INVALID_TIMESTAMP");
  }
  let localDate: string;
  try {
    localDate = new Date(at).toLocaleDateString("sv-SE", {
      timeZone: dog.timezone,
    });
  } catch {
    throw new ConvexError("INVALID_TIMESTAMP");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || localDate < dog.birthday) {
    throw new ConvexError("INVALID_TIMESTAMP");
  }
  return at;
};

export const normalizeNote = (note: string) => {
  const normalized = note.trim();
  if (normalized.length > maxNoteLength) {
    throw new ConvexError("INVALID_NOTE");
  }
  return normalized || undefined;
};

export const requireDog = async (ctx: MutationCtx, dogId: Id<"dogs">) => {
  const dog = await ctx.db.get("dogs", dogId);
  if (dog === null) throw new ConvexError("DOG_NOT_FOUND");
  return dog;
};

export const requireEventForDog = async (
  ctx: MutationCtx,
  dogId: Id<"dogs">,
  eventId: Id<"events">,
) => {
  const existing = await ctx.db.get("events", eventId);
  if (existing === null || existing.dogId !== dogId) {
    throw new ConvexError("EVENT_NOT_FOUND");
  }
  return existing;
};

export const assertWalkInterval = async (
  ctx: MutationCtx,
  dogId: Id<"dogs">,
  at: number,
  endedAt: number | undefined,
  excludedId?: Id<"events">,
) => {
  const findOther = (events: Array<Doc<"events">>) =>
    events.find(({ _id }) => _id !== excludedId) ?? null;
  const [previousEvents, nextEvents] = await Promise.all([
    ctx.db
      .query("events")
      .withIndex("by_dog_kind_at", (q) =>
        q.eq("dogId", dogId).eq("kind", "walk").lte("at", at),
      )
      .order("desc")
      .take(2),
    ctx.db
      .query("events")
      .withIndex("by_dog_kind_at", (q) =>
        q.eq("dogId", dogId).eq("kind", "walk").gte("at", at),
      )
      .order("asc")
      .take(2),
  ]);
  const previous = findOther(previousEvents);
  const next = findOther(nextEvents);
  if (
    (previous !== null &&
      (previous.endedAt === undefined || previous.endedAt > at)) ||
    (next !== null && (endedAt === undefined || endedAt > next.at))
  ) {
    throw new ConvexError("INVALID_WALK_INTERVAL");
  }
};
