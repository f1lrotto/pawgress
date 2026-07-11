import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type RestKind = "wake" | "sleep";

export const isRestKind = (kind: string): kind is RestKind =>
  kind === "wake" || kind === "sleep";

const getRestNeighbors = async (
  ctx: QueryCtx | MutationCtx,
  dogId: Id<"dogs">,
  at: number,
  excludeId?: Id<"events">,
) => {
  const find = (kind: RestKind, order: "asc" | "desc") => {
    const query = ctx.db
      .query("events")
      .withIndex("by_dog_kind_at", (q) => {
        const dogKind = q.eq("dogId", dogId).eq("kind", kind);
        return order === "desc" ? dogKind.lte("at", at) : dogKind.gte("at", at);
      })
      .order(order);
    return (
      excludeId === undefined
        ? query
        : query.filter((q) => q.neq(q.field("_id"), excludeId))
    ).first();
  };
  const [wakeBefore, wakeAfter, sleepBefore, sleepAfter] = await Promise.all([
    find("wake", "desc"),
    find("wake", "asc"),
    find("sleep", "desc"),
    find("sleep", "asc"),
  ]);
  const latest = (events: Array<Doc<"events"> | null>) =>
    events.reduce<Doc<"events"> | null>(
      (closest, event) =>
        event !== null && (closest === null || event.at > closest.at)
          ? event
          : closest,
      null,
    );
  const earliest = (events: Array<Doc<"events"> | null>) =>
    events.reduce<Doc<"events"> | null>(
      (closest, event) =>
        event !== null && (closest === null || event.at < closest.at)
          ? event
          : closest,
      null,
    );

  return {
    before: latest([wakeBefore, sleepBefore]),
    after: earliest([wakeAfter, sleepAfter]),
  };
};

export const assertRestTransition = async (
  ctx: MutationCtx,
  dogId: Id<"dogs">,
  kind: RestKind,
  at: number,
  excludeId?: Id<"events">,
) => {
  const { before, after } = await getRestNeighbors(ctx, dogId, at, excludeId);
  if (
    before?.at === at ||
    after?.at === at ||
    before?.kind === kind ||
    after?.kind === kind
  ) {
    throw new ConvexError("INVALID_REST_TRANSITION");
  }
};

export const assertRestMove = async (
  ctx: MutationCtx,
  event: Doc<"events">,
  at: number,
) => {
  const oldNeighbors = await getRestNeighbors(
    ctx,
    event.dogId,
    event.at,
    event._id,
  );
  if (
    oldNeighbors.before !== null &&
    oldNeighbors.after !== null &&
    oldNeighbors.before.kind === oldNeighbors.after.kind &&
    (at <= oldNeighbors.before.at || at >= oldNeighbors.after.at)
  ) {
    throw new ConvexError("INVALID_REST_TRANSITION");
  }
  await assertRestTransition(
    ctx,
    event.dogId,
    event.kind as RestKind,
    at,
    event._id,
  );
};

export const assertRestDeletion = async (
  ctx: MutationCtx,
  event: Doc<"events">,
) => {
  const { before, after } = await getRestNeighbors(
    ctx,
    event.dogId,
    event.at,
    event._id,
  );
  if (before !== null && after !== null && before.kind === after.kind) {
    throw new ConvexError("INVALID_REST_TRANSITION");
  }
};
