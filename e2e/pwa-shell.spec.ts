import { expect, test } from "@playwright/test";

type PwaNavigator = Navigator & {
  serviceWorker: {
    controller?: { scriptURL: string } | null;
    ready: Promise<{
      active?: {
        addEventListener: (
          type: "statechange",
          listener: () => void,
          options: { once: true },
        ) => void;
        state: string;
      } | null;
    }>;
  };
};

test.skip(
  process.env.PLAYWRIGHT_PWA !== "true",
  "The service worker is available only in a production preview.",
);

test("the production shell installs and reconnects truthfully", async ({
  context,
  page,
}) => {
  await page.goto("/login");

  const manifest = await page.evaluate(() =>
    fetch("/manifest.webmanifest").then(
      (response) =>
        response.json() as Promise<{
          display: string;
          icons: Array<{ purpose?: string }>;
          name: string;
          start_url: string;
        }>,
    ),
  );
  expect(manifest).toMatchObject({
    display: "standalone",
    name: "Pawgress",
    start_url: "/",
  });
  expect(manifest.icons.some(({ purpose }) => purpose === "maskable")).toBe(
    true,
  );

  expect(
    await page.evaluate(async () => {
      const { serviceWorker } = navigator as PwaNavigator;
      const registration = await serviceWorker.ready;
      if (registration.active?.state !== "activated") {
        await new Promise<void>((resolve) =>
          registration.active?.addEventListener(
            "statechange",
            () => resolve(),
            {
              once: true,
            },
          ),
        );
      }
      return registration.active?.state;
    }),
  ).toBe("activated");

  await page.reload();
  expect(
    await page.evaluate(
      () => (navigator as PwaNavigator).serviceWorker.controller?.scriptURL,
    ),
  ).toContain("/sw.js");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "You're offline. Live notebook updates need a connection. Reconnecting…",
  );
  await expect(
    page.getByRole("heading", { name: "Keep their day close at hand." }),
  ).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("You're offline.")).toHaveCount(0);
});
