import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";

import { dogQuery } from "./lib/functions";
import { event } from "./lib/events";

const maxPageSize = 50;
const maximumRowsRead = 500;
const eventKind = v.union(
  v.literal("pee"),
  v.literal("poop"),
  v.literal("meal"),
  v.literal("treat"),
  v.literal("wake"),
  v.literal("sleep"),
  v.literal("walk"),
  v.literal("play"),
  v.literal("note"),
);

export const list = dogQuery({
  args: {
    kinds: v.optional(v.array(eventKind)),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(event),
  handler: (ctx, { dogId, kinds, paginationOpts }) => {
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > maxPageSize
    ) {
      throw new ConvexError("INVALID_PAGE_SIZE");
    }
    if (
      kinds !== undefined &&
      (kinds.length === 0 ||
        kinds.length > 9 ||
        new Set(kinds).size !== kinds.length)
    ) {
      throw new ConvexError("INVALID_EVENT_KINDS");
    }

    const range = ctx.db
      .query("events")
      .withIndex("by_dog_at", (q) => q.eq("dogId", dogId))
      .order("desc");
    const filtered = kinds
      ? range.filter((q) =>
          q.or(...kinds.map((kind) => q.eq(q.field("kind"), kind))),
        )
      : range;
    return filtered.paginate({
      ...paginationOpts,
      maximumRowsRead,
    });
  },
});
