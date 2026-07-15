import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const agendaGoal = v.object({
  id: v.number(),
  text: v.string(),
  done: v.boolean(),
});

export default defineSchema({
  ...authTables,
  userPreferences: defineTable({
    userId: v.id("users"),
    locale: v.union(v.literal("en"), v.literal("sk")),
  }).index("by_user", ["userId"]),
  dogs: defineTable({
    name: v.string(),
    birthday: v.string(),
    breed: v.optional(v.string()),
    sex: v.optional(v.string()),
    timezone: v.string(),
    waterIntervalMinutes: v.optional(v.number()),
    createdBy: v.id("users"),
  }),
  dogMembers: defineTable({
    dogId: v.id("dogs"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("member")),
  })
    .index("by_dog", ["dogId"])
    .index("by_user", ["userId"])
    .index("by_dog_user", ["dogId", "userId"]),
  invites: defineTable({
    dogId: v.id("dogs"),
    code: v.string(),
    createdBy: v.id("users"),
    status: v.union(v.literal("active"), v.literal("redeemed")),
    redeemedBy: v.optional(v.id("users")),
  })
    .index("by_code", ["code"])
    .index("by_dog_status", ["dogId", "status"]),
  activityTypes: defineTable({
    dogId: v.id("dogs"),
    name: v.string(),
    emoji: v.optional(v.string()),
    isArchived: v.boolean(),
  }).index("by_dog", ["dogId"]),
  routines: defineTable({
    dogId: v.id("dogs"),
    kind: v.literal("meal"),
    label: v.string(),
    timeOfDay: v.string(),
  }).index("by_dog_kind_time", ["dogId", "kind", "timeOfDay"]),
  bodyMetrics: defineTable({
    dogId: v.id("dogs"),
    at: v.number(),
    weightKg: v.optional(v.number()),
    neckCm: v.optional(v.number()),
    chestCm: v.optional(v.number()),
    backCm: v.optional(v.number()),
  }).index("by_dog_at", ["dogId", "at"]),
  trainingCommands: defineTable({
    dogId: v.id("dogs"),
    name: v.string(),
    normalizedName: v.string(),
    description: v.optional(v.string()),
    howToTrain: v.optional(v.string()),
    status: v.union(
      v.literal("learning"),
      v.literal("solid"),
      v.literal("mastered"),
    ),
    isArchived: v.boolean(),
  })
    .index("by_dog_archived_name", ["dogId", "isArchived", "normalizedName"])
    .index("by_dog_status_name", ["dogId", "status", "normalizedName"]),
  trainingSessions: defineTable({
    dogId: v.id("dogs"),
    commandId: v.id("trainingCommands"),
    at: v.number(),
    rating: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_command_at", ["commandId", "at"])
    .index("by_dog_at", ["dogId", "at"]),
  agendaDays: defineTable({
    dogId: v.id("dogs"),
    date: v.string(),
    nextGoalId: v.number(),
    enrichmentGoals: v.array(agendaGoal),
    trainingGoals: v.array(agendaGoal),
    win: v.optional(v.string()),
    rating: v.optional(v.number()),
    diary: v.optional(v.string()),
  }).index("by_dog_date", ["dogId", "date"]),
  events: defineTable({
    dogId: v.id("dogs"),
    userId: v.id("users"),
    kind: v.union(
      v.literal("pee"),
      v.literal("poop"),
      v.literal("meal"),
      v.literal("water"),
      v.literal("treat"),
      v.literal("wake"),
      v.literal("sleep"),
      v.literal("walk"),
      v.literal("play"),
      v.literal("note"),
    ),
    at: v.number(),
    endedAt: v.optional(v.number()),
    note: v.optional(v.string()),
    activityTypeId: v.optional(v.id("activityTypes")),
    amount: v.optional(v.number()),
    walkId: v.optional(v.id("events")),
    peePlace: v.optional(v.union(v.literal("inside"), v.literal("outside"))),
  })
    .index("by_dog_at", ["dogId", "at"])
    .index("by_dog_kind_at", ["dogId", "kind", "at"])
    .index("by_dog_kind_ended_at", ["dogId", "kind", "endedAt"])
    .index("by_walk_at", ["walkId", "at"]),
});
