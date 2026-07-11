import { ConvexError, v } from "convex/values";

import { authedQuery } from "./lib/functions";

export const current = authedQuery({
  args: {},
  returns: v.object({
    _id: v.id("users"),
    _creationTime: v.number(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  }),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    if (user === null) throw new ConvexError("UNAUTHENTICATED");
    return user;
  },
});
