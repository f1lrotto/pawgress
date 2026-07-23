import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { TFunction } from "i18next";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import AppFrame from "@/components/AppFrame";
import DayOverview, { type DayOverviewItem } from "@/components/DayOverview";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/i18n/format";
import { resolveBrowserLocale } from "@/i18n/locale";
import { activityVisuals } from "@/lib/activityVisuals";
import { getNextMealCountdown } from "@/lib/mealCountdown";
import { parseDecimalInput } from "@/lib/number";
import { deriveSleepState, formatElapsed, getElapsedMs } from "@/lib/timers";
import { type TrainingRating, trainingRatings } from "@/lib/trainingRating";
import {
  formatZonedDateTimeLocal,
  getZonedDayKeys,
  getZonedDayWindow,
  parseZonedDateTimeLocal,
} from "@/lib/zonedDateTime";

type QuickKind = "pee" | "poop" | "meal" | "water" | "treat" | "wake" | "sleep";
type PeePlace = "inside" | "outside";
type PendingOperation =
  | QuickKind
  | "backdate"
  | "undo"
  | "walk-diary"
  | "walk-end"
  | "walk-start"
  | null;
type LatestEvents = FunctionReturnType<typeof api.events.latestByKind>;
type ActiveWalk = FunctionReturnType<typeof api.walks.active>;
type RecentEvents = FunctionReturnType<typeof api.events.listRecent>;
type RecentEvent = RecentEvents[number];
type ActivityTypes = FunctionReturnType<typeof api.activityTypes.list>;
type AgendaDay = FunctionReturnType<typeof api.agenda.get>;
type TrainingCommands = FunctionReturnType<typeof api.training.list>;
type TodayActivities =
  | Array<{ count: number; displayCount: string; id: string; name: string }>
  | undefined;
type DailySummary = {
  activityCount: string | undefined;
  enrichment: TodayActivities;
  isLoading: boolean;
  meal: { elapsed: string; nextLabel?: string; nextValue: string };
  pee: string;
  poop: string;
  rest: { elapsed: string; startedAt?: string; state?: "asleep" | "awake" };
  restToday?: string;
  training: TodayActivities;
  treat: string;
  updatedAt: string | undefined;
  walk: {
    count?: string;
    duration?: string;
    elapsed: string;
    hasLatest: boolean;
  };
  water?: { count: string | undefined; elapsed: string; next: string };
};
const countCompleted = (goals: ReadonlyArray<{ done: boolean }>) =>
  goals.filter(({ done }) => done).length;
type ActivityTypesById = ReadonlyMap<
  Id<"activityTypes">,
  ActivityTypes[number]
>;
type SleepState = ReturnType<typeof deriveSleepState>;
type DashboardDog = Pick<
  Doc<"dogs">,
  "_id" | "birthday" | "name" | "timezone" | "waterIntervalMinutes"
>;
type MinuteChoice = number | string | null;
type UndoTarget = { eventId: Id<"events">; walkId?: Id<"events"> };
type BackdateState = {
  amount: string;
  attachToWalk: boolean;
  at: string;
  error: string;
  errors: {
    amount: string;
    at: string;
    note: string;
    walkDuration: string;
    walkOffset: string;
  };
  isOpen: boolean;
  isPending: boolean;
  kind: QuickKind;
  note: string;
  peePlace: PeePlace;
  reconstructWalk: boolean;
  walkDuration: MinuteChoice;
  walkOffset: MinuteChoice;
};
type EditState = {
  amount: string;
  at: string;
  endedAt: string;
  error: string;
  errors: { amount: string; at: string; endedAt: string; note: string };
  isPending: boolean;
  note: string;
  peePlace: PeePlace;
};
type WalkTimeState = { at: string; error: string; isOpen: boolean };
type DiaryState = { error: string; isOpen: boolean; note: string };
type EarlierAction = { kind: QuickKind; label: string; peePlace?: PeePlace };
type WalkPromptAction = EarlierAction & { at: number };
type WalkPrompt = { action: WalkPromptAction; step: "question" | "start" };
type CompleteEventKind = "sleep" | "walk";
type WalkPottyMarker = {
  id: number;
  kind: "pee" | "poop";
  offsetMinutes: number;
};
type CompleteEventState = {
  endedAt: string;
  errors: { endedAt: string; startedAt: string };
  formError: string;
  isPending: boolean;
  kind: CompleteEventKind | null;
  markers: WalkPottyMarker[];
  selectedMarkerId: number | null;
  startedAt: string;
};
type RecentState = {
  confirmDeleteId: Id<"events"> | null;
  editId: Id<"events"> | null;
  error: string;
  pendingDeleteId: Id<"events"> | null;
  status: string;
};

const rowActionClassName =
  "rounded-lg text-xl font-normal leading-none text-primary [&_svg]:size-5";

const rowActionGlyphPaths = {
  chevron: <path d="m6 9 6 6 6-6" />,
  play: <path d="m7 4 13 8-13 8Z" />,
  rest: (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <path d="M6 1.5V3M1.5 7H3M9 7h1.5M18.8 9.5a5.5 5.5 0 1 0 2.7 8.8 4.5 4.5 0 0 1-2.7-8.8Z" />
    </>
  ),
  sleep: <path d="M20.5 14.2A8 8 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="1.5" />,
  wake: (
    <>
      <path d="M4 18h16M6 14a6 6 0 0 1 12 0M12 2v3M4.9 5.9 7 8M19.1 5.9 17 8" />
    </>
  ),
} as const;

function RowActionGlyph({ kind }: { kind: keyof typeof rowActionGlyphPaths }) {
  return (
    <svg
      aria-hidden="true"
      data-action-glyph={kind}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {rowActionGlyphPaths[kind]}
    </svg>
  );
}

const initialBackdateState: BackdateState = {
  amount: "",
  attachToWalk: true,
  at: "",
  error: "",
  errors: {
    amount: "",
    at: "",
    note: "",
    walkDuration: "",
    walkOffset: "",
  },
  isOpen: false,
  isPending: false,
  kind: "pee",
  note: "",
  peePlace: "outside",
  reconstructWalk: false,
  walkDuration: null,
  walkOffset: null,
};
const initialCompleteEventState: CompleteEventState = {
  endedAt: "",
  errors: { endedAt: "", startedAt: "" },
  formError: "",
  isPending: false,
  kind: null,
  markers: [],
  selectedMarkerId: null,
  startedAt: "",
};
const mergeBackdateState = (
  state: BackdateState,
  patch: Partial<BackdateState>,
) => ({ ...state, ...patch });
const mergeCompleteEventState = (
  state: CompleteEventState,
  patch: Partial<CompleteEventState>,
) => ({ ...state, ...patch });
const mergeEditState = (state: EditState, patch: Partial<EditState>) => ({
  ...state,
  ...patch,
});
const initialWalkTimeState: WalkTimeState = {
  at: "",
  error: "",
  isOpen: false,
};
const mergeWalkTimeState = (
  state: WalkTimeState,
  patch: Partial<WalkTimeState>,
) => ({ ...state, ...patch });
const mergeDiaryState = (state: DiaryState, patch: Partial<DiaryState>) => ({
  ...state,
  ...patch,
});
const initialRecentState: RecentState = {
  confirmDeleteId: null,
  editId: null,
  error: "",
  pendingDeleteId: null,
  status: "",
};
const mergeRecentState = (state: RecentState, patch: Partial<RecentState>) => ({
  ...state,
  ...patch,
});

const quickActions = [
  { kind: "pee", icon: "💧" },
  { kind: "poop", icon: "💩" },
  { kind: "meal", icon: "🍽️" },
  { kind: "water", icon: "🚰" },
  { kind: "treat", icon: "🦴" },
  { kind: "wake", icon: "☀️" },
  { kind: "sleep", icon: "😴" },
] as const satisfies ReadonlyArray<{
  kind: QuickKind;
  icon: string;
}>;
const defaultQuickActions = quickActions.filter(({ kind }) => kind !== "water");
const quickTimePresets = [5, 15, 30] as const;
const walkPromptPresets = [1, 3, 5, 10, 15] as const;
const walkDurationPresets = [10, 15, 20, 30, 45, 60] as const;
const maxCompleteWalkEvents = 100;

const walkFieldClassName = "field-control mt-2 w-full";
const maxFutureMs = 5 * 60_000;
const getCurrentTime = () => Date.now();
const isPottyKind = (kind: QuickKind): kind is "pee" | "poop" =>
  kind === "pee" || kind === "poop";
const getMinuteChoice = (choice: MinuteChoice) =>
  typeof choice === "string" ? (choice.trim() ? Number(choice) : null) : choice;
const getActivityEventLabel = (
  event: RecentEvent,
  activityTypesById: ActivityTypesById,
  t: TFunction<"dashboard">,
) => {
  const activityType =
    event.kind === "play" && event.activityTypeId !== undefined
      ? activityTypesById.get(event.activityTypeId)
      : undefined;
  return activityType
    ? [activityType.emoji, activityType.name].filter(Boolean).join(" ")
    : t(`events.${event.kind}`);
};

function PeePlaceField({
  id,
  onChange,
  value,
}: {
  id: string;
  onChange: (place: PeePlace) => void;
  value: PeePlace;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-bold">{t("peePlace.label")}</legend>
      <div className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {(["inside", "outside"] as const).map((place) => (
          <label
            key={place}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 bg-card px-3 text-sm font-semibold has-[:checked]:bg-secondary"
          >
            <input
              type="radio"
              name={`${id}-pee-place`}
              value={place}
              checked={value === place}
              onChange={() => onChange(place)}
            />
            {t(`peePlace.${place}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const getTimestampError = (
  value: string,
  parsedAt: number | null,
  dog: DashboardDog,
  now: number,
  t: TFunction<"dashboard">,
) => {
  if (parsedAt === null) return t("common.timestampInvalid");
  if (value.slice(0, 10) < dog.birthday) {
    return t("common.timestampBeforeBirthday", { birthday: dog.birthday });
  }
  return parsedAt > now + maxFutureMs ? t("common.timestampFuture") : "";
};

const hasErrorCode = (error: unknown, code: string) =>
  (error instanceof Error && error.message.includes(code)) ||
  (typeof error === "object" &&
    error !== null &&
    "data" in error &&
    error.data === code);

function DailyRow({
  actions,
  className = "",
  context,
  detail,
  footer,
  icon,
  metric,
  metricLabel,
  statusId,
  title,
}: {
  actions: ReactNode;
  className?: string;
  context: string;
  detail: ReactNode;
  footer?: ReactNode;
  icon: string;
  metric: string;
  metricLabel: string;
  statusId?: string;
  title: string;
}) {
  return (
    <div
      role="group"
      aria-label={title}
      className={`grid min-h-24 grid-cols-[2.125rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-4 py-4 sm:gap-4 sm:px-5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="grid size-[2.125rem] place-items-center rounded-lg bg-muted text-base"
      >
        {icon}
      </span>
      <div id={statusId} className="min-w-0">
        <h2 className="text-sm font-bold leading-5 text-muted-foreground">
          {title}
        </h2>
        <dl>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <dt className="sr-only">{metricLabel}</dt>
            <dd className="text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums sm:text-xl">
              {metric}
            </dd>
            {context && (
              <dd className="text-sm font-medium leading-5">{context}</dd>
            )}
          </div>
        </dl>
        <div className="mt-0.5 text-sm leading-5 text-muted-foreground">
          {detail}
        </div>
      </div>
      <div className="flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
        {actions}
      </div>
      {footer && <div className="col-span-full">{footer}</div>}
    </div>
  );
}

function ActivityCountSummary({
  items,
  kind,
}: {
  items: TodayActivities;
  kind: "enrichment" | "training";
}) {
  const { i18n, t } = useTranslation("dashboard");
  if (items === undefined) return <>{t("common.checking")}</>;
  if (items.length === 0) return <>{t("daily.more.none")}</>;
  if (items.length > 2) {
    const locale = resolveBrowserLocale(i18n.languages);
    const total = items.reduce((sum, item) => sum + item.count, 0);
    const groups = t(
      kind === "enrichment"
        ? "daily.more.gameActivities"
        : "daily.more.commands",
      {
        count: items.length,
        formattedCount: formatNumber(items.length, locale),
      },
    );
    const entries = t(
      kind === "enrichment" ? "daily.more.logs" : "daily.more.sessions",
      { count: total, formattedCount: formatNumber(total, locale) },
    );
    return <>{t("daily.more.aggregate", { entries, groups })}</>;
  }
  return (
    <>
      {items.map(({ count, displayCount, id, name }, index) => (
        <span
          key={id}
          aria-label={t(
            kind === "enrichment"
              ? "timers.enrichmentCount"
              : "timers.trainingCount",
            { count, name },
          )}
        >
          {index > 0 && " · "}
          {name} ×{displayCount}
        </span>
      ))}
    </>
  );
}

const countActivities = <Item,>(
  items: ReadonlyArray<Item>,
  getActivity: (item: Item) => { id: string; name: string },
  locale: string,
) =>
  Array.from(
    items.reduce((counts, item) => {
      const { id, name } = getActivity(item);
      const current = counts.get(id);
      counts.set(id, {
        count: (current?.count ?? 0) + 1,
        id,
        name,
      });
      return counts;
    }, new Map<string, { count: number; id: string; name: string }>()),
  )
    .map(([, item]) => item)
    .sort(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name, locale),
    );

const getRestTodayMs = (
  items: DayOverviewItem[],
  startAt: number,
  endAt: number,
  now: number,
) => {
  const limit = Math.min(now, endAt);
  let asleepAt: number | null = null;
  let total = 0;
  for (const item of items
    .filter(({ kind }) => kind === "sleep" || kind === "wake")
    .sort((left, right) => left.at - right.at)) {
    if (item.kind === "sleep") asleepAt = Math.max(item.at, startAt);
    else if (asleepAt !== null && item.at > asleepAt) {
      total += Math.min(item.at, limit) - asleepAt;
      asleepAt = null;
    }
  }
  return asleepAt === null || asleepAt >= limit
    ? total
    : total + limit - asleepAt;
};

function AgendaSummary({ agenda }: { agenda: AgendaDay | undefined }) {
  const { t } = useTranslation(["dashboard", "agenda"]);
  const enrichment = agenda?.enrichmentGoals ?? [];
  const training = agenda?.trainingGoals ?? [];
  const hasPlan = Boolean(
    enrichment.length ||
    training.length ||
    agenda?.win ||
    agenda?.rating !== undefined,
  );
  return (
    <section
      aria-labelledby="agenda-summary-title"
      className="rounded-xl bg-muted/70 px-5 py-5 sm:px-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2
            id="agenda-summary-title"
            className="text-balance text-xl font-bold leading-[1.625rem]"
          >
            {t("agenda.title")}
          </h2>
          {agenda === undefined ? (
            <>
              <p role="status" className="sr-only">
                {t("agenda.loading")}
              </p>
              <dl
                aria-hidden="true"
                className="mt-4 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3"
              >
                {["enrichment", "training", "rating"].map((item) => (
                  <div
                    key={item}
                    className="animate-pulse motion-reduce:animate-none"
                  >
                    <dt className="h-5 w-20 rounded bg-border/70" />
                    <dd className="mt-2 h-6 w-10 rounded bg-border" />
                  </div>
                ))}
              </dl>
            </>
          ) : !hasPlan ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("agenda.empty")}
            </p>
          ) : (
            <>
              <dl className="mt-4 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    {t("agenda.enrichment")}
                  </dt>
                  <dd className="mt-1 text-base font-semibold">
                    {countCompleted(enrichment)}/{enrichment.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    {t("agenda.training")}
                  </dt>
                  <dd className="mt-1 text-base font-semibold">
                    {countCompleted(training)}/{training.length}
                  </dd>
                </div>
                {agenda?.rating !== undefined && (
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      {t("reflection.rating", { ns: "agenda" })}
                    </dt>
                    <dd className="mt-1 text-base font-semibold">
                      {agenda.rating}/5
                    </dd>
                  </div>
                )}
              </dl>
              {agenda?.win && (
                <p className="mt-4 max-w-[70ch] break-words text-pretty text-sm leading-5">
                  {t("agenda.win", { win: agenda.win })}
                </p>
              )}
            </>
          )}
        </div>
        <Button asChild className="shrink-0 self-start">
          <Link to="/agenda" aria-label={t("agenda.openAria")}>
            {t("agenda.open")} <span aria-hidden="true">→</span>
          </Link>
        </Button>
      </div>
    </section>
  );
}

function WalkTimeForm({
  at,
  disabled,
  error,
  formLabel,
  id,
  inputLabel,
  isPending,
  onCancel,
  onChange,
  onSubmit,
  pendingLabel,
  submitLabel,
  timezone,
}: {
  at: string;
  disabled: boolean;
  error: string;
  formLabel: string;
  id: string;
  inputLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, now: number) => void;
  pendingLabel: string;
  submitLabel: string;
  timezone: string;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <form
      aria-label={formLabel}
      aria-busy={isPending}
      className="mt-4 border-t border-border pt-4"
      noValidate
      onSubmit={(event) => onSubmit(event, Date.now())}
    >
      <fieldset disabled={disabled} className="m-0 border-0 p-0">
        <label htmlFor={id} className="text-sm font-bold">
          {inputLabel}
        </label>
        <input
          id={id}
          type="datetime-local"
          step="60"
          value={at}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${id}-timezone ${id}-error` : `${id}-timezone`
          }
          className={walkFieldClassName}
          onChange={(event) => onChange(event.target.value)}
        />
        {error && (
          <p id={`${id}-error`} className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <p id={`${id}-timezone`} className="mt-2 text-xs text-muted-foreground">
          {t("common.timezone", { timezone })}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr]">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function WalkDiaryEditor({
  disabled,
  dogId,
  onError,
  onOperationEnd,
  onOperationStart,
  onSaved,
  pendingOperation,
  walk,
}: {
  disabled: boolean;
  dogId: Id<"dogs">;
  onError: (message: string) => void;
  onOperationEnd: () => void;
  onOperationStart: (operation: "walk-diary") => boolean;
  onSaved: () => void;
  pendingOperation: PendingOperation;
  walk: NonNullable<ActiveWalk>;
}) {
  const { i18n, t } = useTranslation("dashboard");
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  const updateDiary = useMutation(api.walks.updateDiary);
  const [form, updateForm] = useReducer(mergeDiaryState, {
    error: "",
    isOpen: false,
    note: walk.note ?? "",
  });
  const { error, isOpen, note } = form;
  const isPending = pendingOperation === "walk-diary";

  const close = () =>
    updateForm({ error: "", isOpen: false, note: walk.note ?? "" });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedNote = note.trim();
    if (normalizedNote.length > 500) {
      updateForm({ error: t("common.maxCharacters", { max: 500 }) });
      document.getElementById("walk-diary")?.focus();
      return;
    }
    if (!onOperationStart("walk-diary")) return;
    onError("");
    let focusDiary = false;
    try {
      await updateDiary({
        dogId,
        walkId: walk._id,
        note: normalizedNote || null,
      });
      updateForm({ error: "", isOpen: false, note: normalizedNote });
      onSaved();
    } catch (caught) {
      if (hasErrorCode(caught, "INVALID_NOTE")) {
        updateForm({ error: t("common.maxCharacters", { max: 500 }) });
        focusDiary = true;
      } else {
        onError(t("walk.diarySaveError"));
      }
    } finally {
      onOperationEnd();
      if (focusDiary) {
        window.setTimeout(() => document.getElementById("walk-diary")?.focus());
      }
    }
  };

  if (!isOpen) {
    return (
      <Button
        type="button"
        disabled={disabled}
        variant="quiet"
        className="mt-2 w-full"
        onClick={() => {
          onError("");
          updateForm({ error: "", isOpen: true, note: walk.note ?? "" });
        }}
      >
        {walk.note ? t("walk.editDiary") : t("walk.addDiary")}
      </Button>
    );
  }

  return (
    <form
      aria-label={t("walk.diary")}
      aria-busy={isPending}
      className="mt-4 border-t border-border pt-4"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={disabled} className="m-0 border-0 p-0">
        <label htmlFor="walk-diary" className="text-sm font-bold">
          {t("walk.diary")}{" "}
          <span className="font-normal">{t("common.optional")}</span>
        </label>
        <textarea
          id="walk-diary"
          value={note}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? "walk-diary-help walk-diary-error" : "walk-diary-help"
          }
          className={`${walkFieldClassName} min-h-24`}
          onChange={(event) =>
            updateForm({ error: "", note: event.target.value })
          }
        />
        <p id="walk-diary-help" className="mt-2 text-xs text-muted-foreground">
          {t("walk.diaryHelp", {
            formattedCount: formatNumber(note.length, locale),
            formattedMax: formatNumber(500, locale),
          })}
        </p>
        {error && (
          <p id="walk-diary-error" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr]">
          <Button type="button" variant="secondary" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">
            {isPending ? t("common.saving") : t("walk.saveDiary")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function WalkControls({
  activeWalk,
  className,
  dog,
  isEarlier,
  now,
  onError,
  onOperationEnd,
  onOperationStart,
  onDiarySaved,
  onTransition,
  pendingOperation,
  summary,
  timeFormatter,
}: {
  activeWalk: ActiveWalk | undefined;
  className: string;
  dog: DashboardDog;
  isEarlier: boolean;
  now: number | null;
  onError: (message: string) => void;
  onOperationEnd: () => void;
  onOperationStart: (
    operation: "walk-diary" | "walk-end" | "walk-start",
  ) => boolean;
  onDiarySaved: () => void;
  onTransition: (message: string) => void;
  pendingOperation: PendingOperation;
  summary: DailySummary["walk"];
  timeFormatter: Intl.DateTimeFormat;
}) {
  const { i18n, t } = useTranslation("dashboard");
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  const startWalk = useMutation(api.walks.start);
  const endWalk = useMutation(api.walks.end);
  const [startForm, updateStartForm] = useReducer(
    mergeWalkTimeState,
    initialWalkTimeState,
  );
  const [endForm, updateEndForm] = useReducer(
    mergeWalkTimeState,
    initialWalkTimeState,
  );
  useEffect(() => {
    if (isEarlier) return;
    if (startForm.isOpen) updateStartForm(initialWalkTimeState);
    if (endForm.isOpen) updateEndForm(initialWalkTimeState);
  }, [endForm.isOpen, isEarlier, startForm.isOpen]);
  const isBusy = pendingOperation !== null;
  const detail = summary.duration
    ? t("daily.walk.last", {
        formattedCount: summary.count ?? formatNumber(0, locale),
        duration: summary.duration,
      })
    : summary.count
      ? t("daily.walk.count", { formattedCount: summary.count })
      : t("daily.walk.none");

  const start = async (at: number, isBackdated = false) => {
    if (!onOperationStart("walk-start")) return;
    onError("");
    try {
      await startWalk({ dogId: dog._id, at });
      if (isBackdated) updateStartForm(initialWalkTimeState);
      onTransition(t("walk.started", { dogName: dog.name }));
    } catch (caught) {
      const fieldError = hasErrorCode(caught, "INVALID_TIMESTAMP")
        ? t("common.timestampRange")
        : hasErrorCode(caught, "INVALID_WALK_INTERVAL")
          ? t("walk.startOverlap")
          : "";
      if (isBackdated && fieldError) updateStartForm({ error: fieldError });
      else {
        onError(
          hasErrorCode(caught, "WALK_ALREADY_ACTIVE")
            ? t("walk.alreadyActive")
            : fieldError || t("walk.startError"),
        );
      }
    } finally {
      onOperationEnd();
    }
  };

  const end = async (
    walk: NonNullable<ActiveWalk>,
    endedAt: number,
    isBackdated = false,
  ) => {
    if (!onOperationStart("walk-end")) return;
    onError("");
    try {
      const completedAt = await endWalk({
        dogId: dog._id,
        walkId: walk._id,
        endedAt,
      });
      if (isBackdated) updateEndForm(initialWalkTimeState);
      onTransition(
        t("walk.ended", {
          duration: formatElapsed(getElapsedMs(walk.at, completedAt), locale),
        }),
      );
    } catch (caught) {
      const fieldError = hasErrorCode(caught, "INVALID_TIMESTAMP")
        ? t("common.timestampRange")
        : hasErrorCode(caught, "INVALID_WALK_DURATION") ||
            hasErrorCode(caught, "INVALID_WALK_INTERVAL")
          ? t("walk.endBeforeStart")
          : "";
      if (isBackdated && fieldError) updateEndForm({ error: fieldError });
      else {
        onError(
          hasErrorCode(caught, "WALK_NOT_FOUND") ||
            hasErrorCode(caught, "WALK_ALREADY_ENDED")
            ? t("walk.changedElsewhere")
            : fieldError || t("walk.endError"),
        );
      }
    } finally {
      onOperationEnd();
    }
  };

  const submitStart = (
    event: FormEvent<HTMLFormElement>,
    currentTime: number,
  ) => {
    event.preventDefault();
    const parsedAt = parseZonedDateTimeLocal(startForm.at, dog.timezone);
    const error = getTimestampError(
      startForm.at,
      parsedAt,
      dog,
      currentTime,
      t,
    );
    updateStartForm({ error });
    if (error || parsedAt === null) {
      document.getElementById("walk-start-at")?.focus();
      return;
    }
    void start(parsedAt, true);
  };

  const submitEnd = (
    event: FormEvent<HTMLFormElement>,
    currentTime: number,
  ) => {
    event.preventDefault();
    if (activeWalk === null || activeWalk === undefined) return;
    const parsedAt = parseZonedDateTimeLocal(endForm.at, dog.timezone);
    const timestampError = getTimestampError(
      endForm.at,
      parsedAt,
      dog,
      currentTime,
      t,
    );
    const error =
      timestampError ||
      (parsedAt !== null && parsedAt < activeWalk.at
        ? t("walk.endBeforeStart")
        : "");
    updateEndForm({ error });
    if (error || parsedAt === null) {
      document.getElementById("walk-end-at")?.focus();
      return;
    }
    void end(activeWalk, parsedAt, true);
  };

  const openForm = (update: typeof updateStartForm, currentTime: number) =>
    update({
      ...initialWalkTimeState,
      at: formatZonedDateTimeLocal(currentTime, dog.timezone) ?? "",
      isOpen: true,
    });

  if (activeWalk === undefined) {
    return (
      <DailyRow
        actions={
          <Button
            type="button"
            disabled
            variant="secondary"
            size="icon"
            aria-label={t("walk.checking")}
            className={rowActionClassName}
          >
            <RowActionGlyph kind="play" />
          </Button>
        }
        className={className}
        context=""
        detail={t("daily.walk.loading")}
        icon="🐕"
        metric={summary.elapsed}
        metricLabel={t("timers.sinceWalk")}
        title={t("daily.walk.title")}
      />
    );
  }

  if (activeWalk === null) {
    return (
      <DailyRow
        actions={
          <Button
            type="button"
            disabled={isBusy || (isEarlier && startForm.isOpen)}
            variant="secondary"
            size="icon"
            aria-label={
              pendingOperation === "walk-start" && !startForm.isOpen
                ? t("walk.starting")
                : t("walk.start")
            }
            aria-busy={pendingOperation === "walk-start"}
            className={rowActionClassName}
            onClick={() =>
              isEarlier
                ? openForm(updateStartForm, Date.now())
                : void start(Date.now())
            }
          >
            <RowActionGlyph kind="play" />
          </Button>
        }
        className={className}
        context={summary.hasLatest ? t("daily.walk.since") : ""}
        detail={detail}
        footer={
          startForm.isOpen ? (
            <WalkTimeForm
              at={startForm.at}
              disabled={isBusy}
              error={startForm.error}
              formLabel={t("walk.startBackdatedAria")}
              id="walk-start-at"
              inputLabel={t("walk.startTime")}
              isPending={pendingOperation === "walk-start"}
              onCancel={() => updateStartForm(initialWalkTimeState)}
              onChange={(at) => updateStartForm({ at, error: "" })}
              onSubmit={submitStart}
              pendingLabel={t("walk.starting")}
              submitLabel={t("walk.startAtTime")}
              timezone={dog.timezone}
            />
          ) : undefined
        }
        icon="🐕"
        metric={summary.elapsed}
        metricLabel={t("timers.sinceWalk")}
        title={t("daily.walk.title")}
      />
    );
  }

  return (
    <DailyRow
      actions={
        <Button
          type="button"
          disabled={isBusy || (isEarlier && endForm.isOpen)}
          variant="secondary"
          size="icon"
          aria-label={
            pendingOperation === "walk-end" && !endForm.isOpen
              ? t("walk.ending")
              : t("walk.end")
          }
          aria-busy={pendingOperation === "walk-end"}
          className={rowActionClassName}
          onClick={() =>
            isEarlier
              ? openForm(updateEndForm, Date.now())
              : void end(activeWalk, Date.now())
          }
        >
          <RowActionGlyph kind="stop" />
        </Button>
      }
      className={className}
      context={t("daily.walk.inProgress")}
      detail={
        <Trans
          t={t}
          i18nKey="walk.startedAt"
          values={{ time: timeFormatter.format(activeWalk.at) }}
          components={{
            time: <time dateTime={new Date(activeWalk.at).toISOString()} />,
          }}
        />
      }
      footer={
        <div className="rounded-lg bg-secondary/60 p-3 sm:p-4">
          <WalkDiaryEditor
            disabled={isBusy}
            dogId={dog._id}
            onError={onError}
            onOperationEnd={onOperationEnd}
            onOperationStart={onOperationStart}
            onSaved={onDiarySaved}
            pendingOperation={pendingOperation}
            walk={activeWalk}
          />
          {isEarlier && endForm.isOpen && (
            <WalkTimeForm
              at={endForm.at}
              disabled={isBusy}
              error={endForm.error}
              formLabel={t("walk.endBackdatedAria")}
              id="walk-end-at"
              inputLabel={t("walk.endTime")}
              isPending={pendingOperation === "walk-end"}
              onCancel={() => updateEndForm(initialWalkTimeState)}
              onChange={(at) => updateEndForm({ at, error: "" })}
              onSubmit={submitEnd}
              pendingLabel={t("walk.ending")}
              submitLabel={t("walk.endAtTime")}
              timezone={dog.timezone}
            />
          )}
        </div>
      }
      icon="🐕"
      metric={
        now === null
          ? t("common.syncing")
          : formatElapsed(getElapsedMs(activeWalk.at, now), locale)
      }
      metricLabel={t("timers.currentWalk")}
      title={t("daily.walk.title")}
    />
  );
}

function WalkAttachmentField({
  attachToWalk,
  isBeforeWalk,
  onChange,
}: {
  attachToWalk: boolean;
  isBeforeWalk: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="mt-4">
      <label
        htmlFor="backdate-attach-walk"
        className="flex min-h-11 items-center gap-3 text-sm font-semibold"
      >
        <input
          id="backdate-attach-walk"
          type="checkbox"
          checked={attachToWalk && !isBeforeWalk}
          disabled={isBeforeWalk}
          aria-describedby="backdate-attach-walk-help"
          className="size-5 shrink-0 accent-primary"
          onChange={(event) => onChange(event.target.checked)}
        />
        {t("backdate.attach")}
      </label>
      <p
        id="backdate-attach-walk-help"
        className="pl-8 text-xs text-muted-foreground"
      >
        {isBeforeWalk ? t("backdate.beforeWalk") : t("backdate.attached")}
      </p>
    </div>
  );
}

function MinutePresetField({
  choice,
  error,
  id,
  label,
  min,
  onChange,
  presets,
}: {
  choice: MinuteChoice;
  error: string;
  id: string;
  label: string;
  min: number;
  onChange: (choice: MinuteChoice) => void;
  presets: ReadonlyArray<number>;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <fieldset>
      <legend className="text-sm font-bold">{label}</legend>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={
          choice === null ? "" : typeof choice === "number" ? choice : "other"
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="field-control mt-2 w-full"
        onChange={(event) =>
          onChange(
            event.target.value === "other"
              ? ""
              : event.target.value
                ? Number(event.target.value)
                : null,
          )
        }
      >
        <option value="">—</option>
        {presets.map((minutes) => (
          <option key={minutes} value={minutes}>
            {t("backdate.minutes", { count: minutes })}
          </option>
        ))}
        <option value="other">{t("backdate.other")}</option>
      </select>
      {typeof choice === "string" && (
        <div className="mt-3">
          <label htmlFor={`${id}-custom`} className="sr-only">
            {t("backdate.customMinutes", { field: label })}
          </label>
          <input
            id={`${id}-custom`}
            type="number"
            inputMode="numeric"
            min={min}
            step="1"
            value={choice}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            className="field-control w-full"
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function BackdateOptionalFields({
  amount,
  errors,
  note,
  onAmountChange,
  onNoteChange,
  showsAmount,
}: {
  amount: string;
  errors: BackdateState["errors"];
  note: string;
  onAmountChange: (amount: string) => void;
  onNoteChange: (note: string) => void;
  showsAmount: boolean;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <>
      <div className="mt-4">
        <label htmlFor="backdate-note" className="text-sm font-bold">
          {t("common.note")}{" "}
          <span className="font-normal text-muted-foreground">
            {t("common.optional")}
          </span>
        </label>
        <textarea
          id="backdate-note"
          value={note}
          aria-invalid={Boolean(errors.note)}
          aria-describedby={errors.note ? "backdate-note-error" : undefined}
          className="field-control mt-2 min-h-24 w-full"
          onChange={(event) => onNoteChange(event.target.value)}
        />
        {errors.note && (
          <p id="backdate-note-error" className="mt-2 text-sm text-destructive">
            {errors.note}
          </p>
        )}
      </div>

      {showsAmount && (
        <div className="mt-4">
          <label htmlFor="backdate-amount" className="text-sm font-bold">
            {t("common.amount")}{" "}
            <span className="font-normal text-muted-foreground">
              {t("common.optional")}
            </span>
          </label>
          <input
            id="backdate-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={
              errors.amount ? "backdate-amount-error" : undefined
            }
            className="field-control mt-2 w-full"
            onChange={(event) => onAmountChange(event.target.value)}
          />
          {errors.amount && (
            <p
              id="backdate-amount-error"
              className="mt-2 text-sm text-destructive"
            >
              {errors.amount}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function BackdateForm({
  activeWalk,
  disabled,
  dog,
  onLogged,
  onOperationEnd,
  onOperationStart,
  timeFormatter,
}: {
  activeWalk: ActiveWalk | undefined;
  disabled: boolean;
  dog: DashboardDog;
  onLogged: (target: UndoTarget, label: string) => void;
  onOperationEnd: () => void;
  onOperationStart: () => boolean;
  timeFormatter: Intl.DateTimeFormat;
}) {
  const { t } = useTranslation("dashboard");
  const logQuick = useMutation(api.events.logQuick);
  const logPotty = useMutation(api.walks.logPotty);
  const createWithPotty = useMutation(api.walks.createWithPotty);
  const [form, updateForm] = useReducer(
    mergeBackdateState,
    initialBackdateState,
  );
  const submitting = useRef(false);
  const {
    amount,
    attachToWalk,
    at,
    error,
    errors,
    isOpen,
    isPending,
    kind,
    note,
    peePlace,
    reconstructWalk,
    walkDuration,
    walkOffset,
  } = form;
  const showsAmount = kind === "meal" || kind === "treat";
  const isPotty = isPottyKind(kind);
  const parsedAt = parseZonedDateTimeLocal(at, dog.timezone);
  const isOutsidePotty = isPotty && (kind === "poop" || peePlace === "outside");
  const isBeforeWalk =
    activeWalk !== null &&
    activeWalk !== undefined &&
    parsedAt !== null &&
    parsedAt < activeWalk.at;
  const canAttachToActiveWalk =
    isOutsidePotty &&
    activeWalk !== null &&
    activeWalk !== undefined &&
    parsedAt !== null &&
    parsedAt >= activeWalk.at;
  const canReconstructWalk =
    isOutsidePotty && activeWalk !== undefined && !canAttachToActiveWalk;
  const walkOffsetMinutes = getMinuteChoice(walkOffset);
  const walkDurationMinutes = getMinuteChoice(walkDuration);
  const hasValidWalkOffset =
    walkOffsetMinutes !== null &&
    Number.isSafeInteger(walkOffsetMinutes) &&
    walkOffsetMinutes >= 0;
  const hasValidWalkDuration =
    walkDurationMinutes !== null &&
    Number.isSafeInteger(walkDurationMinutes) &&
    walkDurationMinutes > 0;
  const walkStartedAt =
    parsedAt !== null && hasValidWalkOffset
      ? parsedAt - walkOffsetMinutes * 60_000
      : null;
  const walkEndedAt =
    walkStartedAt !== null && hasValidWalkDuration
      ? walkStartedAt + walkDurationMinutes * 60_000
      : null;
  const availableQuickActions =
    dog.waterIntervalMinutes === undefined ? defaultQuickActions : quickActions;

  const clear = () => updateForm(initialBackdateState);

  const open = (now: number) => {
    updateForm({
      ...initialBackdateState,
      attachToWalk: activeWalk !== null && activeWalk !== undefined,
      at: formatZonedDateTimeLocal(now, dog.timezone) ?? "",
      isOpen: true,
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>, now: number) => {
    event.preventDefault();
    if (submitting.current) return;
    const normalizedNote = note.trim();
    const amountValue = amount.trim() ? parseDecimalInput(amount) : undefined;
    const shouldReconstruct = canReconstructWalk && reconstructWalk;
    const walkStartValue =
      walkStartedAt === null
        ? ""
        : (formatZonedDateTimeLocal(walkStartedAt, dog.timezone) ?? "");
    const nextErrors = {
      amount:
        showsAmount &&
        amountValue !== undefined &&
        (!Number.isFinite(amountValue) ||
          amountValue <= 0 ||
          amountValue > 10_000)
          ? t("common.amountError")
          : "",
      at: getTimestampError(at, parsedAt, dog, now, t),
      note:
        normalizedNote.length > 500
          ? t("common.maxCharacters", { max: 500 })
          : "",
      walkDuration: !shouldReconstruct
        ? ""
        : !hasValidWalkDuration
          ? t("backdate.durationRequired")
          : hasValidWalkOffset && walkDurationMinutes < walkOffsetMinutes
            ? t("backdate.durationTooShort")
            : walkEndedAt !== null && walkEndedAt > now
              ? t("backdate.walkEndFuture")
              : activeWalk !== null &&
                  activeWalk !== undefined &&
                  walkEndedAt !== null &&
                  walkEndedAt > activeWalk.at
                ? t("backdate.walkOverlap")
                : "",
      walkOffset: !shouldReconstruct
        ? ""
        : !hasValidWalkOffset
          ? t("backdate.offsetRequired")
          : getTimestampError(walkStartValue, walkStartedAt, dog, now, t),
    };
    updateForm({ error: "", errors: nextErrors });
    const firstError = (
      ["at", "walkOffset", "walkDuration", "note", "amount"] as const
    ).find((field) => nextErrors[field]);
    if (firstError) {
      const errorIds = {
        amount: "backdate-amount",
        at: "backdate-at",
        note: "backdate-note",
        walkDuration: "backdate-walk-duration",
        walkOffset: "backdate-walk-offset",
      };
      document.getElementById(errorIds[firstError])?.focus();
      return;
    }
    if (parsedAt === null) return;
    if (!onOperationStart()) return;

    submitting.current = true;
    updateForm({ isPending: true });
    try {
      const shouldAttach = canAttachToActiveWalk && attachToWalk;
      let target: UndoTarget;
      if (
        shouldReconstruct &&
        isPottyKind(kind) &&
        walkStartedAt !== null &&
        walkEndedAt !== null
      ) {
        const created = await createWithPotty({
          dogId: dog._id,
          kind,
          pottyAt: parsedAt,
          walkStartedAt,
          walkEndedAt,
          ...(normalizedNote ? { note: normalizedNote } : {}),
          ...(kind === "pee" ? { peePlace: "outside" as const } : {}),
        });
        target = created;
      } else if (
        shouldAttach &&
        activeWalk !== null &&
        activeWalk !== undefined &&
        isPottyKind(kind)
      ) {
        const eventId = await logPotty({
          dogId: dog._id,
          walkId: activeWalk._id,
          kind,
          at: parsedAt,
          ...(kind === "pee" ? { peePlace: "outside" as const } : {}),
          ...(normalizedNote ? { note: normalizedNote } : {}),
        });
        target = { eventId };
      } else {
        const eventId = await logQuick({
          dogId: dog._id,
          kind,
          at: parsedAt,
          ...(normalizedNote ? { note: normalizedNote } : {}),
          ...(showsAmount && amountValue !== undefined
            ? { amount: amountValue }
            : {}),
          ...(kind === "pee" ? { peePlace } : {}),
        });
        target = { eventId };
      }
      const label = t(`events.${kind}`);
      clear();
      onLogged(target, label);
    } catch (caught) {
      const atError = hasErrorCode(caught, "INVALID_WALK_TIMESTAMP")
        ? t("backdate.walkTimestamp")
        : hasErrorCode(caught, "INVALID_REST_TRANSITION")
          ? t("backdate.restConflict")
          : hasErrorCode(caught, "INVALID_TIMESTAMP")
            ? t("common.timestampRange")
            : "";
      updateForm(
        atError
          ? { errors: { ...nextErrors, at: atError } }
          : {
              error: hasErrorCode(caught, "WALK_NOT_ACTIVE")
                ? t("backdate.walkInactive")
                : hasErrorCode(caught, "INVALID_WALK_INTERVAL")
                  ? t("backdate.walkOverlap")
                  : t("backdate.saveError"),
            },
      );
    } finally {
      submitting.current = false;
      updateForm({ isPending: false });
      onOperationEnd();
    }
  };

  const submitNow = (event: FormEvent<HTMLFormElement>) =>
    void submit(event, getCurrentTime());

  if (!isOpen) {
    return (
      <Button
        type="button"
        disabled={disabled}
        variant="secondary"
        className="mt-4 w-full"
        onClick={() => open(Date.now())}
      >
        {t("backdate.open")}
      </Button>
    );
  }

  return (
    <form
      aria-label={t("backdate.aria")}
      aria-busy={isPending}
      className="mt-4 rounded-xl bg-muted/60 p-4 sm:p-5"
      noValidate
      onSubmit={submitNow}
    >
      <fieldset disabled={isPending || disabled} className="m-0 border-0 p-0">
        <legend className="text-xl font-bold leading-[1.625rem]">
          {t("backdate.title")}
        </legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="backdate-kind" className="text-sm font-bold">
              {t("backdate.what")}
            </label>
            <select
              id="backdate-kind"
              value={kind}
              className="field-control mt-2 w-full"
              onChange={(event) => {
                const nextKind = event.target.value as QuickKind;
                const nextIsPotty = nextKind === "pee" || nextKind === "poop";
                updateForm({
                  kind: nextKind,
                  attachToWalk:
                    nextIsPotty &&
                    activeWalk !== null &&
                    activeWalk !== undefined &&
                    !isBeforeWalk,
                  ...(nextKind !== "meal" && nextKind !== "treat"
                    ? { amount: "", errors: { ...errors, amount: "" } }
                    : {}),
                });
              }}
            >
              {availableQuickActions.map(({ kind }) => (
                <option key={kind} value={kind}>
                  {t(`events.${kind}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="backdate-at" className="text-sm font-bold">
              {t("backdate.when")}
            </label>
            <input
              id="backdate-at"
              type="datetime-local"
              step="60"
              value={at}
              aria-invalid={Boolean(errors.at)}
              aria-describedby={
                errors.at
                  ? "backdate-timezone backdate-at-error"
                  : "backdate-timezone"
              }
              className="field-control mt-2 w-full"
              onChange={(event) => {
                const nextAt = event.target.value;
                const nextParsedAt = parseZonedDateTimeLocal(
                  nextAt,
                  dog.timezone,
                );
                updateForm({
                  at: nextAt,
                  ...(activeWalk !== null &&
                  activeWalk !== undefined &&
                  nextParsedAt !== null &&
                  nextParsedAt < activeWalk.at
                    ? { attachToWalk: false }
                    : {}),
                  errors: { ...errors, at: "" },
                });
              }}
            />
            {errors.at && (
              <p
                id="backdate-at-error"
                className="mt-2 text-sm text-destructive"
              >
                {errors.at}
              </p>
            )}
            <p
              id="backdate-timezone"
              className="mt-2 text-xs text-muted-foreground"
            >
              {t("common.timezone", { timezone: dog.timezone })}
            </p>
          </div>
        </div>

        {kind === "pee" && (
          <PeePlaceField
            id="backdate"
            value={peePlace}
            onChange={(peePlace) =>
              updateForm({
                peePlace,
                attachToWalk:
                  peePlace === "outside" &&
                  activeWalk !== null &&
                  activeWalk !== undefined &&
                  !isBeforeWalk,
                ...(peePlace === "inside" ? { reconstructWalk: false } : {}),
              })
            }
          />
        )}

        {canAttachToActiveWalk && (
          <WalkAttachmentField
            attachToWalk={attachToWalk}
            isBeforeWalk={false}
            onChange={(attachToWalk) => updateForm({ attachToWalk })}
          />
        )}

        {canReconstructWalk && (
          <div className="mt-4 border-t border-border pt-4">
            <label
              htmlFor="backdate-reconstruct-walk"
              className="flex min-h-11 items-center gap-3 text-sm font-semibold"
            >
              <input
                id="backdate-reconstruct-walk"
                type="checkbox"
                checked={reconstructWalk}
                aria-controls="backdate-reconstruct-controls"
                aria-describedby="backdate-reconstruct-help"
                className="size-5 shrink-0 accent-primary"
                onChange={(event) =>
                  updateForm({
                    reconstructWalk: event.target.checked,
                    errors: {
                      ...errors,
                      walkDuration: "",
                      walkOffset: "",
                    },
                  })
                }
              />
              {t("backdate.reconstruct")}
            </label>
            <p
              id="backdate-reconstruct-help"
              className="pl-8 text-xs text-muted-foreground"
            >
              {t("backdate.reconstructHelp")}
            </p>

            {reconstructWalk && (
              <div
                id="backdate-reconstruct-controls"
                className="mt-4 grid gap-5 sm:grid-cols-2"
              >
                <MinutePresetField
                  choice={walkOffset}
                  error={errors.walkOffset}
                  id="backdate-walk-offset"
                  label={t("backdate.walkOffset")}
                  min={0}
                  presets={walkPromptPresets}
                  onChange={(walkOffset) =>
                    updateForm({
                      walkOffset,
                      errors: { ...errors, walkOffset: "" },
                    })
                  }
                />
                <MinutePresetField
                  choice={walkDuration}
                  error={errors.walkDuration}
                  id="backdate-walk-duration"
                  label={t("backdate.walkDuration")}
                  min={1}
                  presets={walkDurationPresets}
                  onChange={(walkDuration) =>
                    updateForm({
                      walkDuration,
                      errors: { ...errors, walkDuration: "" },
                    })
                  }
                />
              </div>
            )}

            {reconstructWalk &&
              parsedAt !== null &&
              walkStartedAt !== null &&
              walkEndedAt !== null &&
              walkDurationMinutes !== null &&
              walkOffsetMinutes !== null &&
              walkDurationMinutes >= walkOffsetMinutes && (
                <p
                  role="status"
                  className="mt-4 text-sm font-medium text-foreground"
                >
                  {t("backdate.walkSummary", {
                    end: timeFormatter.format(walkEndedAt),
                    event: t(`events.${kind}`),
                    eventAt: timeFormatter.format(parsedAt),
                    start: timeFormatter.format(walkStartedAt),
                  })}
                </p>
              )}
          </div>
        )}

        <BackdateOptionalFields
          amount={amount}
          errors={errors}
          note={note}
          onAmountChange={(amount) =>
            updateForm({ amount, errors: { ...errors, amount: "" } })
          }
          onNoteChange={(note) =>
            updateForm({ note, errors: { ...errors, note: "" } })
          }
          showsAmount={showsAmount}
        />

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-destructive/25 bg-background px-4 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr]">
          <Button type="button" variant="secondary" onClick={clear}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">
            {isPending ? t("backdate.logging") : t("backdate.log")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function EarlierTimePicker({
  dog,
  onChange,
}: {
  dog: DashboardDog;
  onChange: (at: number | null) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAt, setCustomAt] = useState("");
  const [isCustomTimeOpen, setIsCustomTimeOpen] = useState(false);
  const [error, setError] = useState("");

  const selectPreset = (minutes: number) => {
    setSelectedPreset(minutes);
    setCustomAt("");
    setIsCustomTimeOpen(false);
    setError("");
    onChange(getCurrentTime() - minutes * 60_000);
  };
  const showCustomTime = () => {
    setSelectedPreset(null);
    setIsCustomTimeOpen(true);
    setError("");
    onChange(null);
  };
  const selectCustomTime = (value: string) => {
    const at = parseZonedDateTimeLocal(value, dog.timezone);
    const nextError = getTimestampError(value, at, dog, getCurrentTime(), t);
    setCustomAt(value);
    setError(nextError);
    onChange(nextError ? null : at);
  };

  return (
    <fieldset className="mt-5">
      <legend className="text-sm font-bold">{t("quick.howLongAgo")}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quickTimePresets.map((minutes) => (
          <Button
            key={minutes}
            type="button"
            variant="secondary"
            aria-pressed={selectedPreset === minutes}
            className="px-3 text-sm aria-pressed:border-primary aria-pressed:bg-secondary"
            onClick={() => selectPreset(minutes)}
          >
            {t("quick.minutesAgo", { count: minutes })}
          </Button>
        ))}
        <Button
          type="button"
          variant="secondary"
          aria-expanded={isCustomTimeOpen}
          aria-controls="earlier-custom-time"
          aria-pressed={isCustomTimeOpen}
          className="px-3 text-sm aria-pressed:border-primary aria-pressed:bg-secondary"
          onClick={showCustomTime}
        >
          {t("quick.chooseTime")}
        </Button>
      </div>

      {isCustomTimeOpen && (
        <div id="earlier-custom-time" className="mt-4">
          <label htmlFor="earlier-custom-at" className="text-sm font-bold">
            {t("quick.exactTime")}
          </label>
          <input
            id="earlier-custom-at"
            type="datetime-local"
            step="60"
            value={customAt}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? "earlier-timezone earlier-time-error" : "earlier-timezone"
            }
            className="field-control mt-2 w-full"
            onChange={(event) => selectCustomTime(event.target.value)}
          />
          <p
            id="earlier-timezone"
            className="mt-2 text-xs text-muted-foreground"
          >
            {t("common.timezone", { timezone: dog.timezone })}
          </p>
          {error && (
            <p
              id="earlier-time-error"
              role="alert"
              className="mt-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

const getIntervalMinutes = (
  startedAt: number | null,
  endedAt: number | null,
) =>
  startedAt !== null && endedAt !== null && endedAt > startedAt
    ? Math.max(1, Math.round((endedAt - startedAt) / 60_000))
    : null;

function WalkBathroomTimeline({
  durationMinutes,
  markers,
  onAdd,
  onMove,
  onRemove,
  onSelect,
  selectedMarker,
  startedAt,
  endedAt,
  timeFormatter,
}: {
  durationMinutes: number | null;
  markers: WalkPottyMarker[];
  onAdd: (kind: WalkPottyMarker["kind"]) => void;
  onMove: (offsetMinutes: number) => void;
  onRemove: () => void;
  onSelect: (id: number) => void;
  selectedMarker: WalkPottyMarker | null;
  startedAt: number | null;
  endedAt: number | null;
  timeFormatter: Intl.DateTimeFormat;
}) {
  const { t } = useTranslation("dashboard");
  const markerLabel = (marker: WalkPottyMarker) =>
    t("completeEvent.markerSummary", {
      event: t(`events.${marker.kind}`),
      offset: marker.offsetMinutes,
      time:
        startedAt === null
          ? ""
          : timeFormatter.format(startedAt + marker.offsetMinutes * 60_000),
    });

  return (
    <div className="mt-5 rounded-lg border border-border bg-muted/50 p-4">
      <h3 className="text-sm font-bold">{t("completeEvent.bathroomTitle")}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {t("completeEvent.bathroomHelp")}
      </p>

      <div
        role="group"
        aria-label={t("completeEvent.timelineAria")}
        className="mt-4"
      >
        {durationMinutes === null ? (
          <p className="rounded-lg bg-card px-3 py-4 text-center text-xs text-muted-foreground">
            {t("completeEvent.timelineUnavailable")}
          </p>
        ) : (
          <>
            <div className="flex justify-between gap-3 text-xs font-medium text-muted-foreground">
              <span>
                {startedAt === null ? "" : timeFormatter.format(startedAt)}
              </span>
              <span>
                {endedAt === null ? "" : timeFormatter.format(endedAt)}
              </span>
            </div>
            <div className="relative mx-3 mt-4 h-10">
              <div className="absolute inset-x-0 top-4 h-2 rounded-full bg-primary/20" />
              <span className="absolute left-0 top-3 size-4 -translate-x-1/2 rounded-full border-2 border-card bg-primary" />
              <span className="absolute right-0 top-3 size-4 translate-x-1/2 rounded-full border-2 border-card bg-primary" />
              {markers.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  data-activity-kind={marker.kind}
                  aria-label={markerLabel(marker)}
                  aria-pressed={selectedMarker?.id === marker.id}
                  title={markerLabel(marker)}
                  className="absolute top-0 grid size-10 -translate-x-1/2 place-items-center rounded-full border-2 border-card bg-[var(--activity-ink)] text-sm shadow-[var(--elevation-1)] outline-offset-2 ring-primary transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring aria-pressed:ring-2"
                  style={{
                    left: `${(marker.offsetMinutes / durationMinutes) * 100}%`,
                  }}
                  onClick={() => onSelect(marker.id)}
                >
                  <span aria-hidden="true">
                    {marker.kind === "pee" ? "💧" : "💩"}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {markers.length === 0 ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t("completeEvent.emptyBathroom")}
          </p>
        ) : (
          <ol
            aria-label={t("completeEvent.eventsAria")}
            className="mt-3 flex flex-wrap gap-2"
          >
            {markers.map((marker) => (
              <li key={marker.id}>
                <button
                  type="button"
                  data-activity-kind={marker.kind}
                  aria-pressed={selectedMarker?.id === marker.id}
                  className="min-h-9 rounded-full bg-[var(--activity-surface)] px-3 text-xs font-semibold text-[var(--activity-ink)] ring-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:ring-2"
                  onClick={() => onSelect(marker.id)}
                >
                  {markerLabel(marker)}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={
            durationMinutes === null || markers.length >= maxCompleteWalkEvents
          }
          className="px-3 text-sm"
          onClick={() => onAdd("pee")}
        >
          <span aria-hidden="true">💧</span>
          {t("completeEvent.addPee")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={
            durationMinutes === null || markers.length >= maxCompleteWalkEvents
          }
          className="px-3 text-sm"
          onClick={() => onAdd("poop")}
        >
          <span aria-hidden="true">💩</span>
          {t("completeEvent.addPoop")}
        </Button>
      </div>

      {selectedMarker !== null && durationMinutes !== null && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label
                htmlFor="complete-event-marker-position"
                className="text-sm font-bold"
              >
                {t("completeEvent.moveSelected")}
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {markerLabel(selectedMarker)}
              </p>
            </div>
            <Button
              type="button"
              variant="quiet"
              className="min-h-9 shrink-0 px-2 text-xs text-destructive"
              onClick={onRemove}
            >
              {t("completeEvent.remove")}
            </Button>
          </div>
          <input
            id="complete-event-marker-position"
            type="range"
            min="0"
            max={durationMinutes}
            step="1"
            value={selectedMarker.offsetMinutes}
            aria-valuetext={markerLabel(selectedMarker)}
            className="mt-3 h-11 w-full accent-primary"
            onChange={(event) => onMove(Number(event.target.value))}
          />
        </div>
      )}
    </div>
  );
}

function CompleteEventChoices({
  disabled,
  onOpen,
}: {
  disabled: boolean;
  onOpen: (kind: CompleteEventKind) => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        disabled={disabled}
        data-activity-kind="sleep"
        className="group min-h-20 rounded-lg border border-border bg-[var(--activity-surface)] px-4 py-3 text-left transition-colors duration-150 hover:border-[var(--activity-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => onOpen("sleep")}
      >
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="text-xl text-[var(--activity-ink)]"
          >
            ☾
          </span>
          <span>
            <strong className="block text-sm">
              {t("completeEvent.sleepAction")}
            </strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t("completeEvent.sleepHint")}
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        disabled={disabled}
        data-activity-kind="walk"
        className="group min-h-20 rounded-lg border border-border bg-[var(--activity-surface)] px-4 py-3 text-left transition-colors duration-150 hover:border-[var(--activity-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => onOpen("walk")}
      >
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="text-xl text-[var(--activity-ink)]"
          >
            ↗
          </span>
          <span>
            <strong className="block text-sm">
              {t("completeEvent.walkAction")}
            </strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t("completeEvent.walkHint")}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

function CompleteEventIntervalFields({
  dog,
  durationMinutes,
  endedAt,
  errors,
  locale,
  onEndedAtChange,
  onStartedAtChange,
  startedAt,
}: {
  dog: DashboardDog;
  durationMinutes: number | null;
  endedAt: string;
  errors: CompleteEventState["errors"];
  locale: "en" | "sk";
  onEndedAtChange: (value: string) => void;
  onStartedAtChange: (value: string) => void;
  startedAt: string;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="complete-event-startedAt"
            className="text-sm font-bold"
          >
            {t("completeEvent.startedAt")}
          </label>
          <input
            id="complete-event-startedAt"
            type="datetime-local"
            step="60"
            value={startedAt}
            aria-invalid={Boolean(errors.startedAt)}
            aria-describedby={
              errors.startedAt
                ? "complete-event-timezone complete-event-startedAt-error"
                : "complete-event-timezone"
            }
            className="field-control mt-2 w-full"
            onChange={(event) => onStartedAtChange(event.target.value)}
          />
          {errors.startedAt && (
            <p
              id="complete-event-startedAt-error"
              className="mt-2 text-sm text-destructive"
            >
              {errors.startedAt}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="complete-event-endedAt" className="text-sm font-bold">
            {t("completeEvent.endedAt")}
          </label>
          <input
            id="complete-event-endedAt"
            type="datetime-local"
            step="60"
            value={endedAt}
            aria-invalid={Boolean(errors.endedAt)}
            aria-describedby={
              errors.endedAt
                ? "complete-event-timezone complete-event-endedAt-error"
                : "complete-event-timezone"
            }
            className="field-control mt-2 w-full"
            onChange={(event) => onEndedAtChange(event.target.value)}
          />
          {errors.endedAt && (
            <p
              id="complete-event-endedAt-error"
              className="mt-2 text-sm text-destructive"
            >
              {errors.endedAt}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p id="complete-event-timezone">
          {t("common.timezone", { timezone: dog.timezone })}
        </p>
        {durationMinutes !== null && (
          <p>
            {t("completeEvent.duration", {
              duration: formatElapsed(durationMinutes * 60_000, locale),
            })}
          </p>
        )}
      </div>
    </>
  );
}

function CompleteEventBackfill({
  disabled,
  dog,
  onLogged,
  onOperationEnd,
  onOperationStart,
  timeFormatter,
}: {
  disabled: boolean;
  dog: DashboardDog;
  onLogged: (message: string) => void;
  onOperationEnd: () => void;
  onOperationStart: () => boolean;
  timeFormatter: Intl.DateTimeFormat;
}) {
  const { i18n, t } = useTranslation("dashboard");
  const logRestInterval = useMutation(api.events.logRestInterval);
  const createCompleteWalk = useMutation(api.walks.createComplete);
  const markerId = useRef(0);
  const submitting = useRef(false);
  const [form, updateForm] = useReducer(
    mergeCompleteEventState,
    initialCompleteEventState,
  );
  const {
    endedAt,
    errors,
    formError,
    isPending,
    kind,
    markers,
    selectedMarkerId,
    startedAt,
  } = form;
  const parsedStartedAt = parseZonedDateTimeLocal(startedAt, dog.timezone);
  const parsedEndedAt = parseZonedDateTimeLocal(endedAt, dog.timezone);
  const durationMinutes = getIntervalMinutes(parsedStartedAt, parsedEndedAt);
  const selectedMarker =
    markers.find(({ id }) => id === selectedMarkerId) ?? null;
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);

  const reset = () => updateForm(initialCompleteEventState);
  const open = (nextKind: CompleteEventKind) => {
    const now = getCurrentTime();
    const defaultMinutes = nextKind === "sleep" ? 60 : 30;
    updateForm({
      ...initialCompleteEventState,
      kind: nextKind,
      startedAt:
        formatZonedDateTimeLocal(now - defaultMinutes * 60_000, dog.timezone) ??
        "",
      endedAt: formatZonedDateTimeLocal(now, dog.timezone) ?? "",
    });
  };
  const clampMarkers = (nextStartedAt: string, nextEndedAt: string) => {
    const nextDuration = getIntervalMinutes(
      parseZonedDateTimeLocal(nextStartedAt, dog.timezone),
      parseZonedDateTimeLocal(nextEndedAt, dog.timezone),
    );
    if (nextDuration === null) return;
    updateForm({
      markers: markers.map((marker) => ({
        ...marker,
        offsetMinutes: Math.min(marker.offsetMinutes, nextDuration),
      })),
    });
  };
  const changeStartedAt = (value: string) => {
    updateForm({
      startedAt: value,
      errors: { ...errors, startedAt: "" },
    });
    clampMarkers(value, endedAt);
  };
  const changeEndedAt = (value: string) => {
    updateForm({
      endedAt: value,
      errors: { ...errors, endedAt: "" },
    });
    clampMarkers(startedAt, value);
  };
  const addMarker = (markerKind: WalkPottyMarker["kind"]) => {
    if (durationMinutes === null || markers.length >= maxCompleteWalkEvents) {
      return;
    }
    markerId.current += 1;
    const marker = {
      id: markerId.current,
      kind: markerKind,
      offsetMinutes: Math.round(
        durationMinutes * (markerKind === "pee" ? 1 / 3 : 2 / 3),
      ),
    };
    updateForm({
      markers: [...markers, marker],
      selectedMarkerId: marker.id,
    });
  };
  const moveSelectedMarker = (offsetMinutes: number) => {
    if (selectedMarkerId === null) return;
    updateForm({
      markers: markers.map((marker) =>
        marker.id === selectedMarkerId ? { ...marker, offsetMinutes } : marker,
      ),
    });
  };
  const removeSelectedMarker = () => {
    if (selectedMarkerId === null) return;
    const next = markers.filter(({ id }) => id !== selectedMarkerId);
    updateForm({
      markers: next,
      selectedMarkerId: next[0]?.id ?? null,
    });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (kind === null || submitting.current) return;
    const now = getCurrentTime();
    const nextErrors = {
      startedAt: getTimestampError(startedAt, parsedStartedAt, dog, now, t),
      endedAt:
        getTimestampError(endedAt, parsedEndedAt, dog, now, t) ||
        (parsedStartedAt !== null &&
        parsedEndedAt !== null &&
        parsedEndedAt <= parsedStartedAt
          ? t("completeEvent.endAfterStart")
          : ""),
    };
    updateForm({ errors: nextErrors, formError: "" });
    const firstError = (["startedAt", "endedAt"] as const).find(
      (field) => nextErrors[field],
    );
    if (firstError) {
      document.getElementById(`complete-event-${firstError}`)?.focus();
      return;
    }
    if (parsedStartedAt === null || parsedEndedAt === null) return;
    if (!onOperationStart()) return;

    submitting.current = true;
    updateForm({ isPending: true });
    try {
      if (kind === "sleep") {
        await logRestInterval({
          dogId: dog._id,
          startedAt: parsedStartedAt,
          endedAt: parsedEndedAt,
        });
      } else {
        await createCompleteWalk({
          dogId: dog._id,
          walkStartedAt: parsedStartedAt,
          walkEndedAt: parsedEndedAt,
          pottyEvents: markers.map((marker) => ({
            kind: marker.kind,
            at: parsedStartedAt + marker.offsetMinutes * 60_000,
          })),
        });
      }
      const event = t(
        kind === "sleep"
          ? "completeEvent.sleepAction"
          : "completeEvent.walkAction",
      );
      reset();
      onLogged(t("completeEvent.logged", { dogName: dog.name, event }));
    } catch (caught) {
      updateForm({
        formError: hasErrorCode(caught, "INVALID_REST_TRANSITION")
          ? t("completeEvent.restConflict")
          : hasErrorCode(caught, "INVALID_WALK_INTERVAL")
            ? t("completeEvent.walkOverlap")
            : hasErrorCode(caught, "WALK_EVENT_LIMIT")
              ? t("completeEvent.eventLimit")
              : hasErrorCode(caught, "INVALID_TIMESTAMP") ||
                  hasErrorCode(caught, "INVALID_WALK_TIMESTAMP")
                ? t("common.timestampRange")
                : t("completeEvent.saveError"),
      });
    } finally {
      submitting.current = false;
      updateForm({ isPending: false });
      onOperationEnd();
    }
  };

  return (
    <section
      aria-labelledby="complete-event-title"
      className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div>
        <h2 id="complete-event-title" className="text-base font-bold">
          {t("completeEvent.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("completeEvent.help")}
        </p>
      </div>

      {kind === null ? (
        <CompleteEventChoices disabled={disabled} onOpen={open} />
      ) : (
        <form
          aria-label={t(
            kind === "sleep"
              ? "completeEvent.sleepAria"
              : "completeEvent.walkAria",
          )}
          aria-busy={isPending}
          className="mt-4 border-t border-border pt-4"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <fieldset disabled={disabled || isPending}>
            <legend className="text-lg font-bold">
              {t(
                kind === "sleep"
                  ? "completeEvent.sleepTitle"
                  : "completeEvent.walkTitle",
              )}
            </legend>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                kind === "sleep"
                  ? "completeEvent.sleepDescription"
                  : "completeEvent.walkDescription",
                { dogName: dog.name },
              )}
            </p>
            <CompleteEventIntervalFields
              dog={dog}
              durationMinutes={durationMinutes}
              endedAt={endedAt}
              errors={errors}
              locale={locale}
              onEndedAtChange={changeEndedAt}
              onStartedAtChange={changeStartedAt}
              startedAt={startedAt}
            />

            {kind === "walk" && (
              <WalkBathroomTimeline
                durationMinutes={durationMinutes}
                endedAt={parsedEndedAt}
                markers={markers}
                onAdd={addMarker}
                onMove={moveSelectedMarker}
                onRemove={removeSelectedMarker}
                onSelect={(id) => updateForm({ selectedMarkerId: id })}
                selectedMarker={selectedMarker}
                startedAt={parsedStartedAt}
                timeFormatter={timeFormatter}
              />
            )}

            {formError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-destructive/25 bg-background px-4 py-3 text-sm text-destructive"
              >
                {formError}
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr]">
              <Button type="button" variant="secondary" onClick={reset}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                {isPending
                  ? t("common.saving")
                  : t(
                      kind === "sleep"
                        ? "completeEvent.saveSleep"
                        : "completeEvent.saveWalk",
                    )}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}

function QuickLogSection({
  activeWalk,
  dog,
  error,
  feedback,
  hasUndo,
  latest,
  onLog,
  onBackdated,
  onBackdateOperationEnd,
  onBackdateOperationStart,
  onError,
  onUndo,
  onStartWalkForPotty,
  onWalkDiarySaved,
  onWalkOperationStart,
  onWalkTransition,
  now,
  pendingOperation,
  sleepState,
  summary,
  timeFormatter,
  activityTypes,
  trainingCommands,
}: {
  activeWalk: ActiveWalk | undefined;
  dog: DashboardDog;
  error: string;
  feedback: string;
  hasUndo: boolean;
  latest: LatestEvents | undefined;
  onBackdated: (target: UndoTarget, label: string) => void;
  onBackdateOperationEnd: () => void;
  onBackdateOperationStart: () => boolean;
  onError: (message: string) => void;
  onLog: (
    kind: QuickKind,
    label: string,
    at: number,
    peePlace?: PeePlace,
    allowWalkAttachment?: boolean,
  ) => Promise<boolean>;
  onStartWalkForPotty: (
    kind: "pee" | "poop",
    label: string,
    at: number,
    minutesAgo: number,
  ) => Promise<boolean>;
  onUndo: () => void;
  onWalkDiarySaved: () => void;
  onWalkOperationStart: (
    operation: "walk-diary" | "walk-end" | "walk-start",
  ) => boolean;
  onWalkTransition: (message: string) => void;
  now: number | null;
  pendingOperation: PendingOperation;
  sleepState: SleepState | undefined;
  summary: DailySummary;
  timeFormatter: Intl.DateTimeFormat;
  activityTypes: ActivityTypes | undefined;
  trainingCommands: TrainingCommands | undefined;
}) {
  const { t } = useTranslation("dashboard");
  const bathroomOpenerRef = useRef<HTMLButtonElement>(null);
  const bathroomTrayRef = useRef<HTMLDivElement>(null);
  const earlierDialogRef = useRef<HTMLDialogElement>(null);
  const restDialogRef = useRef<HTMLDialogElement>(null);
  const walkPromptDialogRef = useRef<HTMLDialogElement>(null);
  const [isBathroomTrayOpen, setIsBathroomTrayOpen] = useState(false);
  const [isEarlier, setIsEarlier] = useState(false);
  const [earlierAction, setEarlierAction] = useState<EarlierAction | null>(
    null,
  );
  const [earlierAt, setEarlierAt] = useState<number | null>(null);
  const [walkPrompt, setWalkPrompt] = useState<WalkPrompt | null>(null);
  const walkPromptAction = walkPrompt?.action ?? null;
  const isBusy = pendingOperation !== null;
  const activeWalkKey = activeWalk?._id ?? "no-active-walk";
  const log = (action: EarlierAction) => {
    if (!isEarlier) {
      const at = getCurrentTime();
      if (
        activeWalk === null &&
        isPottyKind(action.kind) &&
        (action.kind === "poop" || action.peePlace === "outside")
      ) {
        onError("");
        setWalkPrompt({ action: { ...action, at }, step: "question" });
        walkPromptDialogRef.current?.showModal();
        return;
      }
      void onLog(action.kind, action.label, at, action.peePlace);
      return;
    }
    setEarlierAction(action);
    setEarlierAt(null);
    earlierDialogRef.current?.showModal();
  };
  const logBathroom = (action: EarlierAction) => {
    bathroomTrayRef.current?.hidePopover?.();
    setIsBathroomTrayOpen(false);
    bathroomOpenerRef.current?.focus();
    log(action);
  };
  useEffect(() => {
    const opener = bathroomOpenerRef.current;
    const tray = bathroomTrayRef.current;
    if (opener === null || tray === null) return;
    if (!isBathroomTrayOpen) {
      tray.hidePopover?.();
      return;
    }
    const openerRect = opener.getBoundingClientRect();
    tray.showPopover?.();
    const trayRect = tray.getBoundingClientRect();
    const left = Math.min(
      window.innerWidth - trayRect.width - 16,
      Math.max(16, openerRect.right - trayRect.width),
    );
    const below = openerRect.bottom + 8;
    const top =
      below + trayRect.height <= window.innerHeight - 16
        ? below
        : Math.max(16, openerRect.top - trayRect.height - 8);
    tray.style.setProperty("--bathroom-tray-left", `${left}px`);
    tray.style.setProperty("--bathroom-tray-top", `${top}px`);
    tray.querySelector<HTMLButtonElement>("button")?.focus();
  }, [isBathroomTrayOpen]);
  const logRest = (kind: "sleep" | "wake") => {
    restDialogRef.current?.close();
    log({ kind, label: t(`events.${kind}`) });
  };
  const closeEarlierDialog = () => earlierDialogRef.current?.close();
  const resetEarlierDialog = () => {
    setEarlierAction(null);
    setEarlierAt(null);
  };
  const closeWalkPrompt = () => walkPromptDialogRef.current?.close();
  const resetWalkPrompt = () => {
    setWalkPrompt(null);
    onError("");
  };
  const logWithoutWalk = async () => {
    if (walkPromptAction === null) return;
    const saved = await onLog(
      walkPromptAction.kind,
      walkPromptAction.label,
      walkPromptAction.at,
      walkPromptAction.peePlace,
      false,
    );
    if (saved) closeWalkPrompt();
  };
  const startWalkForPotty = async (minutesAgo: number) => {
    if (walkPromptAction === null || !isPottyKind(walkPromptAction.kind)) {
      return;
    }
    const saved = await onStartWalkForPotty(
      walkPromptAction.kind,
      walkPromptAction.label,
      walkPromptAction.at,
      minutesAgo,
    );
    if (saved) closeWalkPrompt();
  };
  useEffect(() => {
    if (walkPrompt?.step !== "start" || !walkPromptDialogRef.current?.open) {
      return;
    }
    const frame = window.requestAnimationFrame(() =>
      document.getElementById("walk-prompt-minute-1")?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [walkPrompt?.step]);
  const submitEarlier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (earlierAction === null || earlierAt === null) return;
    void onLog(
      earlierAction.kind,
      earlierAction.label,
      earlierAt,
      earlierAction.peePlace,
    );
    closeEarlierDialog();
  };
  const restKind = sleepState?.state === "asleep" ? "wake" : "sleep";
  const restGlyph =
    sleepState?.state === "asleep"
      ? "wake"
      : sleepState?.state === "awake"
        ? "sleep"
        : "rest";
  const restDetail = (
    <>
      {summary.rest.startedAt && summary.rest.state
        ? t(`daily.rest.${summary.rest.state}At`, {
            time: summary.rest.startedAt,
          })
        : t("daily.rest.none")}
      {summary.restToday && (
        <>
          <span aria-hidden="true"> · </span>
          {t("daily.rest.today", { duration: summary.restToday })}
        </>
      )}
    </>
  );
  return (
    <section aria-labelledby="quick-log-title" className="min-w-0 py-6 sm:py-8">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1
            id="quick-log-title"
            className="text-balance text-[1.75rem] font-bold leading-[2.125rem]"
          >
            {t("daily.title", { dogName: dog.name })}
          </h1>
          <p
            role={summary.isLoading ? "status" : undefined}
            className="mt-1 text-sm font-medium text-muted-foreground"
          >
            {summary.isLoading
              ? t("daily.loading")
              : t("daily.meta", {
                  formattedCount: summary.activityCount ?? "0",
                  time: summary.updatedAt ?? "",
                })}
          </p>
        </div>
        <fieldset disabled={pendingOperation !== null}>
          <legend className="sr-only">{t("quick.when")}</legend>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-input bg-input sm:min-w-56">
            <Button
              type="button"
              variant={!isEarlier ? "primary" : "secondary"}
              aria-pressed={!isEarlier}
              className="rounded-none border-0 px-3 text-sm"
              onClick={() => setIsEarlier(false)}
            >
              {t("quick.now")}
            </Button>
            <Button
              type="button"
              variant={isEarlier ? "primary" : "secondary"}
              aria-pressed={isEarlier}
              className="rounded-none border-0 px-3 text-sm"
              onClick={() => setIsEarlier(true)}
            >
              {t("quick.earlier")}
            </Button>
          </div>
        </fieldset>
      </div>

      <div
        role="group"
        aria-label={t("daily.actionsAria")}
        className="grid overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-2"
      >
        <DailyRow
          actions={
            <Button
              type="button"
              disabled={isBusy}
              variant="secondary"
              size="icon"
              aria-label={t("quick.logAria", { event: t("events.meal") })}
              aria-describedby="quick-state-meal"
              aria-busy={pendingOperation === "meal"}
              className={rowActionClassName}
              onClick={() => log({ kind: "meal", label: t("events.meal") })}
            >
              <span aria-hidden="true">+</span>
            </Button>
          }
          className="lg:border-r"
          context={latest?.meal ? t("daily.meals.since") : ""}
          detail={
            <span>
              {summary.meal.nextLabel && (
                <>
                  {t("daily.meals.next", { label: summary.meal.nextLabel })}
                  <span aria-hidden="true"> · </span>
                </>
              )}
              <strong className="font-bold text-foreground">
                {summary.meal.nextValue}
              </strong>
            </span>
          }
          icon="🍽️"
          metric={summary.meal.elapsed}
          metricLabel={t("timers.sinceMeal")}
          statusId="quick-state-meal"
          title={t("daily.meals.title")}
        />

        <DailyRow
          actions={
            <Button
              ref={bathroomOpenerRef}
              type="button"
              disabled={isBusy || activeWalk === undefined}
              variant="secondary"
              size="icon"
              aria-label={t(
                isBathroomTrayOpen
                  ? "daily.bathroom.closeAria"
                  : "daily.bathroom.logAria",
              )}
              aria-describedby="quick-state-pee"
              aria-expanded={isBathroomTrayOpen}
              aria-controls="bathroom-action-tray"
              aria-busy={
                pendingOperation === "pee" || pendingOperation === "poop"
              }
              className={rowActionClassName}
              onClick={() => setIsBathroomTrayOpen((isOpen) => !isOpen)}
            >
              <span
                aria-hidden="true"
                className={`transition-transform duration-150 ease-[var(--ease-out)] motion-reduce:transition-none ${isBathroomTrayOpen ? "rotate-180" : ""}`}
              >
                <RowActionGlyph kind="chevron" />
              </span>
            </Button>
          }
          context={latest?.pee ? t("daily.bathroom.since") : ""}
          detail={t("daily.bathroom.poop", { elapsed: summary.poop })}
          icon="🪴"
          metric={summary.pee}
          metricLabel={t("timers.sincePee")}
          statusId="quick-state-pee"
          title={t("daily.bathroom.title")}
        />

        {summary.water && (
          <DailyRow
            actions={
              <Button
                type="button"
                disabled={isBusy}
                variant="secondary"
                size="icon"
                aria-label={t("quick.logAria", { event: t("events.water") })}
                aria-describedby="quick-state-water"
                aria-busy={pendingOperation === "water"}
                className={rowActionClassName}
                onClick={() => log({ kind: "water", label: t("events.water") })}
              >
                <span aria-hidden="true">+</span>
              </Button>
            }
            className="lg:border-r"
            context={latest?.water ? t("daily.water.since") : ""}
            detail={t("daily.water.detail", {
              formattedCount: summary.water.count ?? t("common.checking"),
              next: summary.water.next,
            })}
            icon="💧"
            metric={summary.water.elapsed}
            metricLabel={t("daily.water.metric")}
            statusId="quick-state-water"
            title={t("daily.water.title")}
          />
        )}

        <DailyRow
          actions={
            <Button
              type="button"
              disabled={isBusy || latest === undefined}
              variant="secondary"
              size="icon"
              aria-label={
                sleepState === null
                  ? t("daily.rest.setAria")
                  : t("quick.logAria", {
                      event: t(`events.${restKind}`),
                    })
              }
              aria-describedby="quick-state-rest"
              aria-haspopup={sleepState === null ? "dialog" : undefined}
              aria-controls={
                sleepState === null ? "rest-state-dialog" : undefined
              }
              aria-busy={pendingOperation === restKind}
              className={rowActionClassName}
              onClick={() =>
                sleepState === null
                  ? restDialogRef.current?.showModal()
                  : log({ kind: restKind, label: t(`events.${restKind}`) })
              }
            >
              <RowActionGlyph kind={restGlyph} />
            </Button>
          }
          className={summary.water ? "" : "lg:border-r"}
          context={summary.rest.state ? t(`timers.${summary.rest.state}`) : ""}
          detail={restDetail}
          icon="🌙"
          metric={summary.rest.elapsed}
          metricLabel={t("timers.restState")}
          statusId="quick-state-rest"
          title={t("daily.rest.title")}
        />

        <WalkControls
          key={`walk-controls-${activeWalkKey}`}
          activeWalk={activeWalk}
          className={
            summary.water
              ? "lg:col-span-2 lg:grid-cols-[2.125rem_minmax(0,18rem)_auto_1fr]"
              : ""
          }
          dog={dog}
          isEarlier={isEarlier}
          now={now}
          onError={onError}
          onDiarySaved={onWalkDiarySaved}
          onOperationEnd={onBackdateOperationEnd}
          onOperationStart={onWalkOperationStart}
          onTransition={onWalkTransition}
          pendingOperation={pendingOperation}
          summary={summary.walk}
          timeFormatter={timeFormatter}
        />

        <div className="border-border bg-muted/70 px-4 py-4 lg:col-span-2 sm:px-5">
          <div className="mb-3 min-w-0">
            <h2 className="text-sm font-bold">{t("daily.more.title")}</h2>
            <p className="text-xs font-medium leading-4 text-muted-foreground">
              {t("daily.more.hint")}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">
            <button
              type="button"
              disabled={isBusy}
              aria-label={t("quick.logAria", { event: t("events.treat") })}
              aria-describedby="quick-state-treat"
              aria-busy={pendingOperation === "treat"}
              className="group grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_1.375rem] items-center gap-x-2 gap-y-0.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors duration-150 hover:border-primary hover:bg-accent active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 sm:grid-cols-[1.75rem_minmax(0,1fr)_1.375rem]"
              onClick={() => log({ kind: "treat", label: t("events.treat") })}
            >
              <span
                aria-hidden="true"
                className="hidden text-center text-base sm:block"
              >
                🦴
              </span>
              <strong className="min-w-0 text-sm leading-5 [overflow-wrap:anywhere]">
                {t("events.treat")}
              </strong>
              <span
                aria-hidden="true"
                className="grid size-[1.375rem] place-items-center rounded-full bg-secondary text-sm font-bold text-primary"
              >
                +
              </span>
              <span
                id="quick-state-treat"
                className="col-span-2 block min-w-0 text-xs font-medium leading-4 text-muted-foreground sm:col-span-1 sm:col-start-2"
              >
                {summary.treat}
              </span>
            </button>
            <EnrichmentQuickLog
              activityTypes={activityTypes}
              disabled={isBusy}
              dog={dog}
              isEarlier={isEarlier}
              today={summary.enrichment}
            />
            <TrainingQuickLog
              commands={trainingCommands}
              disabled={isBusy}
              dog={dog}
              isEarlier={isEarlier}
              today={summary.training}
            />
          </div>
        </div>
      </div>

      <div
        id="bathroom-action-tray"
        ref={bathroomTrayRef}
        popover="auto"
        role="group"
        aria-label={t("daily.bathroom.actionsAria")}
        hidden={!isBathroomTrayOpen}
        className="fixed inset-auto left-[var(--bathroom-tray-left)] top-[var(--bathroom-tray-top)] m-0 grid h-auto w-52 grid-cols-1 gap-1 rounded-lg border border-border bg-card p-1.5 text-foreground shadow-[var(--elevation-2)]"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          setIsBathroomTrayOpen(false);
          bathroomOpenerRef.current?.focus();
        }}
        onToggle={(event) => {
          if (event.newState === "closed") setIsBathroomTrayOpen(false);
        }}
      >
        <Button
          type="button"
          disabled={isBusy}
          variant="quiet"
          aria-label={t("quick.logPeeAria", {
            place: t("peePlace.inside"),
          })}
          className="w-full justify-start px-3 py-2 text-left text-sm"
          onClick={() =>
            logBathroom({
              kind: "pee",
              label: t("events.pee"),
              peePlace: "inside",
            })
          }
        >
          {t("daily.bathroom.peeInside")}
        </Button>
        <Button
          type="button"
          disabled={isBusy}
          variant="quiet"
          aria-label={t("quick.logPeeAria", {
            place: t("peePlace.outside"),
          })}
          className="w-full justify-start px-3 py-2 text-left text-sm"
          onClick={() =>
            logBathroom({
              kind: "pee",
              label: t("events.pee"),
              peePlace: "outside",
            })
          }
        >
          {t("daily.bathroom.peeOutside")}
        </Button>
        <Button
          type="button"
          disabled={isBusy}
          variant="quiet"
          aria-label={t("quick.logAria", { event: t("events.poop") })}
          className="w-full justify-start px-3 py-2 text-left text-sm"
          onClick={() => logBathroom({ kind: "poop", label: t("events.poop") })}
        >
          {t("events.poop")}
        </Button>
      </div>

      <dialog
        id="rest-state-dialog"
        ref={restDialogRef}
        aria-labelledby="rest-state-title"
        aria-describedby="rest-state-description"
        className="m-auto w-[min(24rem,calc(100%-2rem))] rounded-xl bg-card p-0 text-foreground shadow-[var(--elevation-2)] backdrop:bg-foreground/40"
      >
        <div className="p-5 sm:p-6">
          <h3 id="rest-state-title" className="text-xl font-bold">
            {t("daily.rest.title")}
          </h3>
          <p
            id="rest-state-description"
            className="mt-2 text-sm text-muted-foreground"
          >
            {t("daily.rest.choose")}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button
              type="button"
              disabled={isBusy}
              variant="secondary"
              aria-label={t("quick.logAria", { event: t("events.wake") })}
              onClick={() => logRest("wake")}
            >
              <RowActionGlyph kind="wake" />
              {t("timers.awake")}
            </Button>
            <Button
              type="button"
              disabled={isBusy}
              variant="secondary"
              aria-label={t("quick.logAria", { event: t("events.sleep") })}
              onClick={() => logRest("sleep")}
            >
              <RowActionGlyph kind="sleep" />
              {t("timers.asleep")}
            </Button>
          </div>
          <Button
            type="button"
            variant="quiet"
            className="mt-2 w-full"
            onClick={() => restDialogRef.current?.close()}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </dialog>

      <dialog
        ref={walkPromptDialogRef}
        aria-busy={isBusy}
        aria-labelledby="walk-prompt-title"
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl bg-card p-0 text-foreground shadow-[var(--elevation-2)] backdrop:bg-foreground/40"
        onClose={resetWalkPrompt}
      >
        {walkPromptAction && (
          <div className="p-5 sm:p-6">
            {walkPrompt?.step === "question" ? (
              <>
                <h3 id="walk-prompt-title" className="text-xl font-bold">
                  {t("walkPrompt.title")}
                </h3>
                {error && (
                  <p role="alert" className="mt-4 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    disabled={isBusy}
                    variant="secondary"
                    aria-busy={isBusy}
                    onClick={() => void logWithoutWalk()}
                  >
                    {isBusy ? t("backdate.logging") : t("walkPrompt.no")}
                  </Button>
                  <Button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      setWalkPrompt({
                        action: walkPromptAction,
                        step: "start",
                      })
                    }
                  >
                    {t("walkPrompt.yes")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 id="walk-prompt-title" className="text-xl font-bold">
                  {t("walkPrompt.whenStarted")}
                </h3>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {walkPromptPresets.map((minutes) => (
                    <Button
                      key={minutes}
                      id={`walk-prompt-minute-${minutes}`}
                      type="button"
                      disabled={isBusy}
                      variant="secondary"
                      className="px-3 text-sm"
                      onClick={() => void startWalkForPotty(minutes)}
                    >
                      {t("walkPrompt.minutesAgo", { count: minutes })}
                    </Button>
                  ))}
                </div>
                {isBusy && (
                  <p role="status" className="mt-4 text-sm">
                    {t("walkPrompt.starting")}
                  </p>
                )}
                {error && (
                  <p role="alert" className="mt-4 text-sm text-destructive">
                    {error}
                  </p>
                )}
              </>
            )}
            <Button
              type="button"
              disabled={isBusy}
              variant="quiet"
              className="mt-2 w-full"
              onClick={closeWalkPrompt}
            >
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </dialog>

      <dialog
        ref={earlierDialogRef}
        aria-labelledby="earlier-dialog-title"
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl bg-card p-0 text-foreground shadow-[var(--elevation-2)] backdrop:bg-foreground/40"
        onClose={resetEarlierDialog}
      >
        {earlierAction && (
          <form className="p-5 sm:p-6" onSubmit={submitEarlier}>
            <h3 id="earlier-dialog-title" className="text-xl font-bold">
              {t("quick.earlierTitle", { event: earlierAction.label })}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("quick.earlierDescription", { event: earlierAction.label })}
            </p>
            <EarlierTimePicker dog={dog} onChange={setEarlierAt} />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={closeEarlierDialog}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={earlierAt === null}>
                {t("quick.logEarlier", { event: earlierAction.label })}
              </Button>
            </div>
          </form>
        )}
      </dialog>

      {isEarlier && (
        <CompleteEventBackfill
          disabled={isBusy}
          dog={dog}
          onLogged={onWalkTransition}
          onOperationEnd={onBackdateOperationEnd}
          onOperationStart={onBackdateOperationStart}
          timeFormatter={timeFormatter}
        />
      )}

      <BackdateForm
        key={`backdate-${activeWalkKey}`}
        activeWalk={activeWalk}
        disabled={isBusy}
        dog={dog}
        onLogged={onBackdated}
        onOperationEnd={onBackdateOperationEnd}
        onOperationStart={onBackdateOperationStart}
        timeFormatter={timeFormatter}
      />

      {error && walkPromptAction === null && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/25 bg-background px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {(feedback || hasUndo) && (
        <div className="mt-5 flex min-h-12 items-center justify-between gap-3 border-t border-border py-3 text-sm">
          <span role="status">{feedback || t("quick.fallbackUndo")}</span>
          {hasUndo && (
            <Button
              type="button"
              disabled={isBusy}
              variant="quiet"
              className="shrink-0 text-sm"
              onClick={onUndo}
            >
              {pendingOperation === "undo"
                ? t("quick.undoing")
                : t("quick.undo")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function EnrichmentQuickLog({
  activityTypes,
  disabled,
  dog,
  isEarlier,
  today,
}: {
  activityTypes: ActivityTypes | undefined;
  disabled: boolean;
  dog: DashboardDog;
  isEarlier: boolean;
  today: TodayActivities;
}) {
  const { i18n, t } = useTranslation("dashboard");
  const locale = resolveBrowserLocale(i18n.languages);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const logPlays = useMutation(api.activityTypes.logPlays);
  const active = useMemo(
    () => activityTypes?.filter(({ isArchived }) => !isArchived) ?? [],
    [activityTypes],
  );
  const activeIds = useMemo(
    () => new Set(active.map(({ _id }) => _id)),
    [active],
  );
  const [selected, setSelected] = useState<Array<Id<"activityTypes">>>([]);
  const at = useRef<number | null>(null);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const activeSelected = selected.filter((id) => activeIds.has(id));
  const activeSelectedIds = new Set(activeSelected);

  const close = () => dialogRef.current?.close();
  const reset = () => {
    pendingRef.current = false;
    setSelected([]);
    at.current = null;
    setError("");
    setIsOpen(false);
    setIsPending(false);
    openerRef.current?.focus();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    if (isEarlier && at.current === null)
      return setError(t("quick.chooseEarlier"));
    if (activeSelected.length === 0)
      return setError(t("enrichment.selectActivity"));
    pendingRef.current = true;
    setIsPending(true);
    setError("");
    try {
      await logPlays({
        dogId: dog._id,
        activityTypeIds: activeSelected,
        at: isEarlier && at.current !== null ? at.current : getCurrentTime(),
      });
      close();
    } catch {
      pendingRef.current = false;
      setError(t("enrichment.saveError"));
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        disabled={disabled}
        aria-label={t("enrichment.openAria")}
        aria-describedby="quick-state-enrichment"
        className="group grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_1.375rem] items-center gap-x-2 gap-y-0.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors duration-150 hover:border-primary hover:bg-accent active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 sm:grid-cols-[1.75rem_minmax(0,1fr)_1.375rem]"
        onClick={() => {
          setIsOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        <span
          aria-hidden="true"
          className="hidden text-center text-base sm:block"
        >
          🎾
        </span>
        <strong className="min-w-0 text-sm leading-5 [overflow-wrap:anywhere]">
          {t("daily.play.title")}
        </strong>
        <span
          aria-hidden="true"
          className="grid size-[1.375rem] place-items-center rounded-full bg-secondary text-sm font-bold text-primary"
        >
          +
        </span>
        <span
          id="quick-state-enrichment"
          className="col-span-2 block min-w-0 text-xs font-medium leading-4 text-muted-foreground sm:col-span-1 sm:col-start-2"
        >
          <ActivityCountSummary items={today} kind="enrichment" />
        </span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="enrichment-dialog-title"
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/40"
        onClose={reset}
        onCancel={(event) => isPending && event.preventDefault()}
      >
        <form className="p-5 sm:p-6" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={isPending} className="m-0 border-0 p-0">
            <legend id="enrichment-dialog-title" className="text-xl font-bold">
              {t("enrichment.title")}
            </legend>
            {isEarlier && isOpen && active.length > 0 && (
              <EarlierTimePicker
                dog={dog}
                onChange={(selectedAt) => {
                  at.current = selectedAt;
                  setError("");
                }}
              />
            )}
            {activityTypes === undefined ? (
              <div
                aria-label={t("enrichment.loading")}
                className="mt-5"
                role="status"
              >
                <span className="sr-only">{t("enrichment.loading")}</span>
                <span
                  aria-hidden="true"
                  className="block h-12 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
                />
              </div>
            ) : active.length === 0 ? (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  {t("enrichment.empty")}
                </p>
                <Link
                  className="mt-3 inline-block text-sm font-bold underline underline-offset-4"
                  to="/enrichment"
                  onClick={close}
                >
                  {t("enrichment.setup")}
                </Link>
              </div>
            ) : (
              <fieldset className="mt-5">
                <legend className="text-sm font-bold">
                  {t("enrichment.activities")}
                </legend>
                <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto">
                  {active.map((activity) => {
                    const countId = `enrichment-today-${activity._id}`;
                    const displayCount =
                      today?.find(({ id }) => id === activity._id)
                        ?.displayCount ?? formatNumber(0, locale);
                    return (
                      <label
                        key={activity._id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 has-[:checked]:bg-secondary"
                      >
                        <input
                          type="checkbox"
                          aria-label={activity.name}
                          aria-describedby={countId}
                          checked={activeSelectedIds.has(activity._id)}
                          onChange={() => {
                            setSelected((current) => {
                              const available = current.filter((id) =>
                                activeIds.has(id),
                              );
                              return available.includes(activity._id)
                                ? available.filter((id) => id !== activity._id)
                                : [...available, activity._id];
                            });
                            setError("");
                          }}
                        />
                        <span aria-hidden="true">{activity.emoji ?? "🐾"}</span>
                        <span className="min-w-0 flex-1 font-semibold">
                          {activity.name}
                        </span>
                        <span
                          id={countId}
                          className="shrink-0 text-xs font-medium text-muted-foreground"
                        >
                          {t("daily.more.optionCount", {
                            formattedCount: displayCount,
                          })}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {error && (
              <p
                role="alert"
                className="mt-4 text-sm font-bold text-destructive"
              >
                {error}
              </p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button type="button" variant="secondary" onClick={close}>
                {t("common.cancel")}
              </Button>
              {active.length > 0 && (
                <Button type="submit">
                  {isPending ? t("common.saving") : t("enrichment.save")}
                </Button>
              )}
            </div>
          </fieldset>
        </form>
      </dialog>
    </>
  );
}

function TrainingQuickLog({
  commands,
  disabled,
  dog,
  isEarlier,
  today,
}: {
  commands: TrainingCommands | undefined;
  disabled: boolean;
  dog: DashboardDog;
  isEarlier: boolean;
  today: TodayActivities;
}) {
  const { i18n, t } = useTranslation("dashboard");
  const locale = resolveBrowserLocale(i18n.languages);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const logSessions = useMutation(api.training.logRatedSessions);
  const commandIds = useMemo(
    () => new Set(commands?.map(({ _id }) => _id) ?? []),
    [commands],
  );
  const [sessions, setSessions] = useState<
    Array<{
      commandId: Id<"trainingCommands">;
      rating: TrainingRating | null;
    }>
  >([]);
  const at = useRef<number | null>(null);
  const [error, setError] = useState("");
  const [ratingErrorCommandId, setRatingErrorCommandId] = useState<
    Id<"trainingCommands"> | undefined
  >();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const availableSessions = sessions.filter(({ commandId }) =>
    commandIds.has(commandId),
  );
  const activeRatingErrorCommandId =
    ratingErrorCommandId && commandIds.has(ratingErrorCommandId)
      ? ratingErrorCommandId
      : undefined;

  const close = () => dialogRef.current?.close();
  const reset = () => {
    pendingRef.current = false;
    setSessions([]);
    at.current = null;
    setError("");
    setRatingErrorCommandId(undefined);
    setIsOpen(false);
    setIsPending(false);
    openerRef.current?.focus();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    if (isEarlier && at.current === null) {
      setRatingErrorCommandId(undefined);
      return setError(t("quick.chooseEarlier"));
    }
    if (availableSessions.length === 0) {
      setRatingErrorCommandId(undefined);
      return setError(t("training.selectCommand"));
    }
    const firstUnrated = availableSessions.find(
      ({ rating }) => rating === null,
    );
    if (firstUnrated) {
      setError(t("training.selectAssessment"));
      setRatingErrorCommandId(firstUnrated.commandId);
      window.setTimeout(() =>
        document
          .getElementById(`training-rating-${firstUnrated.commandId}-negative`)
          ?.focus(),
      );
      return;
    }
    const ratedSessions = availableSessions.flatMap(({ commandId, rating }) =>
      rating === null ? [] : [{ commandId, rating }],
    );
    pendingRef.current = true;
    setIsPending(true);
    setError("");
    setRatingErrorCommandId(undefined);
    try {
      await logSessions({
        dogId: dog._id,
        at: isEarlier && at.current !== null ? at.current : getCurrentTime(),
        sessions: ratedSessions,
      });
      close();
    } catch {
      pendingRef.current = false;
      setError(t("training.saveError"));
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        disabled={disabled}
        aria-label={t("training.openAria")}
        aria-describedby="quick-state-training"
        className="group grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_1.375rem] items-center gap-x-2 gap-y-0.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors duration-150 hover:border-primary hover:bg-accent active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 sm:grid-cols-[1.75rem_minmax(0,1fr)_1.375rem]"
        onClick={() => {
          setIsOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        <span
          aria-hidden="true"
          className="hidden text-center text-base sm:block"
        >
          ⭐
        </span>
        <strong className="min-w-0 text-sm leading-5 [overflow-wrap:anywhere]">
          {t("training.label")}
        </strong>
        <span
          aria-hidden="true"
          className="grid size-[1.375rem] place-items-center rounded-full bg-secondary text-sm font-bold text-primary"
        >
          +
        </span>
        <span
          id="quick-state-training"
          className="col-span-2 block min-w-0 text-xs font-medium leading-4 text-muted-foreground sm:col-span-1 sm:col-start-2"
        >
          <ActivityCountSummary items={today} kind="training" />
        </span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="training-dialog-title"
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/40"
        onClose={reset}
        onCancel={(event) => isPending && event.preventDefault()}
      >
        <form className="p-5 sm:p-6" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={isPending} className="m-0 border-0 p-0">
            <legend id="training-dialog-title" className="text-xl font-bold">
              {t("training.title")}
            </legend>
            {isEarlier &&
              isOpen &&
              commands !== undefined &&
              commands.length > 0 && (
                <EarlierTimePicker
                  dog={dog}
                  onChange={(selectedAt) => {
                    at.current = selectedAt;
                    setError("");
                    setRatingErrorCommandId(undefined);
                  }}
                />
              )}
            {commands?.length === 0 ? (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  {t("training.empty")}
                </p>
                <Link
                  className="mt-3 inline-block text-sm font-bold underline underline-offset-4"
                  to="/training"
                  onClick={close}
                >
                  {t("training.setup")}
                </Link>
              </div>
            ) : (
              <>
                <fieldset className="mt-5">
                  <legend className="text-sm font-bold">
                    {t("training.commands")}
                  </legend>
                  <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto">
                    {commands?.map((command) => {
                      const session = availableSessions.find(
                        ({ commandId }) => commandId === command._id,
                      );
                      const countId = `training-today-${command._id}`;
                      const displayCount =
                        today?.find(({ id }) => id === command._id)
                          ?.displayCount ?? formatNumber(0, locale);
                      return (
                        <div
                          key={command._id}
                          className="rounded-lg border border-border px-3 py-2 has-[:checked]:bg-secondary"
                        >
                          <label className="flex min-h-8 cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              aria-label={command.name}
                              aria-describedby={countId}
                              checked={session !== undefined}
                              onChange={() => {
                                setSessions((current) => {
                                  const available = current.filter(
                                    ({ commandId }) =>
                                      commandIds.has(commandId),
                                  );
                                  return session
                                    ? available.filter(
                                        ({ commandId }) =>
                                          commandId !== command._id,
                                      )
                                    : [
                                        ...available,
                                        {
                                          commandId: command._id,
                                          rating: null,
                                        },
                                      ];
                                });
                                setError("");
                                setRatingErrorCommandId(undefined);
                              }}
                            />
                            <span className="min-w-0 flex-1 font-semibold">
                              {command.name}
                            </span>
                            <span
                              id={countId}
                              className="shrink-0 text-xs font-medium text-muted-foreground"
                            >
                              {t("daily.more.optionCount", {
                                formattedCount: displayCount,
                              })}
                            </span>
                          </label>
                          {session && (
                            <fieldset
                              aria-describedby={
                                activeRatingErrorCommandId === command._id
                                  ? "training-rating-error"
                                  : undefined
                              }
                              className="mt-2 border-t border-border pt-2"
                            >
                              <legend className="sr-only">
                                {t("training.commandAssessment", {
                                  command: command.name,
                                })}
                              </legend>
                              <div className="grid grid-cols-3 gap-2">
                                {trainingRatings.map(({ icon, value }) => (
                                  <label
                                    key={value}
                                    className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md border border-border bg-card px-1 py-1 text-xs font-semibold has-[:checked]:border-primary has-[:checked]:bg-background has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
                                  >
                                    <input
                                      className="sr-only"
                                      type="radio"
                                      id={`training-rating-${command._id}-${value}`}
                                      name={`training-rating-${command._id}`}
                                      value={value}
                                      aria-describedby={
                                        activeRatingErrorCommandId ===
                                        command._id
                                          ? "training-rating-error"
                                          : undefined
                                      }
                                      checked={session.rating === value}
                                      onChange={() => {
                                        setSessions((current) =>
                                          current.map((item) =>
                                            item.commandId === command._id
                                              ? { ...item, rating: value }
                                              : item,
                                          ),
                                        );
                                        setError("");
                                        setRatingErrorCommandId(undefined);
                                      }}
                                    />
                                    <span
                                      aria-hidden="true"
                                      className="text-lg"
                                    >
                                      {icon}
                                    </span>
                                    {t(`training.rating.${value}`)}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            )}
            {error && (
              <p
                id={
                  activeRatingErrorCommandId
                    ? "training-rating-error"
                    : undefined
                }
                role="alert"
                className="mt-4 text-sm font-bold text-destructive"
              >
                {error}
              </p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button type="button" variant="secondary" onClick={close}>
                {t("common.cancel")}
              </Button>
              {commands !== undefined && commands.length > 0 && (
                <Button type="submit">
                  {isPending ? t("common.saving") : t("training.save")}
                </Button>
              )}
            </div>
          </fieldset>
        </form>
      </dialog>
    </>
  );
}

function EditDateTimeField({
  error,
  eventId,
  field,
  label,
  onChange,
  timezone,
  value,
}: {
  error: string;
  eventId: Id<"events">;
  field: "at" | "ended-at";
  label: string;
  onChange: (value: string) => void;
  timezone: string;
  value: string;
}) {
  const { t } = useTranslation("dashboard");
  const inputId = `edit-${field}-${eventId}`;
  const errorId = `edit-${field}-error-${eventId}`;
  const timezoneId =
    field === "at"
      ? `edit-timezone-${eventId}`
      : `edit-ended-at-timezone-${eventId}`;

  return (
    <div>
      <label htmlFor={inputId} className="text-sm font-bold">
        {label}
      </label>
      <input
        id={inputId}
        type="datetime-local"
        step="60"
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${timezoneId} ${errorId}` : timezoneId}
        className="field-control mt-2 w-full"
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={errorId} className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <p id={timezoneId} className="mt-2 text-xs text-muted-foreground">
        {t("common.timezone", { timezone })}
      </p>
    </div>
  );
}

export function EventEditor({
  dog,
  event,
  onCancel,
  onSaved,
}: {
  dog: DashboardDog;
  event: RecentEvent;
  onCancel: () => void;
  onSaved: (label: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const updateEvent = useMutation(api.events.update);
  const initialAt = formatZonedDateTimeLocal(event.at, dog.timezone) ?? "";
  const initialEndedAt =
    event.endedAt === undefined
      ? ""
      : (formatZonedDateTimeLocal(event.endedAt, dog.timezone) ?? "");
  const initialAmount = event.amount ?? null;
  const initialNote = event.note ?? null;
  const initialPeePlace = event.peePlace ?? "outside";
  const [form, updateForm] = useReducer(mergeEditState, {
    amount: event.amount?.toString() ?? "",
    at: initialAt,
    endedAt: initialEndedAt,
    error: "",
    errors: { amount: "", at: "", endedAt: "", note: "" },
    isPending: false,
    note: event.note ?? "",
    peePlace: initialPeePlace,
  });
  const submitting = useRef(false);
  const { amount, at, endedAt, error, errors, isPending, note, peePlace } =
    form;
  const isWalk = event.kind === "walk";
  const showsEndedAt = isWalk && event.endedAt !== undefined;
  const showsAmount = event.kind === "meal" || event.kind === "treat";
  const label = t(`events.${event.kind}`);

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (submitting.current) return;
    const now = getCurrentTime();
    const parsedAt = parseZonedDateTimeLocal(at, dog.timezone);
    const parsedEndedAt = showsEndedAt
      ? parseZonedDateTimeLocal(endedAt, dog.timezone)
      : null;
    const normalizedNote = note.trim();
    const amountValue = amount.trim() ? parseDecimalInput(amount) : undefined;
    const atDirty = at !== initialAt;
    const endedAtDirty = showsEndedAt && endedAt !== initialEndedAt;
    const normalizedAmount = amountValue ?? null;
    const normalizedNoteValue = normalizedNote || null;
    const nextErrors: EditState["errors"] = {
      amount:
        showsAmount &&
        amountValue !== undefined &&
        (!Number.isFinite(amountValue) ||
          amountValue <= 0 ||
          amountValue > 10_000)
          ? t("common.amountError")
          : "",
      at: atDirty ? getTimestampError(at, parsedAt, dog, now, t) : "",
      endedAt: endedAtDirty
        ? getTimestampError(endedAt, parsedEndedAt, dog, now, t)
        : "",
      note:
        normalizedNote.length > 500
          ? t("common.maxCharacters", { max: 500 })
          : "",
    };
    const nextAt = atDirty ? parsedAt : event.at;
    const nextEndedAt = endedAtDirty ? parsedEndedAt : event.endedAt;
    if (
      isWalk &&
      nextAt !== null &&
      nextEndedAt !== null &&
      nextEndedAt !== undefined &&
      nextAt > nextEndedAt
    ) {
      if (endedAtDirty) {
        nextErrors.endedAt = t("walk.endBeforeStart");
      } else {
        nextErrors.at = t("editor.startAfterEnd");
      }
    }
    updateForm({ error: "", errors: nextErrors });
    const firstError = (["at", "endedAt", "note", "amount"] as const).find(
      (field) => nextErrors[field],
    );
    if (firstError) {
      const fieldId = firstError === "endedAt" ? "ended-at" : firstError;
      document.getElementById(`edit-${fieldId}-${event._id}`)?.focus();
      return;
    }
    if (
      (atDirty && parsedAt === null) ||
      (endedAtDirty && parsedEndedAt === null)
    ) {
      return;
    }

    const changes: {
      amount?: number | null;
      at?: number;
      endedAt?: number;
      note?: string | null;
      peePlace?: PeePlace;
    } = {};
    if (atDirty && parsedAt !== null) changes.at = parsedAt;
    if (endedAtDirty && parsedEndedAt !== null) changes.endedAt = parsedEndedAt;
    if (normalizedNoteValue !== initialNote) changes.note = normalizedNoteValue;
    if (showsAmount && normalizedAmount !== initialAmount) {
      changes.amount = normalizedAmount;
    }
    if (event.kind === "pee" && peePlace !== initialPeePlace) {
      changes.peePlace = peePlace;
    }
    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }

    submitting.current = true;
    updateForm({ isPending: true });
    try {
      await updateEvent({
        dogId: dog._id,
        eventId: event._id,
        ...changes,
      });
      onSaved(label);
    } catch (caught) {
      const backendField = endedAtDirty && !atDirty ? "endedAt" : "at";
      const fieldError = hasErrorCode(caught, "INVALID_WALK_TIMESTAMP")
        ? t("editor.attachedPotty")
        : hasErrorCode(caught, "INVALID_WALK_INTERVAL")
          ? t("editor.walkOrder")
          : hasErrorCode(caught, "INVALID_TIMESTAMP")
            ? t("common.timestampRange")
            : "";
      updateForm(
        fieldError
          ? {
              errors: { ...nextErrors, [backendField]: fieldError },
            }
          : {
              error: t("editor.saveError"),
            },
      );
    } finally {
      submitting.current = false;
      updateForm({ isPending: false });
    }
  };

  return (
    <form
      aria-label={t("editor.aria", { event: label })}
      aria-busy={isPending}
      noValidate
      onSubmit={(formEvent) => void submit(formEvent)}
    >
      <fieldset disabled={isPending} className="m-0 border-0 p-0">
        <legend className="text-lg font-semibold">
          {t("editor.title", { event: label })}
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <EditDateTimeField
            error={errors.at}
            eventId={event._id}
            field="at"
            label={isWalk ? t("editor.walkStart") : t("editor.dateTime")}
            onChange={(at) => updateForm({ at, errors: { ...errors, at: "" } })}
            timezone={dog.timezone}
            value={at}
          />
          {showsEndedAt && (
            <EditDateTimeField
              error={errors.endedAt}
              eventId={event._id}
              field="ended-at"
              label={t("editor.walkEnd")}
              onChange={(endedAt) =>
                updateForm({
                  endedAt,
                  errors: { ...errors, endedAt: "" },
                })
              }
              timezone={dog.timezone}
              value={endedAt}
            />
          )}
          {showsAmount && (
            <div>
              <label
                htmlFor={`edit-amount-${event._id}`}
                className="text-sm font-bold"
              >
                {t("common.amount")}{" "}
                <span className="font-normal">{t("common.optional")}</span>
              </label>
              <input
                id={`edit-amount-${event._id}`}
                type="text"
                inputMode="decimal"
                value={amount}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={
                  errors.amount ? `edit-amount-error-${event._id}` : undefined
                }
                className="field-control mt-2 w-full"
                onChange={(changeEvent) =>
                  updateForm({
                    amount: changeEvent.target.value,
                    errors: { ...errors, amount: "" },
                  })
                }
              />
              {errors.amount && (
                <p
                  id={`edit-amount-error-${event._id}`}
                  className="mt-2 text-sm text-destructive"
                >
                  {errors.amount}
                </p>
              )}
            </div>
          )}
        </div>
        {event.kind === "pee" && (
          <PeePlaceField
            id={`edit-${event._id}`}
            value={peePlace}
            onChange={(peePlace) => updateForm({ peePlace })}
          />
        )}
        <div className="mt-3">
          <label
            htmlFor={`edit-note-${event._id}`}
            className="text-sm font-bold"
          >
            {isWalk ? t("walk.diary") : t("common.note")}{" "}
            <span className="font-normal">{t("common.optional")}</span>
          </label>
          <textarea
            id={`edit-note-${event._id}`}
            value={note}
            aria-invalid={Boolean(errors.note)}
            aria-describedby={
              errors.note ? `edit-note-error-${event._id}` : undefined
            }
            className="field-control mt-2 min-h-20 w-full"
            onChange={(changeEvent) =>
              updateForm({
                errors: { ...errors, note: "" },
                note: changeEvent.target.value,
              })
            }
          />
          {errors.note && (
            <p
              id={`edit-note-error-${event._id}`}
              className="mt-2 text-sm text-destructive"
            >
              {errors.note}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">
            {isPending ? t("common.saving") : t("editor.save")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function WalkRowDetails({
  event,
  now,
  timeFormatter,
}: {
  event: RecentEvent;
  now: number | null;
  timeFormatter: Intl.DateTimeFormat;
}) {
  const { i18n, t } = useTranslation("dashboard");
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  const endedAt = event.endedAt;
  const duration =
    endedAt !== undefined
      ? formatElapsed(getElapsedMs(event.at, endedAt), locale)
      : now === null
        ? t("common.syncing")
        : formatElapsed(getElapsedMs(event.at, now), locale);

  return (
    <div className="mt-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-primary">
          {endedAt === undefined
            ? t("recent.inProgress")
            : t("recent.completed")}
        </span>
        <span className="tabular-nums text-muted-foreground">
          <time dateTime={new Date(event.at).toISOString()}>
            {timeFormatter.format(event.at)}
          </time>
          {endedAt !== undefined && (
            <>
              {" → "}
              <time dateTime={new Date(endedAt).toISOString()}>
                {timeFormatter.format(endedAt)}
              </time>
            </>
          )}
          {` · ${duration}`}
        </span>
      </div>
      {event.note && (
        <p className="mt-2 max-w-[70ch] text-base leading-6 text-muted-foreground">
          <span className="font-semibold text-foreground">
            {t("recent.diary")}
          </span>{" "}
          {event.note}
        </p>
      )}
    </div>
  );
}

function RecentActivity({
  activityTypesById,
  dateFormatter,
  dog,
  now,
  recent,
  timeFormatter,
}: {
  activityTypesById: ActivityTypesById;
  dateFormatter: Intl.DateTimeFormat;
  dog: DashboardDog;
  now: number | null;
  recent: RecentEvents | undefined;
  timeFormatter: Intl.DateTimeFormat;
}) {
  const { i18n, t } = useTranslation("dashboard");
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  const removeEvent = useMutation(api.events.remove);
  const [state, updateState] = useReducer(mergeRecentState, initialRecentState);
  const deleting = useRef(false);
  const { confirmDeleteId, editId, error, pendingDeleteId, status } = state;
  const actionsLocked = editId !== null || pendingDeleteId !== null;

  const deleteEvent = async (event: RecentEvent) => {
    if (deleting.current) return;
    deleting.current = true;
    updateState({ error: "", pendingDeleteId: event._id, status: "" });
    try {
      await removeEvent({ dogId: dog._id, eventId: event._id });
      updateState({
        confirmDeleteId: null,
        status: t("recent.deleted", { event: t(`events.${event.kind}`) }),
      });
    } catch {
      updateState({ error: t("recent.deleteError") });
    } finally {
      deleting.current = false;
      updateState({ pendingDeleteId: null });
    }
  };

  return (
    <section aria-labelledby="recent-title" className="py-1">
      <h2
        id="recent-title"
        className="text-balance text-xl font-bold leading-[1.625rem]"
      >
        {t("recent.title")}
      </h2>
      {status && (
        <p role="status" className="mt-3 text-sm font-bold text-primary">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {recent === undefined ? (
        <>
          <p role="status" aria-live="polite" className="sr-only">
            {t("recent.loading")}
          </p>
          <ol
            aria-hidden="true"
            className="mt-4 divide-y divide-border border-y border-border"
          >
            {[0, 1, 2].map((item) => (
              <li
                key={item}
                className="animate-pulse py-4 motion-reduce:animate-none"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="h-5 w-24 rounded bg-muted" />
                  <span className="h-4 w-20 rounded bg-muted" />
                </div>
                <span className="mt-3 block h-4 w-2/3 max-w-64 rounded bg-muted" />
                <div className="mt-3 flex gap-2">
                  <span className="h-11 w-16 rounded-md bg-muted" />
                  <span className="h-11 w-20 rounded-md bg-muted" />
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : recent.length === 0 ? (
        <p className="mt-5 border-y border-border py-8 text-center text-sm text-muted-foreground">
          {t("recent.empty")}
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {recent.map((event) => {
            const label = getActivityEventLabel(event, activityTypesById, t);
            const date = dateFormatter.format(event.at);
            const time = timeFormatter.format(event.at);
            const isWalk = event.kind === "walk";
            const playDuration =
              event.kind === "play" && event.endedAt !== undefined
                ? formatElapsed(getElapsedMs(event.at, event.endedAt), locale)
                : null;
            const isConfirming = confirmDeleteId === event._id;
            return (
              <li
                key={event._id}
                data-activity-kind={event.kind}
                className={
                  editId === event._id
                    ? "rounded-lg bg-muted p-4"
                    : "rounded-lg bg-[var(--activity-surface)] px-4 py-4"
                }
              >
                {editId === event._id ? (
                  <EventEditor
                    dog={dog}
                    event={event}
                    onCancel={() => updateState({ editId: null })}
                    onSaved={(savedLabel) =>
                      updateState({
                        editId: null,
                        error: "",
                        status: t("recent.updated", { event: savedLabel }),
                      })
                    }
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="font-semibold text-[var(--activity-ink)]"
                        >
                          {activityVisuals[event.kind].symbol}
                        </span>
                        <strong className="font-semibold">{label}</strong>
                        {event.kind === "pee" && event.peePlace && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                            {t(`peePlace.${event.peePlace}`)}
                          </span>
                        )}
                        {event.walkId !== undefined && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">
                            {t("recent.duringWalk")}
                          </span>
                        )}
                      </div>
                      <time
                        dateTime={new Date(event.at).toISOString()}
                        className="shrink-0 text-right tabular-nums"
                      >
                        <span className="block text-xs text-muted-foreground">
                          {date}
                        </span>
                        {!isWalk && (
                          <span className="block text-sm font-semibold text-foreground">
                            {time}
                          </span>
                        )}
                      </time>
                    </div>
                    {isWalk ? (
                      <WalkRowDetails
                        event={event}
                        now={now}
                        timeFormatter={timeFormatter}
                      />
                    ) : (
                      event.note && (
                        <p className="mt-2 max-w-[70ch] text-base leading-6 text-muted-foreground">
                          {event.note}
                        </p>
                      )
                    )}
                    {event.amount !== undefined && (
                      <span className="mt-2 block text-sm text-muted-foreground">
                        {t("recent.amount", {
                          amount: formatNumber(event.amount, locale),
                        })}
                      </span>
                    )}
                    {playDuration && (
                      <span className="mt-2 block text-sm text-muted-foreground">
                        {t("recent.duration", { duration: playDuration })}
                      </span>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={t("recent.editAria", {
                          event: label,
                          date,
                          time,
                        })}
                        disabled={actionsLocked}
                        onClick={() =>
                          updateState({
                            confirmDeleteId: null,
                            editId: event._id,
                            error: "",
                            status: "",
                          })
                        }
                      >
                        {t("recent.edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        aria-label={t("recent.deleteAria", {
                          event: label,
                          date,
                          time,
                        })}
                        disabled={actionsLocked}
                        className="text-destructive hover:text-destructive"
                        onClick={() =>
                          updateState({
                            confirmDeleteId: event._id,
                            editId: null,
                            error: "",
                            status: "",
                          })
                        }
                      >
                        {t("recent.delete")}
                      </Button>
                    </div>
                    {isConfirming && (
                      <div className="mt-3 rounded-lg bg-muted/70 p-3">
                        <p className="text-sm font-bold">
                          {t("recent.confirm", {
                            event: label,
                          })}
                        </p>
                        {isWalk && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t("recent.walkDeleteHelp")}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            aria-label={t("recent.cancelDeleteAria", {
                              event: label,
                            })}
                            disabled={pendingDeleteId !== null}
                            onClick={() =>
                              updateState({ confirmDeleteId: null })
                            }
                          >
                            {t("recent.keep")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            aria-label={t("recent.confirmDeleteAria", {
                              event: label,
                            })}
                            disabled={pendingDeleteId !== null}
                            onClick={() => void deleteEvent(event)}
                          >
                            {pendingDeleteId === event._id
                              ? t("recent.deleting")
                              : t("recent.deleteLog")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function DashboardPage({ dog }: { dog: DashboardDog }) {
  const { i18n, t } = useTranslation("dashboard");
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  const recent = useQuery(api.events.listRecent, {
    dogId: dog._id,
    limit: 100,
  });
  const activityTypes = useQuery(api.activityTypes.list, {
    dogId: dog._id,
    includeArchived: true,
    limit: 100,
  });
  const latest = useQuery(api.events.latestByKind, { dogId: dog._id });
  const activeWalk = useQuery(api.walks.active, { dogId: dog._id });
  const routines = useQuery(api.routines.list, { dogId: dog._id });
  const trainingCommands = useQuery(api.training.list, {
    dogId: dog._id,
    limit: 100,
  });
  const logQuick = useMutation(api.events.logQuick);
  const logPotty = useMutation(api.walks.logPotty);
  const createWithPotty = useMutation(api.walks.createWithPotty);
  const removeEvent = useMutation(api.events.remove);
  const undoReconstruction = useMutation(api.walks.undoReconstruction);
  const [pendingOperation, setPendingOperation] =
    useState<PendingOperation>(null);
  const [undoTarget, setUndoTarget] = useState<UndoTarget | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const dayKeys = now === null ? null : getZonedDayKeys(now, dog.timezone);
  const dayWindow = dayKeys
    ? getZonedDayWindow(dayKeys.today, dog.timezone)
    : null;
  const waterToday = useQuery(
    api.events.waterCount,
    dog.waterIntervalMinutes !== undefined && dayWindow
      ? {
          dogId: dog._id,
          startAt: dayWindow.startAt,
          endAt: dayWindow.endAt,
        }
      : "skip",
  );
  const trainingDay = useQuery(
    api.training.listDay,
    dayWindow
      ? {
          dogId: dog._id,
          startAt: dayWindow.startAt,
          endAt: dayWindow.endAt,
        }
      : "skip",
  );
  const enrichmentDay = useQuery(
    api.activityTypes.listDay,
    dayWindow
      ? {
          dogId: dog._id,
          startAt: dayWindow.startAt,
          endAt: dayWindow.endAt,
        }
      : "skip",
  );
  const agenda = useQuery(
    api.agenda.get,
    dayKeys ? { dogId: dog._id, date: dayKeys.today } : "skip",
  );
  const operationPending = useRef(false);
  const activityTypesById = useMemo(
    () => new Map(activityTypes?.map((type) => [type._id, type]) ?? []),
    [activityTypes],
  );
  const { dateFormatter, timeFormatter } = useMemo(
    () => ({
      dateFormatter: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: dog.timezone,
        year: "numeric",
      }),
      timeFormatter: new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: dog.timezone,
      }),
    }),
    [dog.timezone, locale],
  );
  const overviewItems = useMemo<DayOverviewItem[] | undefined>(() => {
    if (
      now === null ||
      dayWindow === null ||
      recent === undefined ||
      trainingDay === undefined
    ) {
      return undefined;
    }

    const priorRestTransition = recent.reduce<RecentEvent | undefined>(
      (latestTransition, event) =>
        (event.kind === "sleep" || event.kind === "wake") &&
        event.at < dayWindow.startAt &&
        (latestTransition === undefined || event.at > latestTransition.at)
          ? event
          : latestTransition,
      undefined,
    );
    const dayEvents = recent.filter(
      ({ at }) => at >= dayWindow.startAt && at < dayWindow.endAt,
    );
    const eventItems = [
      ...(priorRestTransition?.kind === "sleep" ? [priorRestTransition] : []),
      ...dayEvents,
    ].map((event) => ({
      id: String(event._id),
      at: event.at,
      endedAt: event.endedAt,
      kind: event.kind,
      label: getActivityEventLabel(event, activityTypesById, t),
      detail: event.note,
    }));
    const trainingGroups = new Map<
      string,
      { at: number; commandNames: Set<string>; id: string }
    >();

    for (const session of trainingDay) {
      if (!Number.isFinite(session.at)) continue;
      const key = `${session.at}\u0000${session.notes ?? ""}`;
      const group = trainingGroups.get(key);
      if (group) {
        group.commandNames.add(session.commandName);
      } else {
        trainingGroups.set(key, {
          at: session.at,
          commandNames: new Set([session.commandName]),
          id: String(session._id),
        });
      }
    }

    const trainingItems = Array.from(trainingGroups.values(), (group) => ({
      id: group.id,
      at: group.at,
      kind: "training" as const,
      label: t("training.label"),
      detail: Array.from(group.commandNames).join(", "),
    }));
    return [...eventItems, ...trainingItems].sort((a, b) => a.at - b.at);
  }, [activityTypesById, dayWindow, now, recent, t, trainingDay]);

  useEffect(() => {
    const sync = () => setNow(Date.now());
    const initial = window.setTimeout(sync, 0);
    const interval = window.setInterval(sync, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  const elapsed = (event: { at: number } | null | undefined) => {
    if (now === null || event === undefined) return t("timers.syncing");
    return event
      ? formatElapsed(getElapsedMs(event.at, now), locale)
      : t("timers.noLog");
  };
  const nextMeal =
    now === null || routines === undefined
      ? undefined
      : getNextMealCountdown(now, dog.timezone, routines);
  const nextWater =
    dog.waterIntervalMinutes === undefined ||
    now === null ||
    latest === undefined
      ? undefined
      : latest.water === null
        ? t("timers.noWater")
        : latest.water.at + dog.waterIntervalMinutes * 60_000 <= now
          ? t("timers.waterDue")
          : formatElapsed(
              latest.water.at + dog.waterIntervalMinutes * 60_000 - now,
              locale,
            );
  const sleepState = latest
    ? deriveSleepState(latest.wake, latest.sleep)
    : undefined;
  const latestWalk = latest?.walk;
  const trainingToday = useMemo(
    () =>
      trainingDay?.length === undefined
        ? undefined
        : countActivities(
            trainingDay,
            ({ commandId: id, commandName: name }) => ({ id, name }),
            locale,
          ).map((item) => ({
            ...item,
            displayCount: formatNumber(item.count, locale),
          })),
    [locale, trainingDay],
  );
  const enrichmentToday = useMemo(
    () =>
      enrichmentDay?.length === undefined
        ? undefined
        : countActivities(
            enrichmentDay,
            ({ activityTypeId: id, activityName: name }) => ({ id, name }),
            locale,
          ).map((item) => ({
            ...item,
            displayCount: formatNumber(item.count, locale),
          })),
    [enrichmentDay, locale],
  );
  const todayEvents =
    recent === undefined || dayWindow === null
      ? undefined
      : recent.filter(
          ({ at }) => at >= dayWindow.startAt && at < dayWindow.endAt,
        );
  const todayWalks = todayEvents?.filter(({ kind }) => kind === "walk");
  const restTodayMs =
    overviewItems === undefined || dayWindow === null || now === null
      ? undefined
      : getRestTodayMs(overviewItems, dayWindow.startAt, dayWindow.endAt, now);
  const activityCount =
    overviewItems === undefined || dayWindow === null
      ? undefined
      : overviewItems.filter(
          ({ at }) => at >= dayWindow.startAt && at < dayWindow.endAt,
        ).length;
  const dailySummary: DailySummary = {
    activityCount:
      activityCount === undefined
        ? undefined
        : formatNumber(activityCount, locale),
    enrichment: enrichmentToday,
    isLoading:
      now === null ||
      latest === undefined ||
      routines === undefined ||
      recent === undefined ||
      trainingDay === undefined ||
      enrichmentDay === undefined ||
      (dog.waterIntervalMinutes !== undefined && waterToday === undefined),
    meal: {
      elapsed: elapsed(latest?.meal),
      nextLabel: nextMeal?.label,
      nextValue:
        now === null || routines === undefined
          ? t("timers.syncing")
          : nextMeal
            ? formatElapsed(nextMeal.countdownMs, locale)
            : t("timers.noMeal"),
    },
    pee: elapsed(latest?.pee),
    poop: elapsed(latest?.poop),
    rest: {
      elapsed:
        now === null || latest === undefined
          ? t("timers.syncing")
          : sleepState
            ? formatElapsed(getElapsedMs(sleepState.startedAt, now), locale)
            : t("timers.noState"),
      startedAt: sleepState
        ? timeFormatter.format(sleepState.startedAt)
        : undefined,
      state: sleepState?.state,
    },
    restToday:
      restTodayMs === undefined || restTodayMs === 0
        ? undefined
        : formatElapsed(restTodayMs, locale),
    training: trainingToday,
    treat:
      todayEvents === undefined
        ? t("common.checking")
        : t("daily.more.today", {
            formattedCount: formatNumber(
              todayEvents.filter(({ kind }) => kind === "treat").length,
              locale,
            ),
          }),
    updatedAt: now === null ? undefined : timeFormatter.format(now),
    walk: {
      count:
        todayWalks === undefined
          ? undefined
          : formatNumber(todayWalks.length, locale),
      duration:
        latestWalk?.endedAt === undefined
          ? undefined
          : formatElapsed(
              getElapsedMs(latestWalk.at, latestWalk.endedAt),
              locale,
            ),
      elapsed:
        now === null || latest === undefined
          ? t("timers.syncing")
          : latestWalk
            ? formatElapsed(
                getElapsedMs(latestWalk.endedAt ?? latestWalk.at, now),
                locale,
              )
            : t("timers.noWalk"),
      hasLatest: latestWalk !== undefined && latestWalk !== null,
    },
    ...(dog.waterIntervalMinutes === undefined
      ? {}
      : {
          water: {
            count:
              waterToday === undefined
                ? undefined
                : formatNumber(waterToday, locale),
            elapsed: elapsed(latest?.water),
            next: nextWater ?? t("timers.syncing"),
          },
        }),
  };

  const beginOperation = (operation: Exclude<PendingOperation, null>) => {
    if (operationPending.current) return false;
    operationPending.current = true;
    setPendingOperation(operation);
    return true;
  };

  const endOperation = () => {
    operationPending.current = false;
    setPendingOperation(null);
  };

  const log = async (
    kind: QuickKind,
    label: string,
    at: number,
    peePlace?: PeePlace,
    allowWalkAttachment = true,
  ) => {
    const isPotty = isPottyKind(kind);
    const canAttach = kind !== "pee" || peePlace === "outside";
    if (
      allowWalkAttachment &&
      isPotty &&
      canAttach &&
      activeWalk === undefined
    ) {
      return false;
    }
    const attachedWalk =
      allowWalkAttachment &&
      isPotty &&
      canAttach &&
      activeWalk &&
      at >= activeWalk.at
        ? activeWalk
        : null;
    if (!beginOperation(kind)) return false;
    setFeedback("");
    setError("");
    try {
      const eventId =
        attachedWalk !== null && attachedWalk !== undefined && isPottyKind(kind)
          ? await logPotty({
              dogId: dog._id,
              walkId: attachedWalk._id,
              kind,
              at,
              ...(kind === "pee" ? { peePlace: "outside" as const } : {}),
            })
          : await logQuick({
              dogId: dog._id,
              kind,
              at,
              ...(kind === "pee" ? { peePlace } : {}),
            });
      setUndoTarget({ eventId });
      setFeedback(t("feedback.logged", { dogName: dog.name, event: label }));
      return true;
    } catch (caught) {
      setError(
        isPotty && hasErrorCode(caught, "WALK_NOT_ACTIVE")
          ? t("feedback.walkEnded")
          : isPotty && hasErrorCode(caught, "INVALID_WALK_TIMESTAMP")
            ? t("feedback.pottyOutside")
            : (kind === "wake" || kind === "sleep") &&
                hasErrorCode(caught, "INVALID_REST_TRANSITION")
              ? t("feedback.restChanged")
              : t("feedback.logError", {
                  event: label,
                }),
      );
      return false;
    } finally {
      endOperation();
    }
  };

  const startWalkForPotty = async (
    kind: "pee" | "poop",
    label: string,
    at: number,
    minutesAgo: number,
  ) => {
    if (!beginOperation(kind)) return false;
    setFeedback("");
    setError("");
    try {
      const created = await createWithPotty({
        dogId: dog._id,
        kind,
        pottyAt: at,
        walkStartedAt: at - minutesAgo * 60_000,
        ...(kind === "pee" ? { peePlace: "outside" as const } : {}),
      });
      setUndoTarget({ eventId: created.eventId });
      setFeedback(
        t("feedback.walkAndPottyLogged", {
          dogName: dog.name,
          event: label,
          minutes: minutesAgo,
        }),
      );
      return true;
    } catch (caught) {
      setError(
        hasErrorCode(caught, "WALK_ALREADY_ACTIVE")
          ? t("feedback.walkStartedElsewhere")
          : hasErrorCode(caught, "INVALID_WALK_INTERVAL")
            ? t("feedback.walkOverlap")
            : t("feedback.walkAndPottyError"),
      );
      return false;
    } finally {
      endOperation();
    }
  };

  const undo = async () => {
    const target = undoTarget;
    if (!target || !beginOperation("undo")) return;
    setFeedback(t("feedback.removing"));
    setError("");
    try {
      await (target.walkId
        ? undoReconstruction({
            dogId: dog._id,
            eventId: target.eventId,
            walkId: target.walkId,
          })
        : removeEvent({ dogId: dog._id, eventId: target.eventId }));
      setUndoTarget(null);
      setFeedback(t("feedback.removed"));
    } catch (caught) {
      setFeedback("");
      setError(
        hasErrorCode(caught, "RECONSTRUCTION_CHANGED")
          ? t("feedback.reconstructionChanged")
          : t("feedback.undoError"),
      );
    } finally {
      endOperation();
    }
  };

  const backdated = (target: UndoTarget, label: string) => {
    setUndoTarget(target);
    setError("");
    setFeedback(t("feedback.logged", { dogName: dog.name, event: label }));
  };

  const walkTransition = (message: string) => {
    setUndoTarget(null);
    setError("");
    setFeedback(message);
  };

  const walkDiarySaved = () => {
    setError("");
    setFeedback(t("walk.diarySaved"));
  };

  const startBackdateOperation = () => beginOperation("backdate");

  return (
    <AppFrame dogName={dog.name}>
      <QuickLogSection
        activeWalk={activeWalk}
        activityTypes={activityTypes}
        dog={dog}
        error={error}
        feedback={feedback}
        hasUndo={undoTarget !== null}
        latest={latest}
        onBackdated={backdated}
        onBackdateOperationEnd={endOperation}
        onBackdateOperationStart={startBackdateOperation}
        onError={setError}
        onLog={log}
        onStartWalkForPotty={startWalkForPotty}
        onUndo={() => void undo()}
        onWalkDiarySaved={walkDiarySaved}
        onWalkOperationStart={beginOperation}
        onWalkTransition={walkTransition}
        now={now}
        pendingOperation={pendingOperation}
        sleepState={sleepState}
        summary={dailySummary}
        timeFormatter={timeFormatter}
        trainingCommands={trainingCommands}
      />

      {dayWindow && now !== null && (
        <DayOverview
          items={overviewItems}
          startAt={dayWindow.startAt}
          endAt={dayWindow.endAt}
          now={now}
          timezone={dog.timezone}
        />
      )}

      <div className="pb-6">
        <AgendaSummary agenda={agenda} />
      </div>

      <RecentActivity
        activityTypesById={activityTypesById}
        dateFormatter={dateFormatter}
        dog={dog}
        now={now}
        recent={recent?.slice(0, 8)}
        timeFormatter={timeFormatter}
      />
    </AppFrame>
  );
}

export default DashboardPage;
