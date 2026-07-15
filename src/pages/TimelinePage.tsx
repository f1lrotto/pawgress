import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import AppFrame from "@/components/AppFrame";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { formatElapsed, getElapsedMs } from "@/lib/timers";
import { toTrainingRating, trainingRatings } from "@/lib/trainingRating";
import { EventEditor } from "@/pages/DashboardPage";
import { formatZonedDateTimeLocal, getZonedDayKeys } from "@/lib/zonedDateTime";

type TimelineDog = Pick<Doc<"dogs">, "_id" | "birthday" | "name" | "timezone">;
type TimelineEvent = FunctionReturnType<
  typeof api.timeline.list
>["page"][number];
type EventKind = TimelineEvent["kind"];
type TrainingSession = FunctionReturnType<
  typeof api.training.listTimeline
>["page"][number];
type TimelineKind = EventKind | "training";
type TrainingGroup = {
  at: number;
  commands: Array<{
    commandId: Id<"trainingCommands">;
    commandName: string;
    rating: number;
    sessionId: Id<"trainingSessions">;
  }>;
  id: Id<"trainingSessions">;
  notes?: string;
};
type TimelineItem =
  | { at: number; event: TimelineEvent; type: "event" }
  | { at: number; training: TrainingGroup; type: "training" };
type TimelineDay = {
  date: string;
  items: TimelineItem[];
  label: string;
};
type ActivityTypes = FunctionReturnType<typeof api.activityTypes.list>;
type ActivityTypesById = ReadonlyMap<
  Id<"activityTypes">,
  ActivityTypes[number]
>;

const filterOptions = [
  "pee",
  "poop",
  "meal",
  "water",
  "treat",
  "wake",
  "sleep",
  "walk",
  "play",
  "note",
  "training",
] as const satisfies ReadonlyArray<TimelineKind>;
const pageSize = 30;
const skeletonRows = [0, 1, 2] as const;

const eventTime = (at: number, timezone: string) =>
  formatZonedDateTimeLocal(at, timezone)?.slice(11) ?? "—";
const eventLabel = (
  event: TimelineEvent,
  activityTypesById: ActivityTypesById,
  kindLabel: (kind: EventKind) => string,
) => {
  if (event.kind !== "play" || event.activityTypeId === undefined) {
    return kindLabel(event.kind);
  }
  const activity = activityTypesById.get(event.activityTypeId);
  return activity
    ? [activity.emoji, activity.name].filter(Boolean).join(" ")
    : kindLabel("play");
};

const groupTrainingSessions = (sessions: TrainingSession[]) =>
  Array.from(
    sessions.reduce((groups, session) => {
      const key = `${session.at}:${session.notes ?? ""}`;
      const group = groups.get(key);
      if (group) {
        group.commands.push({
          commandId: session.commandId,
          commandName: session.commandName,
          rating: session.rating,
          sessionId: session._id,
        });
      } else {
        groups.set(key, {
          at: session.at,
          commands: [
            {
              commandId: session.commandId,
              commandName: session.commandName,
              rating: session.rating,
              sessionId: session._id,
            },
          ],
          id: session._id,
          notes: session.notes,
        });
      }
      return groups;
    }, new Map<string, TrainingGroup>()),
  ).map(([, group]) => group);

function TimelineRow({
  activityTypesById,
  dog,
  event,
  isEditing,
  onCancelEdit,
  onEdit,
  onSaved,
}: {
  activityTypesById: ActivityTypesById;
  dog: TimelineDog;
  event: TimelineEvent;
  isEditing: boolean;
  onCancelEdit: () => void;
  onEdit: () => void;
  onSaved: (label: string) => void;
}) {
  const { i18n, t } = useTranslation("timeline");
  const locale = i18n.resolvedLanguage as Locale;
  const kindLabel = (kind: EventKind) => t(`kinds.${kind}`);
  const label = eventLabel(event, activityTypesById, kindLabel);
  const time = eventTime(event.at, dog.timezone);
  const duration =
    event.endedAt === undefined
      ? null
      : formatElapsed(getElapsedMs(event.at, event.endedAt), locale);

  return (
    <li className="grid min-w-0 gap-2 border-b border-border py-4 last:border-0 sm:grid-cols-[5.25rem_minmax(0,1fr)] sm:gap-5">
      <time
        dateTime={new Date(event.at).toISOString()}
        className="text-base font-semibold tabular-nums text-foreground"
      >
        {time}
      </time>
      <div className="min-w-0">
        {isEditing ? (
          <div className="rounded-lg bg-muted/70 p-4">
            <EventEditor
              dog={dog}
              event={event}
              onCancel={onCancelEdit}
              onSaved={onSaved}
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="break-words text-base font-semibold leading-6 [overflow-wrap:anywhere]">
                {label}
              </h4>
              {event.kind === "pee" && event.peePlace && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {t(`peePlace.${event.peePlace}`)}
                </span>
              )}
              {event.walkId !== undefined && (
                <span
                  title={t("linkedWalk", { id: event.walkId })}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground"
                >
                  {t("duringWalk")}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-5 text-muted-foreground">
              {duration && <span>{t("duration", { duration })}</span>}
              {event.amount !== undefined && (
                <span>
                  {t("amount", { amount: formatNumber(event.amount, locale) })}
                </span>
              )}
            </div>
            {event.note && (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                {event.note}
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              aria-label={t("editAria", { event: label, time })}
              onClick={onEdit}
            >
              {t("edit")}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function TrainingTimelineRow({
  dog,
  training,
}: {
  dog: TimelineDog;
  training: TrainingGroup;
}) {
  const { t } = useTranslation("timeline");
  const time = eventTime(training.at, dog.timezone);
  const href =
    training.commands.length === 1
      ? `/training?command=${training.commands[0].commandId}#command-detail`
      : "/training";

  return (
    <li className="grid min-w-0 gap-2 border-b border-border py-4 last:border-0 sm:grid-cols-[5.25rem_minmax(0,1fr)] sm:gap-5">
      <time
        dateTime={new Date(training.at).toISOString()}
        className="text-base font-semibold tabular-nums text-foreground"
      >
        {time}
      </time>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-base font-semibold leading-6">
            {t("kinds.training")}
          </h4>
        </div>
        <div className="mt-2 grid gap-2">
          {training.commands.map((command) => {
            const rating = trainingRatings.find(
              ({ value }) => value === toTrainingRating(command.rating),
            )!;
            return (
              <div
                key={command.sessionId}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2"
              >
                <span className="break-words text-sm font-medium leading-5 [overflow-wrap:anywhere]">
                  {command.commandName}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  <span aria-hidden="true">{rating.icon}</span>
                  {t(`trainingRating.${rating.value}`)}
                </span>
              </div>
            );
          })}
        </div>
        {training.notes && (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {training.notes}
          </p>
        )}
        <Button asChild variant="secondary" className="mt-3">
          <Link to={href}>
            {t(
              training.commands.length === 1
                ? "openTrainingOne"
                : "openTrainingMany",
            )}
          </Link>
        </Button>
      </div>
    </li>
  );
}

function TimelinePage({ dog }: { dog: TimelineDog }) {
  const { i18n, t } = useTranslation("timeline");
  const locale = i18n.resolvedLanguage as Locale;
  const [kinds, setKinds] = useState<TimelineKind[]>([]);
  const [editId, setEditId] = useState<Id<"events"> | null>(null);
  const [status, setStatus] = useState("");
  const loaderRef = useRef<HTMLDivElement>(null);
  const hasValidTimezone = Boolean(getZonedDayKeys(0, dog.timezone));
  const selectedKinds = useMemo(() => new Set(kinds), [kinds]);
  const eventKinds = kinds.filter(
    (kind): kind is EventKind => kind !== "training",
  );
  const showEvents = kinds.length === 0 || eventKinds.length > 0;
  const showTraining = kinds.length === 0 || selectedKinds.has("training");
  const events = usePaginatedQuery(
    api.timeline.list,
    hasValidTimezone && showEvents
      ? {
          dogId: dog._id,
          ...(eventKinds.length ? { kinds: eventKinds } : {}),
        }
      : "skip",
    { initialNumItems: pageSize },
  );
  const training = usePaginatedQuery(
    api.training.listTimeline,
    hasValidTimezone && showTraining ? { dogId: dog._id } : "skip",
    { initialNumItems: pageSize },
  );
  const activityTypes = useQuery(
    api.activityTypes.list,
    hasValidTimezone
      ? { dogId: dog._id, includeArchived: true, limit: 100 }
      : "skip",
  );
  const activityTypesById = useMemo(
    () =>
      new Map(
        (activityTypes ?? []).map((activity) => [activity._id, activity]),
      ),
    [activityTypes],
  );
  const toggleKind = (kind: TimelineKind) =>
    setKinds((selected) =>
      selected.includes(kind)
        ? selected.filter((value) => value !== kind)
        : [...selected, kind],
    );
  const coverageFloor = Math.max(
    showEvents && events.status !== "Exhausted"
      ? (events.results.at(-1)?.at ?? Number.POSITIVE_INFINITY)
      : Number.NEGATIVE_INFINITY,
    showTraining && training.status !== "Exhausted"
      ? (training.results.at(-1)?.at ?? Number.POSITIVE_INFINITY)
      : Number.NEGATIVE_INFINITY,
  );
  const timelineItems = useMemo<TimelineItem[]>(
    () =>
      [
        ...events.results.flatMap((event) =>
          selectedKinds.size === 0 || selectedKinds.has(event.kind)
            ? [{ at: event.at, event, type: "event" as const }]
            : [],
        ),
        ...(selectedKinds.size === 0 || selectedKinds.has("training")
          ? groupTrainingSessions(training.results).map((group) => ({
              at: group.at,
              training: group,
              type: "training" as const,
            }))
          : []),
      ]
        .filter(({ at }) => at > coverageFloor)
        .sort((left, right) => right.at - left.at),
    [coverageFloor, events.results, selectedKinds, training.results],
  );
  const timelineDays = useMemo(() => {
    const days = new Map<string, TimelineDay>();
    for (const item of timelineItems) {
      const date = formatZonedDateTimeLocal(item.at, dog.timezone)?.slice(
        0,
        10,
      );
      if (!date) continue;
      const day = days.get(date);
      if (day) {
        day.items.push(item);
      } else {
        days.set(date, {
          date,
          items: [item],
          label: formatDate(item.at, locale, dog.timezone, {
            day: "numeric",
            month: "long",
            weekday: "long",
            year: "numeric",
          }),
        });
      }
    }
    return [...days.values()];
  }, [dog.timezone, locale, timelineItems]);
  const isLoading =
    hasValidTimezone &&
    ((showEvents && events.status === "LoadingFirstPage") ||
      (showTraining && training.status === "LoadingFirstPage"));
  const isLoadingMore =
    (showEvents && events.status === "LoadingMore") ||
    (showTraining && training.status === "LoadingMore");
  const canLoadMore =
    !isLoadingMore &&
    ((showEvents && events.status === "CanLoadMore") ||
      (showTraining && training.status === "CanLoadMore"));
  const isExhausted =
    (!showEvents || events.status === "Exhausted") &&
    (!showTraining || training.status === "Exhausted");
  const loadOlder = useCallback(() => {
    if (showEvents && events.status === "CanLoadMore") {
      events.loadMore(pageSize);
    }
    if (showTraining && training.status === "CanLoadMore") {
      training.loadMore(pageSize);
    }
  }, [events, showEvents, showTraining, training]);

  useEffect(() => {
    const target = loaderRef.current;
    if (!target || !canLoadMore || typeof IntersectionObserver === "undefined")
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        loadOlder();
      },
      { rootMargin: "480px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [canLoadMore, loadOlder]);

  return (
    <AppFrame dogName={dog.name}>
      <section className="min-w-0 py-6 sm:py-8">
        <h1 className="text-balance text-[1.75rem] font-bold leading-[2.125rem]">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-[70ch] text-pretty break-words text-base leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          {t("intro", { name: dog.name })}
        </p>
        <p className="mt-2 break-words text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {t("boundary", { timezone: dog.timezone })}
        </p>
      </section>

      <fieldset className="border-y border-border bg-secondary/60 py-4">
        <legend className="sr-only">{t("filter")}</legend>
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3">
          <p className="text-sm font-semibold">{t("filter")}</p>
          {kinds.length > 0 && (
            <Button type="button" variant="quiet" onClick={() => setKinds([])}>
              {t("clearFilters")}
            </Button>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 px-1 sm:grid-cols-3 lg:grid-cols-5">
          {filterOptions.map((kind) => (
            <label
              key={kind}
              className="inline-flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium has-[:checked]:font-semibold hover:bg-accent"
            >
              <input
                type="checkbox"
                value={kind}
                checked={selectedKinds.has(kind)}
                className="size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onChange={() => toggleKind(kind)}
              />
              <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
                {t(`kinds.${kind}`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section
        aria-labelledby="timeline-ledger-title"
        aria-busy={isLoading || isLoadingMore}
        className="mt-6 rounded-xl border border-border bg-card px-5 py-6 sm:px-7"
      >
        <h2
          id="timeline-ledger-title"
          className="border-b border-border pb-4 text-xl font-semibold leading-7"
        >
          {t("timeline")}
        </h2>

        {status && (
          <p role="status" className="mt-4 text-sm font-bold text-primary">
            {status}
          </p>
        )}

        {!hasValidTimezone ? (
          <p
            role="alert"
            className="mt-5 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-6 text-destructive"
          >
            {t("invalid", { name: dog.name })}
          </p>
        ) : isLoading ? (
          <div className="mt-5">
            <p role="status" className="text-sm text-muted-foreground">
              {t("loading")}
            </p>
            <div aria-hidden="true" className="mt-2">
              {skeletonRows.map((row) => (
                <div
                  key={row}
                  className="grid animate-pulse gap-2 border-b border-border py-4 motion-reduce:animate-none sm:grid-cols-[5.25rem_minmax(0,1fr)] sm:gap-5"
                >
                  <span className="h-5 w-14 rounded-md bg-muted" />
                  <span className="h-5 w-full max-w-64 rounded-md bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {timelineDays.map((day) => (
              <section
                key={day.date}
                aria-labelledby={`timeline-day-${day.date}`}
              >
                <h3
                  id={`timeline-day-${day.date}`}
                  className="sticky top-0 z-[var(--z-sticky)] -mx-5 border-b border-border bg-secondary px-5 py-3 text-base font-semibold leading-6 sm:-mx-7 sm:px-7"
                >
                  <time dateTime={day.date}>{day.label}</time>
                </h3>
                <ol>
                  {day.items.map((item) =>
                    item.type === "training" ? (
                      <TrainingTimelineRow
                        key={`training-${item.training.id}`}
                        dog={dog}
                        training={item.training}
                      />
                    ) : (
                      <TimelineRow
                        key={item.event._id}
                        activityTypesById={activityTypesById}
                        dog={dog}
                        event={item.event}
                        isEditing={editId === item.event._id}
                        onCancelEdit={() => setEditId(null)}
                        onEdit={() => {
                          setEditId(item.event._id);
                          setStatus("");
                        }}
                        onSaved={(label) => {
                          setEditId(null);
                          setStatus(t("updated", { event: label }));
                        }}
                      />
                    ),
                  )}
                </ol>
              </section>
            ))}
            {isExhausted ? (
              timelineItems.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {kinds.length > 0 ? t("filteredEmpty") : t("empty")}
                  </p>
                  {kinds.length === 0 && (
                    <Button asChild variant="secondary" className="mt-3">
                      <Link to="/">{t("emptyAction")}</Link>
                    </Button>
                  )}
                </div>
              ) : (
                <p className="mt-5 border-t border-border pt-4 text-center text-sm text-muted-foreground">
                  {t("end")}
                </p>
              )
            ) : isLoadingMore ? (
              <Button
                type="button"
                disabled
                aria-busy="true"
                variant="secondary"
                className="mt-5 w-full"
              >
                {t("loadingMore")}
              </Button>
            ) : canLoadMore ? (
              <div ref={loaderRef} className="pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={loadOlder}
                >
                  {t("loadMore")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppFrame>
  );
}

export default TimelinePage;
