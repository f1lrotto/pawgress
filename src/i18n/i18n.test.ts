import { afterEach, describe, expect, it, vi } from "vitest";

import i18n, { setLocale } from ".";
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatPlural,
} from "./format";
import { resolveBrowserLocale } from "./locale";
import { resources } from "./resources";

const catalogEntries = (catalog: object) => {
  const pending: [string, unknown][] = Object.entries(catalog);
  const entries: [string, string][] = [];

  while (pending.length) {
    const [key, value] = pending.pop()!;
    if (typeof value === "string") entries.push([key, value]);
    else if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      pending.push(
        ...Object.entries(value).map(
          ([childKey, childValue]) =>
            [`${key}.${childKey}`, childValue] as [string, unknown],
        ),
      );
    } else throw new TypeError(`Catalog value at ${key} is not a string`);
  }

  return entries.sort(([left], [right]) => left.localeCompare(right));
};

afterEach(async () => {
  vi.restoreAllMocks();
  await setLocale("en");
});

describe("catalogs", () => {
  it("rejects every non-string catalog leaf", () => {
    expect(() => catalogEntries({ invalid: 1 })).toThrow(
      "Catalog value at invalid is not a string",
    );
    expect(() => catalogEntries({ invalid: null })).toThrow(
      "Catalog value at invalid is not a string",
    );
    expect(() => catalogEntries({ invalid: [] })).toThrow(
      "Catalog value at invalid is not a string",
    );
  });

  it.each(["app", "common"] as const)(
    "keeps identical non-empty owned %s keys",
    (namespace) => {
      const english = catalogEntries(resources.en[namespace]);
      const slovak = catalogEntries(resources.sk[namespace]);

      expect(slovak.map(([key]) => key)).toEqual(english.map(([key]) => key));
      expect(english.length).toBeGreaterThan(0);
      expect([...english, ...slovak].every(([, value]) => value.trim())).toBe(
        true,
      );
    },
  );

  it("keeps identical non-empty English and Slovak keys", () => {
    const english = catalogEntries(resources.en);
    const slovak = catalogEntries(resources.sk);

    expect(slovak.map(([key]) => key)).toEqual(english.map(([key]) => key));
    expect(english.length).toBeGreaterThan(0);
    expect([...english, ...slovak].every(([, value]) => value.trim())).toBe(
      true,
    );
  });
});

describe("locale resolution", () => {
  it("uses exact and regional supported browser languages in order", () => {
    expect(resolveBrowserLocale(["sk"])).toBe("sk");
    expect(resolveBrowserLocale(["de-DE", "sk-SK", "en-US"])).toBe("sk");
    expect(resolveBrowserLocale(["EN-gb"])).toBe("en");
  });

  it("falls back to English", () => {
    expect(resolveBrowserLocale([])).toBe("en");
    expect(resolveBrowserLocale(["de-DE", "not_a_locale"])).toBe("en");
  });

  it("uses navigator.language when navigator.languages is empty", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("sk-SK");

    expect(resolveBrowserLocale()).toBe("sk");
  });
});

describe("i18n initialization", () => {
  it("keeps the document language synchronized", async () => {
    await setLocale("sk");
    expect(i18n.resolvedLanguage).toBe("sk");
    expect(document.documentElement.lang).toBe("sk");

    await setLocale("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("translates the walk prompt and reconstruction controls", async () => {
    await setLocale("en");
    expect(i18n.t("walkPrompt.title", { ns: "dashboard" })).toBe(
      "Are you on a walk?",
    );
    expect(i18n.t("backdate.reconstruct", { ns: "dashboard" })).toBe(
      "This happened during a walk",
    );

    await setLocale("sk");
    expect(i18n.t("walkPrompt.title", { ns: "dashboard" })).toBe(
      "Ste na prechádzke?",
    );
    expect(i18n.t("backdate.reconstruct", { ns: "dashboard" })).toBe(
      "Stalo sa to počas prechádzky",
    );
  });
});

describe("localized formatting", () => {
  it("formats English and Slovak numbers", () => {
    expect(formatNumber(12_345.6, "en")).toBe("12,345.6");
    expect(formatNumber(12_345.6, "sk")).toBe("12\u00a0345,6");
  });

  it("formats in the dog timezone without changing the timestamp", () => {
    const timestamp = Date.UTC(2026, 0, 1, 23, 30);
    const date = new Date(timestamp);

    expect(formatDate(date, "en", "Europe/Bratislava")).toBe("Jan 2, 2026");
    expect(formatDate(date, "sk", "Europe/Bratislava")).toBe("2. 1. 2026");
    expect(formatDate(date, "en", "UTC")).toBe("Jan 1, 2026");
    expect(date.getTime()).toBe(timestamp);
  });

  it("formats compact English and Slovak durations", () => {
    expect(formatDuration(5_000, "en")).toBe("5s");
    expect(formatDuration(5_000, "sk")).toBe("5 s");
    expect(formatDuration((2 * 60 + 4) * 60_000, "en")).toBe("2h 4m");
    expect(formatDuration((2 * 60 + 4) * 60_000, "sk")).toBe("2 h 4 min");
  });

  it("uses English and Slovak plural rules", () => {
    const english = { one: "day", other: "days" };
    const slovak = { one: "deň", few: "dni", other: "dní" };

    expect(formatPlural(1, "en", english)).toBe("1 day");
    expect(formatPlural(2, "en", english)).toBe("2 days");
    expect(formatPlural(1, "sk", slovak)).toBe("1 deň");
    expect(formatPlural(2, "sk", slovak)).toBe("2 dni");
    expect(formatPlural(4, "sk", slovak)).toBe("4 dni");
    expect(formatPlural(5, "sk", slovak)).toBe("5 dní");
  });
});
