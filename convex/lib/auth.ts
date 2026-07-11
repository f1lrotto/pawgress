import { getAuthUserId } from "@convex-dev/auth/server";
import type { Auth } from "convex/server";
import { ConvexError } from "convex/values";

export const requireAuthUserId = async (ctx: { auth: Auth }) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError("UNAUTHENTICATED");
  return userId;
};
