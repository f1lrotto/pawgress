/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { maxDogMemberships } from "./dogs";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

afterEach(() => vi.restoreAllMocks());

const setup = async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", {
      email: "owner@example.com",
      name: "Owner",
    });
    const memberId = await db.insert("users", {
      email: "member@example.com",
      name: "Member",
    });
    const inviteeId = await db.insert("users", {
      email: "invitee@example.com",
      name: "Invitee",
    });
    const otherId = await db.insert("users", {
      email: "other@example.com",
      name: "Other",
    });
    const strangerId = await db.insert("users", {
      email: "stranger@example.com",
      name: "Stranger",
    });
    const dogId = await db.insert("dogs", {
      birthday: "2025-01-01",
      createdBy: ownerId,
      name: "Milo",
      timezone: "UTC",
    });
    const otherDogId = await db.insert("dogs", {
      birthday: "2024-01-01",
      createdBy: inviteeId,
      name: "Poppy",
      timezone: "Europe/Bratislava",
    });
    await Promise.all([
      db.insert("dogMembers", { dogId, userId: ownerId, role: "owner" }),
      db.insert("dogMembers", { dogId, userId: memberId, role: "member" }),
      db.insert("dogMembers", {
        dogId: otherDogId,
        userId: inviteeId,
        role: "owner",
      }),
    ]);
    return {
      dogId,
      inviteeId,
      memberId,
      otherDogId,
      otherId,
      ownerId,
      strangerId,
    };
  });
  const as = (userId: Id<"users">) =>
    t.withIdentity({ subject: `${userId}|test-session` });
  return {
    ...ids,
    invitee: as(ids.inviteeId),
    member: as(ids.memberId),
    other: as(ids.otherId),
    owner: as(ids.ownerId),
    stranger: as(ids.strangerId),
    t,
  };
};

describe("sharing", () => {
  test("lists minimum member profiles for household members only", async () => {
    const { dogId, member, memberId, owner, ownerId, stranger, t } =
      await setup();

    await expect(t.query(api.sharing.listMembers, { dogId })).rejects.toThrow(
      "UNAUTHENTICATED",
    );
    await expect(
      stranger.query(api.sharing.listMembers, { dogId }),
    ).rejects.toThrow("FORBIDDEN");

    const expected = [
      {
        email: "owner@example.com",
        name: "Owner",
        role: "owner",
        userId: ownerId,
      },
      {
        email: "member@example.com",
        name: "Member",
        role: "member",
        userId: memberId,
      },
    ];
    await expect(
      owner.query(api.sharing.listMembers, { dogId }),
    ).resolves.toEqual(expected);
    await expect(
      member.query(api.sharing.listMembers, { dogId }),
    ).resolves.toEqual(expected);
  });

  test("lets any member generate one reusable active ASCII invite", async () => {
    const { dogId, member, owner, ownerId, t } = await setup();

    const first = await owner.mutation(api.sharing.generateInvite, { dogId });
    expect(first.code).toMatch(/^[A-F0-9]{32}$/);
    await expect(
      member.mutation(api.sharing.generateInvite, { dogId }),
    ).resolves.toEqual(first);
    await expect(
      owner.query(api.sharing.activeInvite, { dogId }),
    ).resolves.toEqual(first);
    await expect(
      member.query(api.sharing.activeInvite, { dogId }),
    ).resolves.toEqual(first);

    const invites = await t.run(({ db }) => db.query("invites").collect());
    expect(invites).toEqual([
      expect.objectContaining({
        _id: first.inviteId,
        code: first.code,
        createdBy: ownerId,
        dogId,
        status: "active",
      }),
    ]);
  });

  test("retries a global code collision before inserting", async () => {
    const { dogId, owner, ownerId, t } = await setup();
    await t.run(({ db }) =>
      db.insert("invites", {
        code: "AAAAAAAAAAAA4AAA8AAAAAAAAAAAAAAA",
        createdBy: ownerId,
        dogId,
        redeemedBy: ownerId,
        status: "redeemed",
      }),
    );
    const random = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
      .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

    const invite = await owner.mutation(api.sharing.generateInvite, { dogId });

    expect(invite.code).toBe("BBBBBBBBBBBB4BBB8BBBBBBBBBBBBBBB");
    expect(await t.run(({ db }) => db.query("invites").collect())).toHaveLength(
      2,
    );
    random.mockRestore();
  });

  test("serializes concurrent generation to one active invite", async () => {
    const { dogId, member, owner, t } = await setup();

    const [first, second] = await Promise.all([
      owner.mutation(api.sharing.generateInvite, { dogId }),
      member.mutation(api.sharing.generateInvite, { dogId }),
    ]);

    expect(second).toEqual(first);
    const active = await t.run(({ db }) =>
      db
        .query("invites")
        .withIndex("by_dog_status", (q) =>
          q.eq("dogId", dogId).eq("status", "active"),
        )
        .collect(),
    );
    expect(active).toHaveLength(1);
  });

  test("rejects signed-out and non-member invite management", async () => {
    const { dogId, owner, stranger, t } = await setup();
    const invite = await owner.mutation(api.sharing.generateInvite, { dogId });

    await expect(t.query(api.sharing.activeInvite, { dogId })).rejects.toThrow(
      "UNAUTHENTICATED",
    );
    await expect(
      t.mutation(api.sharing.generateInvite, { dogId }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      t.mutation(api.sharing.revokeInvite, {
        dogId,
        inviteId: invite.inviteId,
      }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      t.mutation(api.sharing.redeemInvite, { code: invite.code }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      stranger.mutation(api.sharing.generateInvite, { dogId }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      stranger.query(api.sharing.activeInvite, { dogId }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      stranger.mutation(api.sharing.revokeInvite, {
        dogId,
        inviteId: invite.inviteId,
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  test("reactively hides consumed invites", async () => {
    const { dogId, invitee, owner } = await setup();
    const invite = await owner.mutation(api.sharing.generateInvite, { dogId });

    await expect(
      owner.query(api.sharing.activeInvite, { dogId }),
    ).resolves.toEqual(invite);
    await invitee.mutation(api.sharing.redeemInvite, { code: invite.code });
    await expect(
      owner.query(api.sharing.activeInvite, { dogId }),
    ).resolves.toBeNull();
  });

  test("revokes idempotently and regenerates a different valid code", async () => {
    const { dogId, invitee, member, owner, t } = await setup();
    const random = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
      .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const first = await owner.mutation(api.sharing.generateInvite, { dogId });

    await Promise.all([
      owner.mutation(api.sharing.revokeInvite, {
        dogId,
        inviteId: first.inviteId,
      }),
      member.mutation(api.sharing.revokeInvite, {
        dogId,
        inviteId: first.inviteId,
      }),
    ]);
    await expect(
      owner.mutation(api.sharing.revokeInvite, {
        dogId,
        inviteId: first.inviteId,
      }),
    ).resolves.toBeNull();
    await expect(
      owner.query(api.sharing.activeInvite, { dogId }),
    ).resolves.toBeNull();
    await expect(
      invitee.mutation(api.sharing.redeemInvite, { code: first.code }),
    ).rejects.toThrow("INVITE_INVALID");

    const second = await member.mutation(api.sharing.generateInvite, {
      dogId,
    });
    expect(second.code).toBe("BBBBBBBBBBBB4BBB8BBBBBBBBBBBBBBB");
    expect(second.code).not.toBe(first.code);
    await expect(
      owner.query(api.sharing.activeInvite, { dogId }),
    ).resolves.toEqual(second);
    expect(await t.run(({ db }) => db.get(first.inviteId))).toBeNull();
    random.mockRestore();
  });

  test("serializes revocation against redemption", async () => {
    const { dogId, invitee, inviteeId, owner, t } = await setup();
    const invite = await owner.mutation(api.sharing.generateInvite, { dogId });

    const [, redemption] = await Promise.allSettled([
      owner.mutation(api.sharing.revokeInvite, {
        dogId,
        inviteId: invite.inviteId,
      }),
      invitee.mutation(api.sharing.redeemInvite, { code: invite.code }),
    ]);
    const storedInvite = await t.run(({ db }) => db.get(invite.inviteId));
    const membership = await t.run(({ db }) =>
      db
        .query("dogMembers")
        .withIndex("by_dog_user", (q) =>
          q.eq("dogId", dogId).eq("userId", inviteeId),
        )
        .unique(),
    );

    if (redemption.status === "fulfilled") {
      expect(membership).toMatchObject({ role: "member" });
      expect(storedInvite).toMatchObject({
        redeemedBy: inviteeId,
        status: "redeemed",
      });
    } else {
      expect(String(redemption.reason)).toContain("INVITE_INVALID");
      expect(membership).toBeNull();
      expect(storedInvite).toBeNull();
    }
    await expect(
      owner.query(api.sharing.activeInvite, { dogId }),
    ).resolves.toBeNull();
  });

  test("redeems atomically with a fixed member role and supports many dogs", async () => {
    const { dogId, invitee, inviteeId, otherDogId, owner, t } = await setup();
    const { code } = await owner.mutation(api.sharing.generateInvite, {
      dogId,
    });

    await expect(
      invitee.mutation(api.sharing.redeemInvite, {
        code: `  ${code.toLowerCase()}  `,
      }),
    ).resolves.toBe(dogId);
    await expect(
      invitee.mutation(api.sharing.redeemInvite, { code }),
    ).resolves.toBe(dogId);

    const memberships = await t.run(({ db }) =>
      db
        .query("dogMembers")
        .withIndex("by_user", (q) => q.eq("userId", inviteeId))
        .collect(),
    );
    expect(memberships).toHaveLength(2);
    expect(memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dogId, role: "member" }),
        expect.objectContaining({ dogId: otherDogId, role: "owner" }),
      ]),
    );
    await expect(
      invitee.query(api.sharing.listMembers, { dogId }),
    ).resolves.toContainEqual(
      expect.objectContaining({ userId: inviteeId, role: "member" }),
    );
  });

  test("uses one failure for malformed, unknown, and consumed codes", async () => {
    const { invitee, other, owner, dogId } = await setup();
    const { code } = await owner.mutation(api.sharing.generateInvite, {
      dogId,
    });

    await expect(
      invitee.mutation(api.sharing.redeemInvite, { code: "not-a-code" }),
    ).rejects.toThrow("INVITE_INVALID");
    await expect(
      invitee.mutation(api.sharing.redeemInvite, {
        code: "ABCDEF123456ABCDEF123456ABCDEF12",
      }),
    ).rejects.toThrow("INVITE_INVALID");
    await invitee.mutation(api.sharing.redeemInvite, { code });
    await expect(
      other.mutation(api.sharing.redeemInvite, { code }),
    ).rejects.toThrow("INVITE_INVALID");
  });

  test("keeps an active invite when an existing member submits it", async () => {
    const { dogId, member, owner, t } = await setup();
    const invite = await owner.mutation(api.sharing.generateInvite, { dogId });

    await expect(
      member.mutation(api.sharing.redeemInvite, { code: invite.code }),
    ).resolves.toBe(dogId);
    await expect(
      owner.mutation(api.sharing.generateInvite, { dogId }),
    ).resolves.toEqual(invite);
    expect(await t.run(({ db }) => db.get(invite.inviteId))).toMatchObject({
      status: "active",
    });
  });

  test("allows only one winner when two users redeem concurrently", async () => {
    const { dogId, invitee, inviteeId, other, otherId, owner, t } =
      await setup();
    const { code } = await owner.mutation(api.sharing.generateInvite, {
      dogId,
    });

    const results = await Promise.allSettled([
      invitee.mutation(api.sharing.redeemInvite, { code }),
      other.mutation(api.sharing.redeemInvite, { code }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );

    const winners = await t.run(async ({ db }) => {
      const memberships = await Promise.all(
        [inviteeId, otherId].map((userId) =>
          db
            .query("dogMembers")
            .withIndex("by_dog_user", (q) =>
              q.eq("dogId", dogId).eq("userId", userId),
            )
            .unique(),
        ),
      );
      return memberships.filter(Boolean);
    });
    expect(winners).toHaveLength(1);
  });

  test("enforces the bounded household member cap before consuming an invite", async () => {
    const { dogId, invitee, owner, t } = await setup();
    const invite = await owner.mutation(api.sharing.generateInvite, { dogId });
    await t.run(async ({ db }) => {
      const userIds = await Promise.all(
        Array.from({ length: 98 }, () => db.insert("users", {})),
      );
      await Promise.all(
        userIds.map((userId) =>
          db.insert("dogMembers", { dogId, userId, role: "member" }),
        ),
      );
    });

    await expect(
      invitee.mutation(api.sharing.redeemInvite, { code: invite.code }),
    ).rejects.toThrow("MEMBER_LIMIT");
    expect(await t.run(({ db }) => db.get(invite.inviteId))).toMatchObject({
      status: "active",
    });
  });

  test("preserves the invite when the redeemer already has 100 dogs", async () => {
    const { dogId, invitee, inviteeId, owner, t } = await setup();
    const invite = await owner.mutation(api.sharing.generateInvite, { dogId });
    await t.run(async ({ db }) => {
      for (let index = 1; index < maxDogMemberships; index += 1) {
        const existingDogId = await db.insert("dogs", {
          birthday: "2024-01-01",
          createdBy: inviteeId,
          name: `Existing dog ${String(index).padStart(3, "0")}`,
          timezone: "UTC",
        });
        await db.insert("dogMembers", {
          dogId: existingDogId,
          role: "member",
          userId: inviteeId,
        });
      }
    });
    await expect(invitee.query(api.dogs.listMine)).resolves.toHaveLength(
      maxDogMemberships,
    );

    await expect(
      invitee.mutation(api.sharing.redeemInvite, { code: invite.code }),
    ).rejects.toThrow("DOG_MEMBERSHIP_LIMIT");
    await expect(
      t.run(({ db }) =>
        db
          .query("dogMembers")
          .withIndex("by_dog_user", (q) =>
            q.eq("dogId", dogId).eq("userId", inviteeId),
          )
          .unique(),
      ),
    ).resolves.toBeNull();
    expect(await t.run(({ db }) => db.get(invite.inviteId))).toMatchObject({
      status: "active",
    });
    await expect(invitee.query(api.dogs.listMine)).resolves.toHaveLength(
      maxDogMemberships,
    );
  });
});
