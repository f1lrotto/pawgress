import { formatDuration } from "../i18n/format";
import type { Locale } from "../i18n/locale";

export type TimerEvent = { at: number };

export const getElapsedMs = (startedAt: number, now: number) =>
  Math.max(0, now - startedAt);

export const formatElapsed = (durationMs: number, locale: Locale = "en") =>
  formatDuration(durationMs, locale);

export const deriveSleepState = (
  latestWake: TimerEvent | null | undefined,
  latestSleep: TimerEvent | null | undefined,
) => {
  if (!latestWake)
    return latestSleep
      ? { state: "asleep" as const, startedAt: latestSleep.at }
      : null;
  if (!latestSleep || latestWake.at > latestSleep.at)
    return { state: "awake" as const, startedAt: latestWake.at };
  return { state: "asleep" as const, startedAt: latestSleep.at };
};
