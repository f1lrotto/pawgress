import {
  customCtx,
  customCtxAndArgs,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { ConvexError, v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import {
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from "../_generated/server";
import { requireAuthUserId } from "./auth";

const requireDogMembership = async (
  ctx: QueryCtx | MutationCtx,
  dogId: Id<"dogs">,
) => {
  const userId = await requireAuthUserId(ctx);
  const membership = await ctx.db
    .query("dogMembers")
    .withIndex("by_dog_user", (q) => q.eq("dogId", dogId).eq("userId", userId))
    .unique();

  if (membership === null) throw new ConvexError("FORBIDDEN");
  return { userId, membership };
};

export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ userId: await requireAuthUserId(ctx) })),
);

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ userId: await requireAuthUserId(ctx) })),
);

export const dogQuery = customQuery(
  query,
  customCtxAndArgs({
    args: { dogId: v.id("dogs") },
    input: async (ctx: QueryCtx, { dogId }) => ({
      ctx: await requireDogMembership(ctx, dogId),
      args: { dogId },
    }),
  }),
);

export const dogMutation = customMutation(
  mutation,
  customCtxAndArgs({
    args: { dogId: v.id("dogs") },
    input: async (ctx: MutationCtx, { dogId }) => ({
      ctx: await requireDogMembership(ctx, dogId),
      args: { dogId },
    }),
  }),
);
