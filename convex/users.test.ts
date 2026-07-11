/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

test("rejects signed-out access to the current user", async () => {
  const t = convexTest(schema, modules);

  await expect(t.query(api.users.current)).rejects.toThrow("UNAUTHENTICATED");
});

test("resolves the signed-in user from the auth identity", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(({ db }) =>
    db.insert("users", { email: "zoe@example.com" }),
  );
  const sessionId = await t.run(({ db }) =>
    db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    }),
  );

  await expect(
    t
      .withIdentity({ subject: `${userId}|${sessionId}` })
      .query(api.users.current),
  ).resolves.toMatchObject({ _id: userId, email: "zoe@example.com" });
});
