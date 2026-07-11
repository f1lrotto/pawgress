import { v } from "convex/values";

import { dogMutation, dogQuery } from "./lib/functions";
import { normalizeMeals } from "./lib/mealRoutines";

const routine = v.object({
  _id: v.id("routines"),
  _creationTime: v.number(),
  dogId: v.id("dogs"),
  kind: v.literal("meal"),
  label: v.string(),
  timeOfDay: v.string(),
});

export const list = dogQuery({
  args: {},
  returns: v.array(routine),
  handler: (ctx, { dogId }) =>
    ctx.db
      .query("routines")
      .withIndex("by_dog_kind_time", (q) =>
        q.eq("dogId", dogId).eq("kind", "meal"),
      )
      .collect(),
});

export const replaceMeals = dogMutation({
  args: {
    meals: v.array(
      v.object({
        label: v.string(),
        timeOfDay: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { dogId, meals }) => {
    const normalized = normalizeMeals(meals);
    const existing = await ctx.db
      .query("routines")
      .withIndex("by_dog_kind_time", (q) =>
        q.eq("dogId", dogId).eq("kind", "meal"),
      )
      .collect();

    await Promise.all(existing.map(({ _id }) => ctx.db.delete(_id)));
    await Promise.all(
      normalized.map((meal) =>
        ctx.db.insert("routines", { dogId, kind: "meal", ...meal }),
      ),
    );
    return null;
  },
});
