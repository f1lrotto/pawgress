import { TZDateMini } from "@date-fns/tz";

export type PottyEvent = {
  kind: "pee" | "poop";
  at: number;
  peePlace?: "inside" | "outside";
};
export type WalkEvent = { at: number; endedAt?: number };
export type RestEvent = { kind: "wake" | "sleep"; at: number };
export type InsightDay = { date: string; startAt: number; endAt: number };

const zonedHour = (at: number, timezone: string) => {
  if (!timezone || /^[+-]/.test(timezone)) throw new RangeError("Invalid zone");
  const hour = new TZDateMini(at, timezone).getHours();
  if (!Number.isInteger(hour)) throw new RangeError("Invalid zone");
  return hour;
};

export const bucketPottyByHour = (events: PottyEvent[], timezone: string) => {
  zonedHour(0, timezone);
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    peeInside: 0,
    peeOutside: 0,
    poop: 0,
  }));
  for (const event of events) {
    const bucket = buckets[zonedHour(event.at, timezone)];
    if (event.kind === "poop") bucket.poop += 1;
    else if (event.peePlace === "inside") bucket.peeInside += 1;
    else if (event.peePlace === "outside") bucket.peeOutside += 1;
  }
  return buckets;
};

export const buildWalkIntervals = (
  walks: WalkEvent[],
  meals: Array<{ at: number }>,
) => {
  const completed = walks
    .filter((walk): walk is Required<WalkEvent> => walk.endedAt !== undefined)
    .sort((left, right) => left.at - right.at);
  const mealAts = meals.map(({ at }) => at).sort((left, right) => left - right);
  let mealIndex = 0;

  return completed.slice(1).flatMap((to, index) => {
    const from = completed[index];
    if (from.endedAt > to.at) return [];
    while (mealIndex < mealAts.length && mealAts[mealIndex] < from.endedAt) {
      mealIndex += 1;
    }
    const between = [];
    while (mealIndex < mealAts.length && mealAts[mealIndex] < to.at) {
      between.push(mealAts[mealIndex]);
      mealIndex += 1;
    }
    return [
      {
        fromWalkAt: from.at,
        fromWalkEndedAt: from.endedAt,
        toWalkAt: to.at,
        intervalMs: to.at - from.endedAt,
        mealAts: between,
      },
    ];
  });
};

export const sumSleepByDay = (
  events: RestEvent[],
  days: InsightDay[],
  seed: RestEvent | null,
) => {
  const totals = days.map(({ date }) => ({ date, sleepMs: 0 }));
  if (days.length === 0) return totals;
  const rangeStart = days[0].startAt;
  const rangeEnd = days.at(-1)!.endAt;
  let asleep = seed?.kind === "sleep";
  let sleepStartedAt = asleep ? rangeStart : null;
  const addSleep = (startAt: number, endAt: number) => {
    days.forEach((day, index) => {
      totals[index].sleepMs += Math.max(
        0,
        Math.min(endAt, day.endAt) - Math.max(startAt, day.startAt),
      );
    });
  };

  for (const event of [...events].sort((left, right) => left.at - right.at)) {
    if (event.at < rangeStart || event.at >= rangeEnd) continue;
    if (event.kind === "sleep" && !asleep) {
      asleep = true;
      sleepStartedAt = event.at;
    } else if (event.kind === "wake" && asleep) {
      addSleep(sleepStartedAt ?? rangeStart, event.at);
      asleep = false;
      sleepStartedAt = null;
    }
  }
  if (asleep) addSleep(sleepStartedAt ?? rangeStart, rangeEnd);
  return totals;
};
