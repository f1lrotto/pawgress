import { ConvexError, v } from "convex/values";

import { maxDogMemberships } from "./dogs";
import { authedMutation } from "./lib/functions";
import { normalizeMeals } from "./lib/mealRoutines";

const activityNames = {
  en: [
    "Lick mat",
    "Snuffle mat",
    "Towel burrito",
    "Scatter feeding",
    "Tug",
    "Fetch",
  ],
  sk: [
    "Lízacia podložka",
    "Čuchacia podložka",
    "Burrito z uteráka",
    "Rozsypané kŕmenie",
    "Preťahovanie",
    "Aportovanie",
  ],
} as const;

const maxNameLength = 64;
const maxWeightKg = 500;

export const todayInTimezone = (timezone: string, now = Date.now()) => {
  try {
    const today = new Date(now).toLocaleDateString("sv-SE", {
      timeZone: timezone,
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error();
    return today;
  } catch {
    throw new ConvexError("INVALID_TIMEZONE");
  }
};

export const validateBirthday = (
  birthday: string,
  timezone: string,
  now = Date.now(),
) => {
  const parsed = new Date(`${birthday}T00:00:00.000Z`);
  const isRealDate =
    /^\d{4}-\d{2}-\d{2}$/.test(birthday) &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === birthday;

  if (!isRealDate || birthday > todayInTimezone(timezone, now)) {
    throw new ConvexError("INVALID_BIRTHDAY");
  }
};

export const complete = authedMutation({
  args: {
    name: v.string(),
    birthday: v.string(),
    timezone: v.string(),
    weightKg: v.number(),
    mealRoutines: v.array(
      v.object({
        label: v.string(),
        timeOfDay: v.string(),
      }),
    ),
  },
  returns: v.id("dogs"),
  handler: async (
    ctx,
    { name: rawName, birthday, timezone, weightKg, mealRoutines },
  ) => {
    const now = Date.now();
    const name = rawName.trim();
    if (name.length === 0 || name.length > maxNameLength) {
      throw new ConvexError("INVALID_NAME");
    }
    validateBirthday(birthday, timezone, now);
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > maxWeightKg) {
      throw new ConvexError("INVALID_WEIGHT");
    }
    const meals = normalizeMeals(mealRoutines);
    const [memberships, preferences] = await Promise.all([
      ctx.db
        .query("dogMembers")
        .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
        .take(maxDogMemberships),
      ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
        .unique(),
    ]);
    if (memberships.length >= maxDogMemberships) {
      throw new ConvexError("DOG_MEMBERSHIP_LIMIT");
    }
    const dogId = await ctx.db.insert("dogs", {
      name,
      birthday,
      timezone,
      createdBy: ctx.userId,
    });

    await Promise.all([
      ctx.db.insert("dogMembers", {
        dogId,
        userId: ctx.userId,
        role: "owner",
      }),
      ctx.db.insert("bodyMetrics", { dogId, at: now, weightKg }),
      ...meals.map((meal) =>
        ctx.db.insert("routines", { dogId, kind: "meal", ...meal }),
      ),
      ...activityNames[preferences?.locale ?? "en"].map((name) =>
        ctx.db.insert("activityTypes", { dogId, name, isArchived: false }),
      ),
    ]);
    return dogId;
  },
});
