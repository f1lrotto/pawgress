import { TZDateMini, tzOffset } from "@date-fns/tz";
import { subDays } from "date-fns";

const localPattern = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const offsetProbeDays = [-2, -1, 0, 1, 2];
const pad = (value: number) => String(value).padStart(2, "0");
const dayKey = (date: Date) => {
  const year = date.getFullYear();
  return year < 1 || year > 9999
    ? null
    : `${String(year).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const inTimezone = (value: number, timezone: string) => {
  if (
    typeof timezone !== "string" ||
    timezone.length === 0 ||
    /^[+-]/.test(timezone)
  ) {
    return null;
  }
  const date = new TZDateMini(value, timezone);
  return Number.isFinite(date.getTime()) ? date : null;
};

const offsetsNear = (wallTime: number, timezone: string) =>
  new Set(
    offsetProbeDays.map((days) =>
      tzOffset(timezone, new Date(wallTime + days * 86_400_000)),
    ),
  );

const parseDay = (value: string) => {
  const match = dayPattern.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const expected = [Number(yearText), Number(monthText), Number(dayText)];
  if (expected[0] < 1 || expected[0] > 9999) return null;
  const date = new Date(0);
  date.setUTCFullYear(expected[0], expected[1] - 1, expected[2]);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === expected[0] &&
    date.getUTCMonth() + 1 === expected[1] &&
    date.getUTCDate() === expected[2]
    ? date
    : null;
};

const utcDayKey = (date: Date) => {
  const year = date.getUTCFullYear();
  return year < 1 || year > 9999
    ? null
    : `${String(year).padStart(4, "0")}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const zonedDayBoundary = (date: Date, timezone: string) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const wallTime = date.getTime();
  let earliest: number | null = null;
  let exact: number | null = null;
  for (const offset of offsetsNear(wallTime, timezone)) {
    const candidate = wallTime - offset * 60_000;
    const zoned = inTimezone(candidate, timezone);
    if (
      !zoned ||
      zoned.getFullYear() !== year ||
      zoned.getMonth() !== month ||
      zoned.getDate() !== day
    ) {
      continue;
    }
    if (earliest === null || candidate < earliest) earliest = candidate;
    if (
      zoned.getHours() === 0 &&
      zoned.getMinutes() === 0 &&
      zoned.getSeconds() === 0 &&
      zoned.getMilliseconds() === 0 &&
      (exact === null || candidate < exact)
    ) {
      exact = candidate;
    }
  }
  return exact ?? earliest;
};

export const formatZonedDateTimeLocal = (
  epoch: number | null,
  timezone: string,
) => {
  if (epoch === null || !Number.isFinite(epoch)) return null;
  const date = inTimezone(epoch, timezone);
  if (!date) return null;
  const year = date.getFullYear();
  if (year < 1 || year > 9999) return null;

  return `${String(year).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const getZonedDayKeys = (epoch: number, timezone: string) => {
  if (!Number.isFinite(epoch)) return null;
  const today = inTimezone(epoch, timezone);
  if (!today) return null;
  const yesterday = subDays(today, 1);
  const todayKey = dayKey(today);
  const yesterdayKey = dayKey(yesterday);
  return todayKey && yesterdayKey
    ? { today: todayKey, yesterday: yesterdayKey }
    : null;
};

export const getZonedDayWindow = (date: string, timezone: string) => {
  const startDate = parseDay(date);
  if (!startDate || !inTimezone(0, timezone)) return null;
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const startAt = zonedDayBoundary(startDate, timezone);
  const endAt = zonedDayBoundary(endDate, timezone);
  return startAt !== null && endAt !== null && endAt > startAt
    ? { date, startAt, endAt }
    : null;
};

export const getRecentZonedDayWindows = (
  now: number,
  timezone: string,
  count: number,
) => {
  if (
    !Number.isFinite(now) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 366
  ) {
    return [];
  }
  const today = inTimezone(now, timezone);
  if (!today) return [];
  const current = new Date(0);
  current.setUTCFullYear(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - count + 1,
  );
  current.setUTCHours(0, 0, 0, 0);
  let startAt = zonedDayBoundary(current, timezone);
  if (startAt === null) return [];

  const windows: Array<{ date: string; startAt: number; endAt: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const date = utcDayKey(current);
    if (!date) return [];
    const next = new Date(current);
    next.setUTCDate(next.getUTCDate() + 1);
    const endAt = zonedDayBoundary(next, timezone);
    if (endAt === null || endAt <= startAt) return [];
    windows.push({ date, startAt, endAt });
    current.setTime(next.getTime());
    startAt = endAt;
  }
  return windows;
};

export const parseZonedDateTimeLocal = (
  value: string | null,
  timezone: string,
) => {
  if (value === null || !inTimezone(0, timezone)) return null;
  const match = localPattern.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const expected = [
    Number(yearText),
    Number(monthText),
    Number(dayText),
    Number(hourText),
    Number(minuteText),
  ] as const;
  if (expected[0] === 0) return null;

  const date = new Date(0);
  date.setUTCFullYear(expected[0], expected[1] - 1, expected[2]);
  date.setUTCHours(expected[3], expected[4], 0, 0);
  const actual = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
  if (
    actual.length !== expected.length ||
    !actual.every((part, index) => part === expected[index])
  )
    return null;

  const wallTime = date.getTime();
  const offsets = offsetsNear(wallTime, timezone);
  let earliest: number | null = null;
  for (const offset of offsets) {
    const candidate = wallTime - offset * 60_000;
    if (
      Number.isFinite(candidate) &&
      formatZonedDateTimeLocal(candidate, timezone) === value &&
      (earliest === null || candidate < earliest)
    ) {
      earliest = candidate;
    }
  }
  return earliest;
};
