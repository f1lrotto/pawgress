import { describe, expect, it } from "vitest";

import {
  formatZonedDateTimeLocal,
  getRecentZonedDayWindows,
  getZonedDayWindow,
  getZonedDayKeys,
  parseZonedDateTimeLocal,
} from "./zonedDateTime";

const utcEpoch = (year: number, month: number, day: number) => {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
};

describe("zoned datetime-local helpers", () => {
  it("formats summer and winter epochs in Europe/Bratislava", () => {
    expect(
      formatZonedDateTimeLocal(
        Date.parse("2026-07-09T05:30:00Z"),
        "Europe/Bratislava",
      ),
    ).toBe("2026-07-09T07:30");
    expect(
      formatZonedDateTimeLocal(
        Date.parse("2026-01-09T06:30:00Z"),
        "Europe/Bratislava",
      ),
    ).toBe("2026-01-09T07:30");
  });

  it("uses the requested timezone rather than the browser timezone", () => {
    expect(
      formatZonedDateTimeLocal(
        Date.parse("2026-07-09T00:00:00Z"),
        "Asia/Tokyo",
      ),
    ).toBe("2026-07-09T09:00");
    expect(parseZonedDateTimeLocal("2026-07-09T09:00", "Asia/Tokyo")).toBe(
      Date.parse("2026-07-09T00:00:00Z"),
    );
    expect(
      parseZonedDateTimeLocal("2026-07-09T07:30", "Europe/Bratislava"),
    ).toBe(Date.parse("2026-07-09T05:30:00Z"));
  });

  it("supports the first and last four-digit years", () => {
    const yearOne = new Date(0);
    yearOne.setUTCFullYear(1, 0, 1);
    yearOne.setUTCHours(0, 0, 0, 0);

    expect(parseZonedDateTimeLocal("0001-01-01T00:00", "UTC")).toBe(
      yearOne.getTime(),
    );
    expect(parseZonedDateTimeLocal("9999-12-31T23:59", "UTC")).toBe(
      Date.parse("9999-12-31T23:59:00Z"),
    );
    expect(parseZonedDateTimeLocal("0000-12-31T23:59", "UTC")).toBeNull();
  });

  it("round-trips a leap day and rejects impossible calendar dates", () => {
    const value = "2024-02-29T12:05";
    const epoch = parseZonedDateTimeLocal(value, "Europe/Bratislava");

    expect(epoch).toBe(Date.parse("2024-02-29T11:05:00Z"));
    expect(formatZonedDateTimeLocal(epoch, "Europe/Bratislava")).toBe(value);
    expect(
      parseZonedDateTimeLocal("2025-02-29T12:05", "Europe/Bratislava"),
    ).toBeNull();
    expect(
      parseZonedDateTimeLocal("2026-04-31T12:05", "Europe/Bratislava"),
    ).toBeNull();
  });

  it("rejects nonexistent spring-forward wall times", () => {
    expect(
      parseZonedDateTimeLocal("2026-03-29T02:30", "Europe/Bratislava"),
    ).toBeNull();
    expect(
      formatZonedDateTimeLocal(
        Date.parse("2026-03-29T01:30:00Z"),
        "Europe/Bratislava",
      ),
    ).toBe("2026-03-29T03:30");
  });

  it("chooses the first occurrence of an ambiguous fall-back wall time", () => {
    const value = "2026-10-25T02:30";

    expect(parseZonedDateTimeLocal(value, "Europe/Bratislava")).toBe(
      Date.parse("2026-10-25T00:30:00Z"),
    );
    expect(
      formatZonedDateTimeLocal(
        Date.parse("2026-10-25T00:30:00Z"),
        "Europe/Bratislava",
      ),
    ).toBe(value);
    expect(
      formatZonedDateTimeLocal(
        Date.parse("2026-10-25T01:30:00Z"),
        "Europe/Bratislava",
      ),
    ).toBe(value);
  });

  it("rejects null, malformed values, invalid timezones, and UTC offsets", () => {
    expect(formatZonedDateTimeLocal(null, "UTC")).toBeNull();
    expect(formatZonedDateTimeLocal(Number.NaN, "UTC")).toBeNull();
    expect(formatZonedDateTimeLocal(0, "Mars/Olympus")).toBeNull();
    expect(parseZonedDateTimeLocal(null, "UTC")).toBeNull();
    expect(parseZonedDateTimeLocal("2026-7-09T07:30", "UTC")).toBeNull();
    expect(parseZonedDateTimeLocal("2026-07-09 07:30", "UTC")).toBeNull();
    expect(parseZonedDateTimeLocal("2026-07-09T07:30:00", "UTC")).toBeNull();
    expect(parseZonedDateTimeLocal("2026-07-09T24:00", "UTC")).toBeNull();
    expect(parseZonedDateTimeLocal("2026-07-09T07:60", "UTC")).toBeNull();
    expect(
      parseZonedDateTimeLocal("2026-07-09T07:30", "Mars/Olympus"),
    ).toBeNull();
    expect(parseZonedDateTimeLocal("2026-07-09T07:30", "+02:00")).toBeNull();
  });
});

describe("getZonedDayKeys", () => {
  it("uses the supplied zone at a UTC/Bratislava day boundary", () => {
    const epoch = Date.parse("2026-01-01T23:30:00Z");

    expect(getZonedDayKeys(epoch, "UTC")).toEqual({
      today: "2026-01-01",
      yesterday: "2025-12-31",
    });
    expect(getZonedDayKeys(epoch, "Europe/Bratislava")).toEqual({
      today: "2026-01-02",
      yesterday: "2026-01-01",
    });
  });

  it("rolls January 1 back into the previous year", () => {
    expect(getZonedDayKeys(Date.parse("2026-01-01T12:00:00Z"), "UTC")).toEqual({
      today: "2026-01-01",
      yesterday: "2025-12-31",
    });
  });

  it("keeps leap day as March 1's calendar predecessor", () => {
    expect(getZonedDayKeys(Date.parse("2024-03-01T12:00:00Z"), "UTC")).toEqual({
      today: "2024-03-01",
      yesterday: "2024-02-29",
    });
  });

  it.each([
    ["spring-forward", "2026-03-29T12:00:00Z", "2026-03-29", "2026-03-28"],
    ["fall-back", "2026-10-25T12:00:00Z", "2026-10-25", "2026-10-24"],
  ])(
    "uses calendar subtraction across %s",
    (_label, instant, today, yesterday) => {
      expect(getZonedDayKeys(Date.parse(instant), "Europe/Bratislava")).toEqual(
        { today, yesterday },
      );
    },
  );

  it("rejects nonfinite epochs and invalid timezones", () => {
    expect(getZonedDayKeys(Number.NaN, "UTC")).toBeNull();
    expect(getZonedDayKeys(Number.POSITIVE_INFINITY, "UTC")).toBeNull();
    expect(getZonedDayKeys(0, "Mars/Olympus")).toBeNull();
    expect(getZonedDayKeys(0, "+02:00")).toBeNull();
  });
});

describe("zoned day windows", () => {
  it("returns end-exclusive UTC and local-midnight boundaries", () => {
    expect(getZonedDayWindow("2026-07-10", "UTC")).toEqual({
      date: "2026-07-10",
      startAt: Date.parse("2026-07-10T00:00:00Z"),
      endAt: Date.parse("2026-07-11T00:00:00Z"),
    });
    expect(getZonedDayWindow("2026-07-10", "Europe/Bratislava")).toEqual({
      date: "2026-07-10",
      startAt: Date.parse("2026-07-09T22:00:00Z"),
      endAt: Date.parse("2026-07-10T22:00:00Z"),
    });
  });

  it("rejects malformed or impossible dates and invalid zones", () => {
    for (const date of [
      "2026-7-10",
      "2026-02-29",
      "2026-04-31",
      "0000-12-31",
      "10000-01-01",
    ]) {
      expect(getZonedDayWindow(date, "UTC")).toBeNull();
    }
    expect(getZonedDayWindow("2026-07-10", "Mars/Olympus")).toBeNull();
    expect(getZonedDayWindow("2026-07-10", "+02:00")).toBeNull();
  });

  it("supports leap days and the first and last four-digit years", () => {
    expect(getZonedDayWindow("2024-02-29", "UTC")).toEqual({
      date: "2024-02-29",
      startAt: Date.parse("2024-02-29T00:00:00Z"),
      endAt: Date.parse("2024-03-01T00:00:00Z"),
    });
    expect(getZonedDayWindow("0001-01-01", "UTC")).toEqual({
      date: "0001-01-01",
      startAt: utcEpoch(1, 1, 1),
      endAt: utcEpoch(1, 1, 2),
    });
    expect(getZonedDayWindow("9999-12-31", "UTC")).toEqual({
      date: "9999-12-31",
      startAt: utcEpoch(9999, 12, 31),
      endAt: utcEpoch(10_000, 1, 1),
    });
  });

  it("uses 23-hour spring and 25-hour fall Bratislava days", () => {
    const spring = getZonedDayWindow("2026-03-29", "Europe/Bratislava");
    const fall = getZonedDayWindow("2026-10-25", "Europe/Bratislava");

    expect(spring).toEqual({
      date: "2026-03-29",
      startAt: Date.parse("2026-03-28T23:00:00Z"),
      endAt: Date.parse("2026-03-29T22:00:00Z"),
    });
    expect(fall).toEqual({
      date: "2026-10-25",
      startAt: Date.parse("2026-10-24T22:00:00Z"),
      endAt: Date.parse("2026-10-25T23:00:00Z"),
    });
    expect(spring!.endAt - spring!.startAt).toBe(23 * 60 * 60_000);
    expect(fall!.endAt - fall!.startAt).toBe(25 * 60 * 60_000);
  });

  it("builds adjacent recent windows oldest through today", () => {
    const windows = getRecentZonedDayWindows(
      Date.parse("2026-03-30T12:00:00Z"),
      "Europe/Bratislava",
      3,
    );

    expect(windows.map(({ date }) => date)).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
    ]);
    expect(windows).toHaveLength(3);
    expect(windows[0]!.endAt).toBe(windows[1]!.startAt);
    expect(windows[1]!.endAt).toBe(windows[2]!.startAt);
    expect(windows[2]!.endAt).toBe(Date.parse("2026-03-30T22:00:00Z"));

    expect(
      getRecentZonedDayWindows(
        Date.parse("2026-01-01T12:00:00Z"),
        "UTC",
        2,
      ).map(({ date }) => date),
    ).toEqual(["2025-12-31", "2026-01-01"]);
  });

  it("rejects invalid recent-window inputs", () => {
    for (const count of [0, -1, 1.5, 367, Number.NaN]) {
      expect(getRecentZonedDayWindows(0, "UTC", count)).toEqual([]);
    }
    expect(getRecentZonedDayWindows(Number.NaN, "UTC", 1)).toEqual([]);
    expect(
      getRecentZonedDayWindows(Number.POSITIVE_INFINITY, "UTC", 1),
    ).toEqual([]);
    expect(getRecentZonedDayWindows(0, "Mars/Olympus", 1)).toEqual([]);
    expect(getRecentZonedDayWindows(utcEpoch(1, 1, 1), "UTC", 2)).toEqual([]);
  });
});
