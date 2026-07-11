import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import AppFrame from "@/components/AppFrame";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { formatElapsed, getElapsedMs } from "@/lib/timers";
import { EventEditor } from "@/pages/DashboardPage";
import {
  formatZonedDateTimeLocal,
  getZonedDayKeys,
  getZonedDayWindow,
} from "@/lib/zonedDateTime";

type TimelineDog = Pick<Doc<"dogs">, "_id" | "birthday" | "name" | "timezone">;
type TimelineEvent = FunctionReturnType<
  typeof api.timeline.listDay
>["page"][number];
type EventKind = TimelineEvent["kind"];
type ActivityTypes = FunctionReturnType<typeof api.activityTypes.list>;
type ActivityTypesById = ReadonlyMap<
  Id<"activityTypes">,
  ActivityTypes[number]
>;

const filterOptions = [
  "pee",
  "poop",
  "meal",
  "treat",
  "wake",
  "sleep",
  "walk",
  "play",
  "note",
] as const satisfies ReadonlyArray<EventKind>;
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
              <h3 className="break-words text-base font-semibold leading-6 [overflow-wrap:anywhere]">
                {label}
              </h3>
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

function TimelinePage({ dog }: { dog: TimelineDog }) {
  const { i18n, t } = useTranslation("timeline");
  const locale = i18n.resolvedLanguage as Locale;
  const initialDate = () =>
    getZonedDayKeys(Date.now(), dog.timezone)?.today ?? "";
  const [date, setDate] = useState(initialDate);
  const [dateDirty, setDateDirty] = useState(false);
  const [kinds, setKinds] = useState<EventKind[]>([]);
  const [editId, setEditId] = useState<Id<"events"> | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (dateDirty) return;
    const syncDate = () => {
      const today = getZonedDayKeys(Date.now(), dog.timezone)?.today;
      setDate(today ?? "");
    };
    syncDate();
    const interval = window.setInterval(syncDate, 30_000);
    return () => window.clearInterval(interval);
  }, [dateDirty, dog.timezone]);

  const dayWindow = getZonedDayWindow(date, dog.timezone);
  const timeline = usePaginatedQuery(
    api.timeline.listDay,
    dayWindow
      ? {
          dogId: dog._id,
          startAt: dayWindow.startAt,
          endAt: dayWindow.endAt,
          ...(kinds.length ? { kinds } : {}),
        }
      : "skip",
    { initialNumItems: 30 },
  );
  const activityTypes = useQuery(api.activityTypes.list, {
    dogId: dog._id,
    includeArchived: true,
    limit: 100,
  });
  const activityTypesById = useMemo(
    () =>
      new Map(
        (activityTypes ?? []).map((activity) => [activity._id, activity]),
      ),
    [activityTypes],
  );
  const selectedKinds = useMemo(() => new Set(kinds), [kinds]);
  const toggleKind = (kind: EventKind) =>
    setKinds((selected) =>
      selected.includes(kind)
        ? selected.filter((value) => value !== kind)
        : [...selected, kind],
    );

  return (
    <AppFrame dogName={dog.name}>
      <section className="grid min-w-0 gap-6 py-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] lg:items-end">
        <div className="min-w-0">
          <h1 className="text-balance text-[1.75rem] font-bold leading-[2.125rem]">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-[70ch] text-pretty break-words text-base leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {t("intro", { name: dog.name })}
          </p>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="timeline-date"
            className="text-sm font-semibold text-foreground"
          >
            {t("timelineDate")}
          </label>
          <input
            id="timeline-date"
            type="date"
            min={dog.birthday}
            value={date}
            className="field-control mt-2 w-full"
            onChange={(event) => {
              setDate(event.target.value);
              setDateDirty(true);
            }}
          />
          <p className="mt-2 break-words text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {t("boundary", { timezone: dog.timezone })}
          </p>
        </div>
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
        aria-busy={
          Boolean(dayWindow) &&
          (timeline.status === "LoadingFirstPage" ||
            timeline.status === "LoadingMore")
        }
        className="mt-6 overflow-hidden rounded-xl border border-border bg-card px-5 py-6 sm:px-7"
      >
        <h2
          id="timeline-ledger-title"
          className="border-b border-border pb-4 text-xl font-semibold leading-7"
        >
          {dayWindow
            ? formatDate(dayWindow.startAt, locale, dog.timezone)
            : t("timeline")}
        </h2>

        {status && (
          <p role="status" className="mt-4 text-sm font-bold text-primary">
            {status}
          </p>
        )}

        {!dayWindow ? (
          <p
            role="alert"
            className="mt-5 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-6 text-destructive"
          >
            {t("invalid", { name: dog.name })}
          </p>
        ) : timeline.status === "LoadingFirstPage" ? (
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
            {timeline.results.length > 0 && (
              <ol className="divide-y-0">
                {timeline.results.map((event) => (
                  <TimelineRow
                    key={event._id}
                    activityTypesById={activityTypesById}
                    dog={dog}
                    event={event}
                    isEditing={editId === event._id}
                    onCancelEdit={() => setEditId(null)}
                    onEdit={() => {
                      setEditId(event._id);
                      setStatus("");
                    }}
                    onSaved={(label) => {
                      setEditId(null);
                      setStatus(t("updated", { event: label }));
                    }}
                  />
                ))}
              </ol>
            )}
            {timeline.status === "Exhausted" ? (
              timeline.results.length === 0 ? (
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
            ) : timeline.status === "LoadingMore" ? (
              <Button
                type="button"
                disabled
                aria-busy="true"
                variant="secondary"
                className="mt-5 w-full"
              >
                {t("loadingMore")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="mt-5 w-full"
                onClick={() => timeline.loadMore(30)}
              >
                {t("loadMore")}
              </Button>
            )}
          </>
        )}
      </section>
    </AppFrame>
  );
}

export default TimelinePage;
