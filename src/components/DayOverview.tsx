import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatNumber } from "@/i18n/format";
import { resolveBrowserLocale } from "@/i18n/locale";
import type { ActivityVisualKind } from "@/lib/activityVisuals";
import { formatElapsed, getElapsedMs } from "@/lib/timers";
import {
  formatZonedDateTimeLocal,
  parseZonedDateTimeLocal,
} from "@/lib/zonedDateTime";

export type DayOverviewItem = {
  id: string;
  at: number;
  endedAt?: number;
  kind: ActivityVisualKind;
  label: string;
  detail?: string;
};

type DurationSegment = {
  endAt: number;
  id: string;
  kind: "sleep" | "walk";
  label: string;
  startAt: number;
};

type PointGroup = {
  at: number;
  items: DayOverviewItem[];
  lane: 0 | 1;
};

const clusterWindowMs = 90 * 60_000;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const pointGroups = (items: DayOverviewItem[]) => {
  const groups: PointGroup[] = [];
  for (let index = 0; index < items.length;) {
    let end = index + 1;
    while (
      end < items.length &&
      items[end]!.at - items[index]!.at <= clusterWindowMs
    ) {
      end += 1;
    }
    const nearby = items.slice(index, end);
    if (nearby.length >= 3) {
      groups.push({
        at: nearby.reduce((total, item) => total + item.at, 0) / nearby.length,
        items: nearby,
        lane: 0,
      });
      index = end;
      continue;
    }
    for (const item of nearby) {
      const previous = groups.at(-1);
      groups.push({
        at: item.at,
        items: [item],
        lane:
          previous && item.at - previous.at < clusterWindowMs
            ? previous.lane === 0
              ? 1
              : 0
            : 0,
      });
    }
    index = end;
  }
  return groups;
};

const buildDurations = (
  items: DayOverviewItem[],
  startAt: number,
  endAt: number,
  now: number,
  sleepLabel: string,
) => {
  const limit = Math.min(now, endAt);
  const segments: DurationSegment[] = [];
  let sleep: DayOverviewItem | null = null;

  for (const item of [...items].sort((left, right) => left.at - right.at)) {
    if (item.kind === "sleep") {
      sleep = item;
      continue;
    }
    if (item.kind === "wake" && sleep && item.at > sleep.at) {
      const clippedStart = Math.max(sleep.at, startAt);
      const clippedEnd = Math.min(item.at, limit);
      if (clippedEnd > clippedStart) {
        segments.push({
          endAt: clippedEnd,
          id: `sleep-${sleep.id}`,
          kind: "sleep",
          label: sleepLabel,
          startAt: clippedStart,
        });
      }
      sleep = null;
    }
  }

  if (sleep) {
    const clippedStart = Math.max(sleep.at, startAt);
    if (limit > clippedStart) {
      segments.push({
        endAt: limit,
        id: `sleep-${sleep.id}`,
        kind: "sleep",
        label: sleepLabel,
        startAt: clippedStart,
      });
    }
  }

  for (const walk of items.filter(({ kind }) => kind === "walk")) {
    const clippedStart = Math.max(walk.at, startAt);
    const clippedEnd = Math.min(walk.endedAt ?? limit, limit);
    if (clippedEnd > clippedStart) {
      segments.push({
        endAt: clippedEnd,
        id: `walk-${walk.id}`,
        kind: "walk",
        label: walk.label,
        startAt: clippedStart,
      });
    }
  }

  return segments.sort((left, right) => left.startAt - right.startAt);
};

const dayPosition = (at: number, startAt: number, endAt: number) =>
  clamp(((at - startAt) / (endAt - startAt)) * 100, 0, 100);

const markerAlignment = (position: number) =>
  position < 8 ? "start" : position > 92 ? "end" : "center";

const markerTransform = {
  center: "-translate-x-1/2",
  end: "-translate-x-full",
  start: "",
} as const;

const tooltipPosition = {
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
  start: "left-0",
} as const;

function DayOverview({
  endAt,
  items,
  now,
  startAt,
  timezone,
}: {
  endAt: number;
  items: DayOverviewItem[] | undefined;
  now: number;
  startAt: number;
  timezone: string;
}) {
  const { i18n, t } = useTranslation("dashboard");
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const activePointRef = useRef<HTMLButtonElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const positionedDayRef = useRef<number | null>(null);
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        timeZone: timezone,
      }),
    [locale, timezone],
  );
  const todayItems = useMemo(
    () =>
      (items ?? [])
        .filter(({ at }) => at >= startAt && at < endAt)
        .sort((left, right) => left.at - right.at),
    [endAt, items, startAt],
  );
  const durations = useMemo(
    () =>
      buildDurations(
        items ?? [],
        startAt,
        endAt,
        now,
        t("dayOverview.legend.sleep"),
      ),
    [endAt, items, now, startAt, t],
  );
  const points = useMemo(
    () =>
      pointGroups(
        todayItems.filter(
          ({ kind }) => kind !== "sleep" && kind !== "wake" && kind !== "walk",
        ),
      ),
    [todayItems],
  );
  const activityCount = todayItems.length;
  const formattedCount = formatNumber(activityCount, locale);
  const nowPosition = dayPosition(Math.min(now, endAt), startAt, endAt);
  const hourTicks = useMemo(() => {
    const date = formatZonedDateTimeLocal(startAt, timezone)?.slice(0, 10);
    if (!date) return [];
    return Array.from({ length: 25 }, (_, hour) => {
      const at =
        hour === 24
          ? endAt
          : parseZonedDateTimeLocal(
              `${date}T${String(hour).padStart(2, "0")}:00`,
              timezone,
            );
      return at === null
        ? null
        : {
            hour,
            label: String(hour).padStart(2, "0"),
            position: dayPosition(at, startAt, endAt),
          };
    }).filter((tick) => tick !== null);
  }, [endAt, startAt, timezone]);
  useEffect(() => {
    const scroller = mobileScrollRef.current;
    if (!scroller || positionedDayRef.current === startAt) return;
    const positionNow = () => {
      if (
        scroller.clientWidth === 0 ||
        scroller.scrollWidth < scroller.clientWidth * 2
      ) {
        return;
      }
      scroller.scrollLeft = clamp(
        (scroller.scrollWidth * nowPosition) / 100 - scroller.clientWidth * 0.8,
        0,
        scroller.scrollWidth - scroller.clientWidth,
      );
      positionedDayRef.current = startAt;
    };
    positionNow();
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(positionNow);
    });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(positionNow);
    observer?.observe(scroller);
    if (scroller.firstElementChild) {
      observer?.observe(scroller.firstElementChild);
    }
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      observer?.disconnect();
    };
  }, [activityCount, nowPosition, startAt]);
  useEffect(() => {
    if (!activePointId) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        activePointRef.current?.contains(event.target)
      ) {
        return;
      }
      setActivePointId(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [activePointId]);
  const restMs = durations
    .filter(({ kind }) => kind === "sleep")
    .reduce(
      (total, segment) => total + getElapsedMs(segment.startAt, segment.endAt),
      0,
    );
  const walkMs = durations
    .filter(({ kind }) => kind === "walk")
    .reduce(
      (total, segment) => total + getElapsedMs(segment.startAt, segment.endAt),
      0,
    );
  const summary = [
    restMs > 0
      ? t("dayOverview.summary.rest", {
          duration: formatElapsed(restMs, locale),
        })
      : null,
    walkMs > 0
      ? t("dayOverview.summary.walk", {
          duration: formatElapsed(walkMs, locale),
        })
      : null,
    t("dayOverview.summary.activities", {
      count: activityCount,
      formattedCount,
    }),
  ].filter(Boolean);
  const activityCountLabel = t("dayOverview.activityCount", {
    count: activityCount,
    formattedCount,
  });
  const itemAria = (item: DayOverviewItem) =>
    t("dayOverview.eventAria", {
      detail: item.detail ? ` · ${item.detail}` : "",
      label: item.label,
      time: timeFormatter.format(item.at),
    });

  return (
    <section aria-labelledby="day-overview-title" className="pb-6">
      <div className="rounded-xl bg-muted px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2
            id="day-overview-title"
            className="text-balance text-xl font-bold leading-[1.625rem]"
          >
            {t("dayOverview.title")}
          </h2>
          <p className="text-sm font-medium leading-5 text-muted-foreground">
            {items === undefined
              ? t("dayOverview.loading")
              : `${activityCountLabel} · ${t("dayOverview.updated", {
                  time: timeFormatter.format(now),
                })}`}
          </p>
        </div>

        {items === undefined ? (
          <div className="mt-4" aria-busy="true">
            <p role="status" className="sr-only">
              {t("dayOverview.loading")}
            </p>
            <div
              aria-hidden="true"
              className="h-32 animate-pulse rounded-lg bg-card motion-reduce:animate-none"
            />
          </div>
        ) : activityCount === 0 && durations.length === 0 ? (
          <p className="mt-4 border-y border-border py-8 text-center text-sm leading-5 text-muted-foreground">
            {t("dayOverview.empty")}
          </p>
        ) : (
          <>
            <div>
              <div
                aria-label={t("dayOverview.legend.aria")}
                className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-xs font-semibold leading-4 text-muted-foreground sm:gap-x-4"
              >
                <span className="inline-flex items-center gap-2">
                  <i
                    aria-hidden="true"
                    data-activity-kind="sleep"
                    className="h-2 w-5 rounded-sm bg-[var(--activity-ink)]"
                  />
                  {t("dayOverview.legend.sleep")}
                </span>
                <span className="inline-flex items-center gap-2">
                  <i
                    aria-hidden="true"
                    data-activity-kind="walk"
                    className="h-2 w-5 rounded-sm bg-[var(--activity-ink)]"
                  />
                  {t("dayOverview.legend.walk")}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="flex gap-1">
                    {["pee", "meal", "play"].map((kind) => (
                      <i
                        key={kind}
                        data-activity-kind={kind}
                        className="size-2 rounded-full bg-[var(--activity-ink)]"
                      />
                    ))}
                  </span>
                  {t("dayOverview.legend.events")}
                </span>
              </div>
              <p className="mt-2 text-xs font-medium leading-4 text-muted-foreground sm:hidden">
                {t("dayOverview.scrollHint")}
              </p>
              <div
                ref={mobileScrollRef}
                role="region"
                tabIndex={0}
                aria-label={t("dayOverview.scrollAria")}
                onScroll={() => setActivePointId(null)}
                className="mt-1 overflow-x-auto overscroll-x-contain pt-5 pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:mt-3 sm:overflow-visible sm:pt-0 sm:pb-0"
                data-day-scroll=""
              >
                <div className="w-[480%] sm:w-full" data-day-canvas="">
                  <div
                    role="group"
                    aria-label={t("dayOverview.ribbonAria")}
                    className="relative h-32 rounded-lg bg-card"
                    data-day-ribbon=""
                  >
                    <span
                      aria-hidden="true"
                      data-day-future=""
                      className="absolute inset-y-0 right-0 rounded-r-lg bg-secondary"
                      style={{ left: `${nowPosition}%` }}
                    />
                    {hourTicks.slice(1, -1).map(({ hour, position }) => (
                      <span
                        key={hour}
                        aria-hidden="true"
                        data-hour-guide={hour}
                        className={`absolute inset-y-0 w-px ${
                          hour % 6 === 0 ? "bg-border" : "bg-border/40"
                        }`}
                        style={{ left: `${position}%` }}
                      />
                    ))}
                    {durations.map((segment) => {
                      const left = dayPosition(segment.startAt, startAt, endAt);
                      const right = dayPosition(segment.endAt, startAt, endAt);
                      const ariaLabel = t("dayOverview.durationAria", {
                        duration: formatElapsed(
                          getElapsedMs(segment.startAt, segment.endAt),
                          locale,
                        ),
                        end: timeFormatter.format(segment.endAt),
                        label: segment.label,
                        start: timeFormatter.format(segment.startAt),
                      });
                      return (
                        <span
                          key={segment.id}
                          role="img"
                          aria-label={ariaLabel}
                          title={ariaLabel}
                          data-activity-kind={segment.kind}
                          className={`absolute h-5 min-w-1 rounded bg-[var(--activity-surface)] ring-1 ring-[var(--activity-ink)]/30 ${
                            segment.kind === "sleep" ? "top-3" : "top-10"
                          }`}
                          style={{
                            left: `${left}%`,
                            width: `${right - left}%`,
                          }}
                        />
                      );
                    })}
                    {points.map((group) => {
                      const pointId = group.items.map(({ id }) => id).join("-");
                      const isActive = activePointId === pointId;
                      const position = dayPosition(group.at, startAt, endAt);
                      const alignment = markerAlignment(position);
                      const label =
                        group.items.length === 1
                          ? itemAria(group.items[0]!)
                          : t("dayOverview.clusterAria", {
                              activities: t("dayOverview.activityCount", {
                                count: group.items.length,
                                formattedCount: formatNumber(
                                  group.items.length,
                                  locale,
                                ),
                              }),
                              end: timeFormatter.format(group.items.at(-1)!.at),
                              labels: group.items
                                .map(({ label }) => label)
                                .join(", "),
                              start: timeFormatter.format(group.items[0]!.at),
                            });
                      return (
                        <button
                          key={pointId}
                          ref={isActive ? activePointRef : undefined}
                          type="button"
                          aria-label={label}
                          aria-controls={`day-point-${pointId}`}
                          aria-expanded={isActive}
                          data-event-point=""
                          data-event-cluster={
                            group.items.length > 1 ? "" : undefined
                          }
                          onClick={() =>
                            setActivePointId((current) =>
                              current === pointId ? null : pointId,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setActivePointId(null);
                            }
                          }}
                          className={`group absolute flex h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 focus-visible:z-[var(--z-tooltip)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
                            isActive
                              ? "z-[var(--z-tooltip)]"
                              : "z-[var(--z-base)]"
                          } ${markerTransform[alignment]} ${
                            group.lane === 0 ? "top-[4.25rem]" : "top-[5.75rem]"
                          }`}
                          style={{ left: `${position}%` }}
                        >
                          {group.items.map((item) => (
                            <i
                              key={item.id}
                              aria-hidden="true"
                              data-activity-kind={item.kind}
                              className="size-3 rounded-full bg-[var(--activity-ink)] ring-2 ring-muted"
                            />
                          ))}
                          <span
                            id={`day-point-${pointId}`}
                            role="tooltip"
                            className={`pointer-events-none absolute bottom-full z-[var(--z-tooltip)] mb-1 w-max max-w-[26ch] rounded-md bg-primary px-2 py-1 text-xs font-semibold leading-4 text-primary-foreground transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none sm:top-full sm:bottom-auto sm:mt-1 sm:mb-0 ${
                              isActive ? "opacity-100" : "opacity-0"
                            } ${tooltipPosition[alignment]}`}
                          >
                            {label}
                          </span>
                        </button>
                      );
                    })}
                    <span
                      aria-hidden="true"
                      data-now-marker=""
                      className="absolute inset-y-0 z-[var(--z-base)] w-0.5 bg-primary"
                      style={{ left: `${nowPosition}%` }}
                    >
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold leading-4 text-primary">
                        {t("dayOverview.now")}
                      </span>
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="relative mt-2 h-4 text-xs font-medium leading-4 tabular-nums text-muted-foreground"
                  >
                    {hourTicks
                      .filter(({ hour }) => hour % 2 === 0)
                      .map(({ hour, label, position }) => (
                        <span
                          key={hour}
                          data-hour-label={hour}
                          className={`absolute ${
                            hour === 0
                              ? ""
                              : hour === 24
                                ? "-translate-x-full"
                                : "-translate-x-1/2"
                          }`}
                          style={{ left: `${position}%` }}
                        >
                          {label}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-3 text-sm font-medium leading-5 text-muted-foreground">
              {summary.join(" · ")}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export default DayOverview;
