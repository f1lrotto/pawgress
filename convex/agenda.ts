import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { dogMutation, dogQuery } from "./lib/functions";
import { todayInTimezone } from "./onboarding";

const maxDiaryLength = 4_000;
const maxGoalLength = 160;
const maxGoals = 20;
const maxWinLength = 500;

const category = v.union(v.literal("enrichment"), v.literal("training"));
const goal = v.object({
  id: v.number(),
  text: v.string(),
  done: v.boolean(),
});
const agendaDay = v.object({
  _id: v.id("agendaDays"),
  _creationTime: v.number(),
  dogId: v.id("dogs"),
  date: v.string(),
  nextGoalId: v.number(),
  enrichmentGoals: v.array(goal),
  trainingGoals: v.array(goal),
  win: v.optional(v.string()),
  rating: v.optional(v.number()),
  diary: v.optional(v.string()),
});

type Category = "enrichment" | "training";
type AgendaGoal = Doc<"agendaDays">["enrichmentGoals"][number];

const validateDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date.startsWith("0000") ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new ConvexError("INVALID_AGENDA_DATE");
  }
  return date;
};

const validateGoalId = (goalId: number) => {
  if (!Number.isSafeInteger(goalId) || goalId < 1) {
    throw new ConvexError("INVALID_GOAL_ID");
  }
  return goalId;
};

const normalizeGoal = (text: string) => {
  const value = text.normalize("NFKC").trim();
  if (!value || value.length > maxGoalLength) {
    throw new ConvexError("INVALID_AGENDA_GOAL");
  }
  return value;
};

const normalizeOptional = (
  value: string | null,
  maxLength: number,
  error: string,
) => {
  if (value === null) return undefined;
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ConvexError(error);
  return normalized || undefined;
};

const findDay = (
  ctx: QueryCtx | MutationCtx,
  dogId: Id<"dogs">,
  date: string,
) =>
  ctx.db
    .query("agendaDays")
    .withIndex("by_dog_date", (q) => q.eq("dogId", dogId).eq("date", date))
    .unique();

const requireWritableDate = async (
  ctx: MutationCtx,
  dogId: Id<"dogs">,
  date: string,
) => {
  validateDate(date);
  const dog = await ctx.db.get("dogs", dogId);
  if (dog === null) throw new ConvexError("DOG_NOT_FOUND");
  if (todayInTimezone(dog.timezone) !== date) {
    throw new ConvexError("AGENDA_READ_ONLY");
  }
};

const getOrCreateDay = async (
  ctx: MutationCtx,
  dogId: Id<"dogs">,
  date: string,
) => {
  const existing = await findDay(ctx, dogId, date);
  if (existing !== null) return existing;
  const id = await ctx.db.insert("agendaDays", {
    dogId,
    date,
    nextGoalId: 1,
    enrichmentGoals: [],
    trainingGoals: [],
  });
  const created = await ctx.db.get("agendaDays", id);
  if (created === null) throw new ConvexError("AGENDA_NOT_FOUND");
  return created;
};

const goalsFor = (day: Doc<"agendaDays">, value: Category) =>
  value === "enrichment" ? day.enrichmentGoals : day.trainingGoals;

const patchGoals = (
  ctx: MutationCtx,
  dayId: Id<"agendaDays">,
  value: Category,
  goals: AgendaGoal[],
) =>
  value === "enrichment"
    ? ctx.db.patch(dayId, { enrichmentGoals: goals })
    : ctx.db.patch(dayId, { trainingGoals: goals });

const setTextField = async (
  ctx: MutationCtx,
  dogId: Id<"dogs">,
  date: string,
  field: "diary" | "win",
  value: string | null,
  maxLength: number,
  error: string,
) => {
  await requireWritableDate(ctx, dogId, date);
  const normalized = normalizeOptional(value, maxLength, error);
  const existing = await findDay(ctx, dogId, date);
  if (existing === null && normalized === undefined) return null;
  const day = existing ?? (await getOrCreateDay(ctx, dogId, date));
  await ctx.db.patch(
    day._id,
    field === "win" ? { win: normalized } : { diary: normalized },
  );
  return null;
};

export const get = dogQuery({
  args: { date: v.string() },
  returns: v.union(agendaDay, v.null()),
  handler: (ctx, { dogId, date }) => findDay(ctx, dogId, validateDate(date)),
});

export const addGoal = dogMutation({
  args: { date: v.string(), category, text: v.string() },
  returns: v.number(),
  handler: async (ctx, { dogId, date, category: value, text }) => {
    await requireWritableDate(ctx, dogId, date);
    const normalized = normalizeGoal(text);
    const day = await getOrCreateDay(ctx, dogId, date);
    const goals = goalsFor(day, value);
    if (goals.length >= maxGoals) {
      throw new ConvexError("AGENDA_GOAL_LIMIT");
    }
    const goalId = validateGoalId(day.nextGoalId);
    await Promise.all([
      patchGoals(ctx, day._id, value, [
        ...goals,
        { id: goalId, text: normalized, done: false },
      ]),
      ctx.db.patch(day._id, { nextGoalId: goalId + 1 }),
    ]);
    return goalId;
  },
});

export const setGoalDone = dogMutation({
  args: {
    date: v.string(),
    category,
    goalId: v.number(),
    done: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { dogId, date, category: value, goalId, done }) => {
    await requireWritableDate(ctx, dogId, date);
    validateGoalId(goalId);
    const day = await findDay(ctx, dogId, date);
    const goals = day === null ? [] : goalsFor(day, value);
    if (day === null || !goals.some(({ id }) => id === goalId)) {
      throw new ConvexError("AGENDA_GOAL_NOT_FOUND");
    }
    await patchGoals(
      ctx,
      day._id,
      value,
      goals.map((item) => (item.id === goalId ? { ...item, done } : item)),
    );
    return null;
  },
});

export const removeGoal = dogMutation({
  args: { date: v.string(), category, goalId: v.number() },
  returns: v.null(),
  handler: async (ctx, { dogId, date, category: value, goalId }) => {
    await requireWritableDate(ctx, dogId, date);
    validateGoalId(goalId);
    const day = await findDay(ctx, dogId, date);
    if (day === null) return null;
    const goals = goalsFor(day, value);
    if (!goals.some(({ id }) => id === goalId)) return null;
    await patchGoals(
      ctx,
      day._id,
      value,
      goals.filter(({ id }) => id !== goalId),
    );
    return null;
  },
});

export const setWin = dogMutation({
  args: { date: v.string(), win: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: (ctx, { dogId, date, win }) =>
    setTextField(
      ctx,
      dogId,
      date,
      "win",
      win,
      maxWinLength,
      "INVALID_AGENDA_WIN",
    ),
});

export const setRating = dogMutation({
  args: { date: v.string(), rating: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { dogId, date, rating }) => {
    await requireWritableDate(ctx, dogId, date);
    if (
      rating !== null &&
      (!Number.isFinite(rating) ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5)
    ) {
      throw new ConvexError("INVALID_AGENDA_RATING");
    }
    const existing = await findDay(ctx, dogId, date);
    if (existing === null && rating === null) return null;
    const day = existing ?? (await getOrCreateDay(ctx, dogId, date));
    await ctx.db.patch(day._id, { rating: rating ?? undefined });
    return null;
  },
});

export const setDiary = dogMutation({
  args: { date: v.string(), diary: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: (ctx, { dogId, date, diary }) =>
    setTextField(
      ctx,
      dogId,
      date,
      "diary",
      diary,
      maxDiaryLength,
      "INVALID_AGENDA_DIARY",
    ),
});
