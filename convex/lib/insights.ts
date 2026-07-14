export type PottyEvent = {
  kind: "pee" | "poop";
  at: number;
  peePlace?: "inside" | "outside";
};
export type OutingKind = "walk" | "pee" | "poop";
export type OutingEvent = {
  at: number;
  endedAt: number;
  kind: OutingKind;
};
export type RestEvent = { kind: "wake" | "sleep"; at: number };
export type InsightDay = { date: string; startAt: number; endAt: number };

const outingMergeMs = 10 * 60 * 1_000;

const zonedHour = (timezone: string) => {
  if (!timezone || /^[+-]/.test(timezone)) throw new RangeError("Invalid zone");
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: timezone,
  });
  return (at: number) => {
    const hour = Number(formatter.format(at));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new RangeError("Invalid zone");
    }
    return hour;
  };
};

export const bucketPottyByHour = (events: PottyEvent[], timezone: string) => {
  const hourAt = zonedHour(timezone);
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    peeInside: 0,
    peeOutside: 0,
    poop: 0,
  }));
  for (const event of events) {
    const bucket = buckets[hourAt(event.at)];
    if (event.kind === "poop") bucket.poop += 1;
    else if (event.peePlace === "inside") bucket.peeInside += 1;
    else if (event.peePlace === "outside") bucket.peeOutside += 1;
  }
  return buckets;
};

export const buildOutingIntervals = (
  outings: OutingEvent[],
  meals: Array<{ at: number }>,
) => {
  const merged = [...outings]
    .sort((left, right) => left.at - right.at)
    .reduce<Array<Omit<OutingEvent, "kind"> & { kinds: OutingKind[] }>>(
      (result, outing) => {
        const previous = result.at(-1);
        if (!previous || outing.at > previous.endedAt + outingMergeMs) {
          result.push({
            at: outing.at,
            endedAt: outing.endedAt,
            kinds: [outing.kind],
          });
          return result;
        }
        result[result.length - 1] = {
          ...previous,
          endedAt: Math.max(previous.endedAt, outing.endedAt),
          kinds: [...new Set([...previous.kinds, outing.kind])],
        };
        return result;
      },
      [],
    );
  const mealAts = meals.map(({ at }) => at).sort((left, right) => left - right);
  let mealIndex = 0;

  return merged.slice(1).map((to, index) => {
    const from = merged[index];
    while (mealIndex < mealAts.length && mealAts[mealIndex] < from.endedAt) {
      mealIndex += 1;
    }
    const between = [];
    while (mealIndex < mealAts.length && mealAts[mealIndex] < to.at) {
      between.push(mealAts[mealIndex]);
      mealIndex += 1;
    }
    return {
      fromWalkAt: from.at,
      fromWalkEndedAt: from.endedAt,
      toWalkAt: to.at,
      toKinds: to.kinds,
      intervalMs: to.at - from.endedAt,
      mealAts: between,
    };
  });
};

export const sumSleepByDay = (
  events: RestEvent[],
  days: InsightDay[],
  seed: RestEvent | null,
  now: number,
) => {
  const totals = days.map(({ date }) => ({ date, sleepMs: 0 }));
  if (days.length === 0) return totals;
  const rangeStart = days[0].startAt;
  const rangeEnd = Math.min(now, days.at(-1)!.endAt);
  if (rangeEnd <= rangeStart) return totals;
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
