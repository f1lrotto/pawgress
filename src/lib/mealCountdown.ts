import { TZDateMini } from "@date-fns/tz";
import { addDays } from "date-fns";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const getNextMealCountdown = (
  now: number,
  timezone: string,
  routines: readonly { label: string; timeOfDay: string }[],
) => {
  if (!Number.isFinite(now) || !timezone || !Array.isArray(routines)) {
    return null;
  }
  const zonedNow = new TZDateMini(now, timezone);
  if (!Number.isFinite(zonedNow.getTime())) return null;
  const days = [zonedNow, addDays(zonedNow, 1)];
  const candidates = routines.flatMap((routine, index) => {
    if (
      typeof routine?.label !== "string" ||
      typeof routine.timeOfDay !== "string"
    ) {
      return [];
    }
    const label = routine.label.trim();
    const match = timePattern.exec(routine.timeOfDay);
    if (!label || !match) return [];
    const [, hours, minutes] = match;

    return days.flatMap((day) => {
      const at = new TZDateMini(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        Number(hours),
        Number(minutes),
        0,
        0,
        timezone,
      ).getTime();
      return at >= now
        ? [{ label, timeOfDay: routine.timeOfDay, at, index }]
        : [];
    });
  });
  const next = candidates.sort((a, b) => a.at - b.at || a.index - b.index)[0];

  return next
    ? {
        label: next.label,
        timeOfDay: next.timeOfDay,
        at: next.at,
        countdownMs: next.at - now,
      }
    : null;
};
