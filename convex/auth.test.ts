/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://convex.test";
});

test("signs up and signs in with the Password provider", async () => {
  const t = convexTest(schema, modules);
  const params = { email: "zoe@example.com", password: "puppy-pass" };

  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { ...params, flow: "signUp" },
    }),
  ).resolves.toMatchObject({ tokens: { token: expect.any(String) } });

  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { ...params, flow: "signIn" },
    }),
  ).resolves.toMatchObject({ tokens: { token: expect.any(String) } });

  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { ...params, password: "wrong-pass", flow: "signIn" },
    }),
  ).rejects.toThrow("InvalidSecret");

  await expect(
    t.run(async ({ db }) => ({
      users: await db.query("users").collect(),
      accounts: await db.query("authAccounts").collect(),
      sessions: await db.query("authSessions").collect(),
    })),
  ).resolves.toMatchObject({
    users: [{ email: params.email }],
    accounts: [{ provider: "password", providerAccountId: params.email }],
    sessions: [{}, {}],
  });
});

test("normalizes email addresses for sign-up and sign-in", async () => {
  const t = convexTest(schema, modules);
  const password = "puppy-pass";

  await t.action(api.auth.signIn, {
    provider: "password",
    params: { email: "  Zoe@Example.COM  ", password, flow: "signUp" },
  });

  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { email: "  ZOE@EXAMPLE.COM  ", password, flow: "signIn" },
    }),
  ).resolves.toMatchObject({ tokens: { token: expect.any(String) } });

  await expect(
    t.run(async ({ db }) => ({
      users: await db.query("users").collect(),
      accounts: await db.query("authAccounts").collect(),
    })),
  ).resolves.toMatchObject({
    users: [{ email: "zoe@example.com" }],
    accounts: [{ providerAccountId: "zoe@example.com" }],
  });
});

test.each(["not-an-email", "zoe@example", "zoe @example.com"])(
  "rejects malformed email address %s",
  async (email) => {
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { email, password: "puppy-pass", flow: "signUp" },
      }),
    ).rejects.toThrow("INVALID_EMAIL");
  },
);
