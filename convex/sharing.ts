import { ConvexError, v } from "convex/values";

import { maxDogMemberships } from "./dogs";
import { authedMutation, dogMutation, dogQuery } from "./lib/functions";

const maxMembers = 100;
const codePattern = /^[A-F0-9]{32}$/;
const role = v.union(v.literal("owner"), v.literal("member"));
const activeInviteResult = v.object({
  inviteId: v.id("invites"),
  code: v.string(),
});
const invalidInvite = () => new ConvexError("INVITE_INVALID");
const normalizeCode = (code: string) => code.trim().toUpperCase();
const randomCode = () => crypto.randomUUID().replaceAll("-", "").toUpperCase();

export const listMembers = dogQuery({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      role,
      name: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { dogId }) => {
    const memberships = await ctx.db
      .query("dogMembers")
      .withIndex("by_dog", (q) => q.eq("dogId", dogId))
      .take(maxMembers + 1);
    if (memberships.length > maxMembers) {
      throw new ConvexError("MEMBER_LIMIT");
    }
    memberships.sort(
      (left, right) =>
        Number(left.role === "member") - Number(right.role === "member") ||
        left._creationTime - right._creationTime,
    );
    const users = await Promise.all(
      memberships.map(({ userId }) => ctx.db.get(userId)),
    );
    return memberships.flatMap(({ userId, role }, index) => {
      const user = users[index];
      return user ? [{ userId, role, name: user.name, email: user.email }] : [];
    });
  },
});

export const activeInvite = dogQuery({
  args: {},
  returns: v.union(v.null(), activeInviteResult),
  handler: async (ctx, { dogId }) => {
    const active = await ctx.db
      .query("invites")
      .withIndex("by_dog_status", (q) =>
        q.eq("dogId", dogId).eq("status", "active"),
      )
      .take(2);
    if (active.length > 1) throw new ConvexError("INVITE_LIMIT");
    return active[0] ? { inviteId: active[0]._id, code: active[0].code } : null;
  },
});

export const generateInvite = dogMutation({
  args: {},
  returns: activeInviteResult,
  handler: async (ctx, { dogId }) => {
    const active = await ctx.db
      .query("invites")
      .withIndex("by_dog_status", (q) =>
        q.eq("dogId", dogId).eq("status", "active"),
      )
      .take(2);
    if (active.length > 1) throw new ConvexError("INVITE_LIMIT");
    if (active[0]) return { inviteId: active[0]._id, code: active[0].code };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomCode();
      const collision = await ctx.db
        .query("invites")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (collision) continue;
      const inviteId = await ctx.db.insert("invites", {
        code,
        createdBy: ctx.userId,
        dogId,
        status: "active",
      });
      return { inviteId, code };
    }
    throw new ConvexError("INVITE_CODE_UNAVAILABLE");
  },
});

export const revokeInvite = dogMutation({
  args: { inviteId: v.id("invites") },
  returns: v.null(),
  handler: async (ctx, { dogId, inviteId }) => {
    const invite = await ctx.db.get(inviteId);
    if (invite === null) return null;
    if (invite.dogId !== dogId) throw invalidInvite();
    if (invite.status === "active") await ctx.db.delete(inviteId);
    return null;
  },
});

export const redeemInvite = authedMutation({
  args: { code: v.string() },
  returns: v.id("dogs"),
  handler: async (ctx, { code: rawCode }) => {
    if (rawCode.length > 64) throw invalidInvite();
    const code = normalizeCode(rawCode);
    if (!codePattern.test(code)) throw invalidInvite();
    const matches = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", code))
      .take(2);
    if (matches.length !== 1) throw invalidInvite();
    const [invite] = matches;
    if (invite.status === "redeemed") {
      if (invite.redeemedBy === ctx.userId) return invite.dogId;
      throw invalidInvite();
    }
    if ((await ctx.db.get(invite.dogId)) === null) throw invalidInvite();

    const existing = await ctx.db
      .query("dogMembers")
      .withIndex("by_dog_user", (q) =>
        q.eq("dogId", invite.dogId).eq("userId", ctx.userId),
      )
      .first();
    if (existing) return invite.dogId;

    const dogMemberships = await ctx.db
      .query("dogMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .take(maxDogMemberships);
    if (dogMemberships.length >= maxDogMemberships) {
      throw new ConvexError("DOG_MEMBERSHIP_LIMIT");
    }

    const members = await ctx.db
      .query("dogMembers")
      .withIndex("by_dog", (q) => q.eq("dogId", invite.dogId))
      .take(maxMembers);
    if (members.length >= maxMembers) throw new ConvexError("MEMBER_LIMIT");

    await ctx.db.insert("dogMembers", {
      dogId: invite.dogId,
      userId: ctx.userId,
      role: "member",
    });
    await ctx.db.patch(invite._id, {
      redeemedBy: ctx.userId,
      status: "redeemed",
    });
    return invite.dogId;
  },
});
