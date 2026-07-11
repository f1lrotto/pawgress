import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { authedQuery } from "./lib/functions";

const role = v.union(v.literal("owner"), v.literal("member"));
type Role = "owner" | "member";

// Match the established 100-item caps for other user-managed domain lists.
export const maxDogMemberships = 100;

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

export const listMine = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("dogs"),
      _creationTime: v.number(),
      name: v.string(),
      birthday: v.string(),
      breed: v.optional(v.string()),
      sex: v.optional(v.string()),
      timezone: v.string(),
      createdBy: v.id("users"),
      role,
    }),
  ),
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("dogMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .take(maxDogMemberships + 1);
    if (memberships.length > maxDogMemberships) {
      throw new ConvexError("DOG_MEMBERSHIP_LIMIT");
    }
    const rolesByDog = new Map<Id<"dogs">, Role>();
    for (const { dogId, role } of memberships) {
      const existing = rolesByDog.get(dogId);
      if (existing !== undefined && existing !== role) {
        throw new ConvexError("CONFLICTING_DOG_MEMBERSHIP");
      }
      rolesByDog.set(dogId, role);
    }
    const dogs = await Promise.all(
      [...rolesByDog].map(async ([dogId, role]) => {
        const dog = await ctx.db.get(dogId);
        return dog === null ? null : { ...dog, role };
      }),
    );

    return dogs
      .flatMap((dog) => (dog === null ? [] : [dog]))
      .sort(
        (left, right) =>
          compareText(left.name, right.name) ||
          left._creationTime - right._creationTime ||
          compareText(left._id, right._id),
      );
  },
});
