import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/functions";

const locale = v.union(v.literal("en"), v.literal("sk"));
export const maxPreferenceDocuments = 5;

const findPreferences = async (
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) => {
  const preferences = await ctx.db
    .query("userPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("asc")
    .take(maxPreferenceDocuments + 1);
  if (preferences.length > maxPreferenceDocuments) {
    throw new ConvexError("PREFERENCE_CORRUPTION_LIMIT");
  }
  return preferences;
};

export const current = authedQuery({
  args: {},
  returns: v.union(locale, v.null()),
  handler: async (ctx) =>
    (await findPreferences(ctx, ctx.userId))[0]?.locale ?? null,
});

export const setLocale = authedMutation({
  args: { locale },
  returns: v.null(),
  handler: async (ctx, { locale }) => {
    const [preference, ...duplicates] = await findPreferences(ctx, ctx.userId);
    if (preference === undefined) {
      await ctx.db.insert("userPreferences", { userId: ctx.userId, locale });
    } else {
      await Promise.all([
        preference.locale === locale
          ? null
          : ctx.db.patch(preference._id, { locale }),
        ...duplicates.map(({ _id }) => ctx.db.delete(_id)),
      ]);
    }
    return null;
  },
});
