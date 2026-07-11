import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { validateDogTimestamp, requireDog } from "./lib/events";
import { dogMutation, dogQuery } from "./lib/functions";

const maxLimit = 500;
const maxValue = 500;
const bodyMetric = v.object({
  _id: v.id("bodyMetrics"),
  _creationTime: v.number(),
  dogId: v.id("dogs"),
  at: v.number(),
  weightKg: v.optional(v.number()),
  neckCm: v.optional(v.number()),
  chestCm: v.optional(v.number()),
  backCm: v.optional(v.number()),
});

const validateLimit = (limit: number) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new ConvexError("INVALID_LIMIT");
  }
  return limit;
};

const validateValue = (value: number, error: string) => {
  if (!Number.isFinite(value) || value <= 0 || value > maxValue) {
    throw new ConvexError(error);
  }
  return value;
};

const hasValue = (values: Array<number | undefined>) =>
  values.some((value) => value !== undefined);

const requireMetric = async (
  ctx: MutationCtx,
  dogId: Id<"dogs">,
  metricId: Id<"bodyMetrics">,
) => {
  const metric = await ctx.db.get("bodyMetrics", metricId);
  if (metric === null || metric.dogId !== dogId) {
    throw new ConvexError("BODY_METRIC_NOT_FOUND");
  }
  return metric;
};

export const listRecent = dogQuery({
  args: { limit: v.number() },
  returns: v.array(bodyMetric),
  handler: (ctx, { dogId, limit }) =>
    ctx.db
      .query("bodyMetrics")
      .withIndex("by_dog_at", (q) => q.eq("dogId", dogId))
      .order("desc")
      .take(validateLimit(limit)),
});

export const create = dogMutation({
  args: {
    at: v.number(),
    weightKg: v.optional(v.number()),
    neckCm: v.optional(v.number()),
    chestCm: v.optional(v.number()),
    backCm: v.optional(v.number()),
  },
  returns: v.id("bodyMetrics"),
  handler: async (ctx, { dogId, at, weightKg, neckCm, chestCm, backCm }) => {
    const values = {
      weightKg:
        weightKg === undefined
          ? undefined
          : validateValue(weightKg, "INVALID_WEIGHT"),
      neckCm:
        neckCm === undefined
          ? undefined
          : validateValue(neckCm, "INVALID_MEASUREMENT"),
      chestCm:
        chestCm === undefined
          ? undefined
          : validateValue(chestCm, "INVALID_MEASUREMENT"),
      backCm:
        backCm === undefined
          ? undefined
          : validateValue(backCm, "INVALID_MEASUREMENT"),
    };
    if (!hasValue(Object.values(values))) {
      throw new ConvexError("EMPTY_BODY_METRIC");
    }
    const dog = await requireDog(ctx, dogId);
    return ctx.db.insert("bodyMetrics", {
      dogId,
      at: validateDogTimestamp(at, dog),
      ...values,
    });
  },
});

export const update = dogMutation({
  args: {
    metricId: v.id("bodyMetrics"),
    at: v.optional(v.number()),
    weightKg: v.optional(v.union(v.number(), v.null())),
    neckCm: v.optional(v.union(v.number(), v.null())),
    chestCm: v.optional(v.union(v.number(), v.null())),
    backCm: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { dogId, metricId, at, weightKg, neckCm, chestCm, backCm },
  ) => {
    if (
      at === undefined &&
      weightKg === undefined &&
      neckCm === undefined &&
      chestCm === undefined &&
      backCm === undefined
    ) {
      throw new ConvexError("INVALID_UPDATE");
    }
    const metric = await requireMetric(ctx, dogId, metricId);
    const next = {
      weightKg:
        weightKg === undefined
          ? metric.weightKg
          : weightKg === null
            ? undefined
            : validateValue(weightKg, "INVALID_WEIGHT"),
      neckCm:
        neckCm === undefined
          ? metric.neckCm
          : neckCm === null
            ? undefined
            : validateValue(neckCm, "INVALID_MEASUREMENT"),
      chestCm:
        chestCm === undefined
          ? metric.chestCm
          : chestCm === null
            ? undefined
            : validateValue(chestCm, "INVALID_MEASUREMENT"),
      backCm:
        backCm === undefined
          ? metric.backCm
          : backCm === null
            ? undefined
            : validateValue(backCm, "INVALID_MEASUREMENT"),
    };
    if (!hasValue(Object.values(next))) {
      throw new ConvexError("EMPTY_BODY_METRIC");
    }
    const timestamp =
      at === undefined
        ? undefined
        : validateDogTimestamp(at, await requireDog(ctx, dogId));
    await ctx.db.patch("bodyMetrics", metricId, {
      ...(timestamp === undefined ? {} : { at: timestamp }),
      ...(weightKg === undefined ? {} : { weightKg: next.weightKg }),
      ...(neckCm === undefined ? {} : { neckCm: next.neckCm }),
      ...(chestCm === undefined ? {} : { chestCm: next.chestCm }),
      ...(backCm === undefined ? {} : { backCm: next.backCm }),
    });
    return null;
  },
});

export const remove = dogMutation({
  args: { metricId: v.id("bodyMetrics") },
  returns: v.null(),
  handler: async (ctx, { dogId, metricId }) => {
    const metric = await ctx.db.get("bodyMetrics", metricId);
    if (metric === null) return null;
    if (metric.dogId !== dogId) {
      throw new ConvexError("BODY_METRIC_NOT_FOUND");
    }
    await ctx.db.delete("bodyMetrics", metricId);
    return null;
  },
});
