/// <reference types="vite/client" />

import type {
  FunctionReference,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.{ts,tsx}");
const eventKinds = [
  "pee",
  "poop",
  "meal",
  "treat",
  "wake",
  "sleep",
  "walk",
  "play",
  "note",
] as const;
type EventKind = (typeof eventKinds)[number];
type ListArgs = {
  dogId: Id<"dogs">;
  kinds?: EventKind[];
  paginationOpts: PaginationOptions;
};
type TimelineApi = {
  list: FunctionReference<
    "query",
    "public",
    ListArgs,
    PaginationResult<Doc<"events">>
  >;
};
const timeline = (api as unknown as { timeline: TimelineApi }).timeline;

const setup = async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", {});
    const memberId = await db.insert("users", {});
    const strangerId = await db.insert("users", {});
    const dogId = await db.insert("dogs", {
      name: "Zoe",
      birthday: "2024-01-01",
      timezone: "UTC",
      createdBy: ownerId,
    });
    const otherDogId = await db.insert("dogs", {
      name: "Luna",
      birthday: "2024-01-01",
      timezone: "UTC",
      createdBy: ownerId,
    });
    await Promise.all([
      db.insert("dogMembers", { dogId, userId: ownerId, role: "owner" }),
      db.insert("dogMembers", { dogId, userId: memberId, role: "member" }),
      db.insert("dogMembers", {
        dogId: otherDogId,
        userId: ownerId,
        role: "owner",
      }),
    ]);
    return { dogId, memberId, otherDogId, ownerId, strangerId };
  });
  return {
    ...ids,
    t,
    owner: t.withIdentity({ subject: `${ids.ownerId}|test-session` }),
    member: t.withIdentity({ subject: `${ids.memberId}|test-session` }),
    stranger: t.withIdentity({ subject: `${ids.strangerId}|test-session` }),
  };
};

const listArgs = (
  dogId: Id<"dogs">,
  overrides: Partial<ListArgs> = {},
): ListArgs => ({
  dogId,
  paginationOpts: { numItems: 50, cursor: null },
  ...overrides,
});

const insertEvents = (
  t: Awaited<ReturnType<typeof setup>>["t"],
  dogId: Id<"dogs">,
  userId: Id<"users">,
  events: Array<{ at: number; kind: EventKind; note?: string }>,
) =>
  t.run(({ db }) =>
    Promise.all(
      events.map((event) => db.insert("events", { dogId, userId, ...event })),
    ),
  );

describe("timeline list", () => {
  it("requires authentication and membership without crossing dogs", async () => {
    const { dogId, member, otherDogId, owner, ownerId, stranger, t } =
      await setup();
    await insertEvents(t, dogId, ownerId, [{ kind: "pee", at: 100 }]);
    await insertEvents(t, otherDogId, ownerId, [{ kind: "meal", at: 200 }]);

    await expect(t.query(timeline.list, listArgs(dogId))).rejects.toThrow(
      "UNAUTHENTICATED",
    );
    await expect(
      stranger.query(timeline.list, listArgs(dogId)),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      member.query(timeline.list, listArgs(otherDogId)),
    ).rejects.toThrow("FORBIDDEN");
    await expect(owner.query(timeline.list, listArgs(dogId))).resolves.toEqual(
      expect.objectContaining({
        page: [expect.objectContaining({ dogId, kind: "pee" })],
      }),
    );
  });

  it("returns the full raw event history newest first", async () => {
    const { dogId, owner, ownerId, t } = await setup();
    const [atStart, middle, atEnd] = await insertEvents(t, dogId, ownerId, [
      { kind: "pee", at: 100, note: "start" },
      { kind: "meal", at: 150, note: "middle" },
      { kind: "poop", at: 200, note: "end" },
    ]);

    const result = await owner.query(timeline.list, listArgs(dogId));
    expect(result.page.map(({ _id }) => _id)).toEqual([atEnd, middle, atStart]);
    expect(result.page).toEqual([
      expect.objectContaining({ _id: atEnd, at: 200 }),
      expect.objectContaining({
        _id: middle,
        dogId,
        userId: ownerId,
        kind: "meal",
        at: 150,
      }),
      expect.objectContaining({ _id: atStart, at: 100 }),
    ]);
    expect(result.page[0]).not.toHaveProperty("activityType");
  });

  it("supports omitted, single-kind, and multi-kind filters", async () => {
    const { dogId, owner, ownerId, t } = await setup();
    await insertEvents(t, dogId, ownerId, [
      { kind: "pee", at: 100 },
      { kind: "meal", at: 200 },
      { kind: "note", at: 300 },
    ]);

    const all = await owner.query(timeline.list, listArgs(dogId));
    const pee = await owner.query(
      timeline.list,
      listArgs(dogId, { kinds: ["pee"] }),
    );
    const mixed = await owner.query(
      timeline.list,
      listArgs(dogId, { kinds: ["pee", "note"] }),
    );
    expect(all.page.map(({ kind }) => kind)).toEqual(["note", "meal", "pee"]);
    expect(pee.page.map(({ kind }) => kind)).toEqual(["pee"]);
    expect(mixed.page.map(({ kind }) => kind)).toEqual(["note", "pee"]);
  });

  it("paginates without duplicates in stable newest-first order", async () => {
    const { dogId, owner, ownerId, t } = await setup();
    const ids = await insertEvents(
      t,
      dogId,
      ownerId,
      Array.from({ length: 8 }, (_, index) => ({
        kind: "note" as const,
        at: index + 1,
      })),
    );
    const seen: Id<"events">[] = [];
    let cursor: string | null = null;
    let done = false;
    while (!done) {
      const result: PaginationResult<Doc<"events">> = await owner.query(
        timeline.list,
        listArgs(dogId, {
          paginationOpts: { numItems: 3, cursor },
        }),
      );
      seen.push(...result.page.map(({ _id }) => _id));
      cursor = result.continueCursor;
      done = result.isDone;
    }
    expect(seen).toEqual([...ids].reverse());
    expect(new Set(seen)).toHaveLength(ids.length);
  });

  it("rejects empty, duplicate, excessive, and unknown kind filters", async () => {
    const { dogId, owner } = await setup();
    for (const kinds of [[], ["pee", "pee"], [...eventKinds, "pee"]]) {
      await expect(
        owner.query(
          timeline.list,
          listArgs(dogId, { kinds: kinds as EventKind[] }),
        ),
      ).rejects.toThrow("INVALID_EVENT_KINDS");
    }
    await expect(
      owner.query(
        timeline.list,
        listArgs(dogId, { kinds: ["nap"] as unknown as EventKind[] }),
      ),
    ).rejects.toThrow();
  });

  it("enforces page sizes from 1 through 50", async () => {
    const { dogId, owner } = await setup();
    for (const numItems of [0, 1.5, 51, Number.POSITIVE_INFINITY]) {
      await expect(
        owner.query(
          timeline.list,
          listArgs(dogId, { paginationOpts: { numItems, cursor: null } }),
        ),
      ).rejects.toThrow("INVALID_PAGE_SIZE");
    }
    await expect(
      owner.query(
        timeline.list,
        listArgs(dogId, { paginationOpts: { numItems: 1, cursor: null } }),
      ),
    ).resolves.toEqual(expect.objectContaining({ page: [] }));
    await expect(
      owner.query(
        timeline.list,
        listArgs(dogId, { paginationOpts: { numItems: 50, cursor: null } }),
      ),
    ).resolves.toEqual(expect.objectContaining({ page: [] }));
  });

  it("caps filtered scans even when callers request a larger row budget", async () => {
    const { dogId, owner, ownerId, t } = await setup();
    await insertEvents(t, dogId, ownerId, [
      { kind: "note", at: 1, note: "old match" },
      ...Array.from({ length: 550 }, (_, index) => ({
        kind: "pee" as const,
        at: index + 2,
      })),
    ]);

    const first = await owner.query(
      timeline.list,
      listArgs(dogId, {
        kinds: ["note"],
        paginationOpts: {
          numItems: 1,
          cursor: null,
          maximumRowsRead: 10_000,
        },
      }),
    );
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);

    const second = await owner.query(
      timeline.list,
      listArgs(dogId, {
        kinds: ["note"],
        paginationOpts: { numItems: 1, cursor: first.continueCursor },
      }),
    );
    expect(second.page).toEqual([
      expect.objectContaining({ kind: "note", note: "old match" }),
    ]);
  });
});
