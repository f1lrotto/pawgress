import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { TFunction } from "i18next";
import {
  type FormEvent,
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
type RecentState = {
  confirmDeleteId: Id<"events"> | null;
  editId: Id<"events"> | null;
  error: string;
  pendingDeleteId: Id<"events"> | null;
  status: string;
};

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
const mergeBackdateState = (
  state: BackdateState,
  patch: Partial<BackdateState>,
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

function TodayActivitySummary({
  countLabel,
  emptyText,
  items,
  linkText,
  loadingText,
  title,
  to,
}: {
  countLabel: (name: string, count: number) => string;
  emptyText: string;
  items: TodayActivities;
  linkText: string;
  loadingText: string;
  title: string;
  to: string;
}) {
  const maxCount = Math.max(1, ...(items?.map(({ count }) => count) ?? []));
  return (
    <div className="border-t border-border bg-secondary/60 px-4 py-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h3 className="text-balance text-sm font-semibold">{title}</h3>
        <Link
          to={to}
          className="-my-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {linkText}
        </Link>
      </div>
      {items === undefined ? (
        <div className="mt-3">
          <span role="status" className="sr-only">
            {loadingText}
          </span>
          <span
            aria-hidden="true"
            className="block h-5 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none"
          />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(8rem,100%),1fr))] gap-x-6 gap-y-4">
          {items.map(({ count, displayCount, id, name }) => (
            <li key={id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">
                  {name}
                </span>
                <span
                  aria-label={countLabel(name, count)}
                  className="shrink-0 text-lg font-bold tabular-nums text-primary"
                >
                  {displayCount}×
                </span>
              </div>
              <div
                aria-hidden="true"
                className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none"
                  style={{ transform: `scaleX(${count / maxCount})` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RightNowSummary({
  enrichment,
  isLoading,
  items,
  training,
}: {
  enrichment: TodayActivities;
  isLoading: boolean;
  items: Array<{ detail?: string; label: string; value: string }>;
  training: TodayActivities;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <section aria-labelledby="timers-title" className="pb-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="timers-title" className="text-xl font-bold leading-[1.625rem]">
          {t("timers.title")}
        </h2>
        <span className="text-xs font-medium text-muted-foreground">
          {t("timers.updates")}
        </span>
      </div>
      {isLoading && (
        <span role="status" className="sr-only">
          {t("timers.syncing")}
        </span>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {items.map(({ detail, label, value }) => (
            <div key={label} className="min-w-0 bg-card px-4 py-4">
              <dt className="text-sm font-medium leading-5 text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-2">
                {isLoading ? (
                  <span
                    aria-hidden="true"
                    className="block h-6 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none"
                  />
                ) : (
                  <span className="block text-xl font-bold leading-6">
                    {value}
                  </span>
                )}
                {!isLoading && detail && (
                  <span className="mt-1 block truncate text-xs font-medium text-muted-foreground">
                    {detail}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <TodayActivitySummary
          countLabel={(name, count) =>
            t("timers.trainingCount", { count, name })
          }
          emptyText={t("timers.noTraining")}
          items={training}
          linkText={t("timers.viewTraining")}
          loadingText={t("timers.trainingLoading")}
          title={t("timers.trainingToday")}
          to="/training"
        />
        <TodayActivitySummary
          countLabel={(name, count) =>
            t("timers.enrichmentCount", { count, name })
          }
          emptyText={t("timers.noEnrichment")}
          items={enrichment}
          linkText={t("timers.viewEnrichment")}
          loadingText={t("timers.enrichmentLoading")}
          title={t("timers.enrichmentToday")}
          to="/enrichment"
        />
      </div>
    </section>
  );
}

function WaterTodaySummary({
  count,
  nextDrink,
}: {
  count: string | undefined;
  nextDrink: string | undefined;
}) {
  const { t } = useTranslation("dashboard");
  const isLoading = count === undefined || nextDrink === undefined;
  return (
    <section aria-labelledby="water-today-title" className="pb-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-5 py-4">
          <span aria-hidden="true" className="text-xl">
            🚰
          </span>
          <h2
            id="water-today-title"
            className="text-xl font-bold leading-[1.625rem]"
          >
            {t("waterToday.title")}
          </h2>
        </div>
        {isLoading && (
          <span role="status" className="sr-only">
            {t("waterToday.loading")}
          </span>
        )}
        <dl className="grid grid-cols-2 gap-px bg-border">
          {[
            { label: t("waterToday.drinks"), value: count && `${count}×` },
            { label: t("timers.nextWater"), value: nextDrink },
          ].map(({ label, value }) => (
            <div key={label} className="min-w-0 bg-card px-5 py-5">
              <dt className="text-sm font-medium text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-2 text-2xl font-bold tabular-nums">
                {value ?? (
                  <span
                    aria-hidden="true"
                    className="block h-7 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none"
                  />
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
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
      className="mb-6 rounded-xl bg-muted/70 px-5 py-5 sm:px-6"
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
  dog,
  now,
  onError,
  onOperationEnd,
  onOperationStart,
  onDiarySaved,
  onTransition,
  pendingOperation,
  timeFormatter,
}: {
  activeWalk: ActiveWalk | undefined;
  dog: DashboardDog;
  now: number | null;
  onError: (message: string) => void;
  onOperationEnd: () => void;
  onOperationStart: (
    operation: "walk-diary" | "walk-end" | "walk-start",
  ) => boolean;
  onDiarySaved: () => void;
  onTransition: (message: string) => void;
  pendingOperation: PendingOperation;
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
  const isBusy = pendingOperation !== null;

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
      <Button
        type="button"
        disabled
        variant="secondary"
        size="lg"
        className="mt-4 w-full justify-start"
      >
        {t("walk.checking")}
      </Button>
    );
  }

  if (activeWalk === null) {
    return (
      <div className="mt-4 rounded-xl bg-muted/70 p-3">
        <Button
          type="button"
          disabled={isBusy}
          size="lg"
          className="w-full justify-start"
          onClick={() => void start(Date.now())}
        >
          {pendingOperation === "walk-start" && !startForm.isOpen
            ? t("walk.starting")
            : t("walk.start")}
        </Button>
        {startForm.isOpen ? (
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
        ) : (
          <Button
            type="button"
            disabled={isBusy}
            variant="quiet"
            className="mt-2 w-full"
            onClick={() => openForm(updateStartForm, Date.now())}
          >
            {t("walk.startOtherTime")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="active-walk-title"
      className="mt-4 rounded-xl bg-secondary/70 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full bg-success"
              aria-hidden="true"
            />
            <h3 id="active-walk-title" className="text-xl font-bold leading-6">
              {t("walk.inProgress")}
            </h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            <Trans
              t={t}
              i18nKey="walk.startedAt"
              values={{ time: timeFormatter.format(activeWalk.at) }}
              components={{
                time: <time dateTime={new Date(activeWalk.at).toISOString()} />,
              }}
            />
          </p>
        </div>
        <strong className="shrink-0 text-xl font-bold tabular-nums leading-6">
          {now === null
            ? t("common.syncing")
            : formatElapsed(getElapsedMs(activeWalk.at, now), locale)}
        </strong>
      </div>
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
      <Button
        type="button"
        disabled={isBusy}
        size="lg"
        className="mt-4 w-full"
        onClick={() => void end(activeWalk, Date.now())}
      >
        {pendingOperation === "walk-end" && !endForm.isOpen
          ? t("walk.ending")
          : t("walk.end")}
      </Button>
      {endForm.isOpen ? (
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
      ) : (
        <Button
          type="button"
          disabled={isBusy}
          variant="quiet"
          className="mt-2 w-full"
          onClick={() => openForm(updateEndForm, Date.now())}
        >
          {t("walk.chooseEndTime")}
        </Button>
      )}
    </section>
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
  timeFormatter: Intl.DateTimeFormat;
  activityTypes: ActivityTypes | undefined;
  trainingCommands: TrainingCommands | undefined;
}) {
  const { t } = useTranslation("dashboard");
  const earlierDialogRef = useRef<HTMLDialogElement>(null);
  const walkPromptDialogRef = useRef<HTMLDialogElement>(null);
  const [isEarlier, setIsEarlier] = useState(false);
  const [earlierAction, setEarlierAction] = useState<EarlierAction | null>(
    null,
  );
  const [earlierAt, setEarlierAt] = useState<number | null>(null);
  const [walkPrompt, setWalkPrompt] = useState<WalkPrompt | null>(null);
  const walkPromptAction = walkPrompt?.action ?? null;
  const isBusy = pendingOperation !== null;
  const activeWalkKey = activeWalk?._id ?? "no-active-walk";
  const availableQuickActions =
    dog.waterIntervalMinutes === undefined ? defaultQuickActions : quickActions;
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
  return (
    <section aria-labelledby="quick-log-title" className="min-w-0">
      <h2
        id="quick-log-title"
        className="text-balance text-xl font-bold leading-[1.625rem]"
      >
        {t("quick.title")}
      </h2>

      <fieldset
        disabled={pendingOperation !== null}
        className="mt-3 border-b border-border pb-4"
      >
        <legend className="text-sm font-bold">{t("quick.when")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-input bg-input sm:max-w-md">
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
        <p className="mt-2 text-sm text-muted-foreground">
          {isEarlier ? t("quick.earlierHelp") : t("quick.currentTime")}
        </p>
      </fieldset>

      <div
        role="group"
        aria-labelledby="quick-log-title"
        className={`mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 ${dog.waterIntervalMinutes === undefined ? "lg:grid-cols-8" : "lg:grid-cols-9"}`}
      >
        {availableQuickActions.map(({ icon, kind }) => {
          const label = t(`events.${kind}`);
          const latestEvent = latest?.[kind];
          const isPottyAction = isPottyKind(kind);
          const isRestAction = kind === "wake" || kind === "sleep";
          const isCurrentRestState =
            (kind === "wake" && sleepState?.state === "awake") ||
            (kind === "sleep" && sleepState?.state === "asleep");
          const state =
            pendingOperation === kind
              ? t("backdate.logging")
              : isPottyAction && activeWalk === undefined
                ? t("quick.checkingWalk")
                : isRestAction && latest === undefined
                  ? t("quick.checkingRest")
                  : latest === undefined
                    ? t("common.checking")
                    : latestEvent
                      ? t("quick.lastAt", {
                          time: timeFormatter.format(latestEvent.at),
                        })
                      : t("quick.noLogs");
          if (kind === "pee") {
            return (
              <div key={kind} className="min-h-24 bg-card px-3 py-3 sm:px-4">
                <span className="flex items-center gap-2.5">
                  <span
                    className="w-5 shrink-0 text-center text-base leading-none"
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                  <strong className="text-sm leading-5 sm:text-base">
                    {label}
                  </strong>
                </span>
                <div className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border">
                  {(["inside", "outside"] as const).map((place) => (
                    <button
                      key={place}
                      type="button"
                      disabled={
                        isBusy ||
                        (place === "outside" && activeWalk === undefined)
                      }
                      aria-label={
                        place === "outside"
                          ? t("quick.logAria", { event: label })
                          : t("quick.logPeeAria", {
                              place: t(`peePlace.${place}`),
                            })
                      }
                      aria-busy={pendingOperation === "pee"}
                      aria-describedby="quick-state-pee"
                      className="min-h-11 bg-muted px-2 text-xs font-semibold transition-colors hover:bg-accent focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => log({ kind, label, peePlace: place })}
                    >
                      {t(`peePlace.${place}`)}
                      <span className="sr-only">
                        {activeWalk !== null && activeWalk !== undefined
                          ? t("quick.duringWalk", { state })
                          : state}
                      </span>
                    </button>
                  ))}
                </div>
                <span
                  id="quick-state-pee"
                  className="mt-1 block truncate text-xs leading-4 text-muted-foreground"
                >
                  {state}
                </span>
              </div>
            );
          }
          return (
            <button
              key={kind}
              type="button"
              disabled={
                isBusy ||
                (isPottyAction && activeWalk === undefined) ||
                (isRestAction && latest === undefined) ||
                isCurrentRestState
              }
              aria-label={t("quick.logAria", { event: label })}
              aria-describedby={`quick-state-${kind}`}
              aria-busy={pendingOperation === kind}
              className="min-h-24 bg-card px-3 py-3 text-left transition-colors duration-150 hover:bg-accent active:bg-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-busy:cursor-wait sm:px-4"
              onClick={() => log({ kind, label })}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="w-5 shrink-0 text-center text-base leading-none"
                  aria-hidden="true"
                >
                  {icon}
                </span>
                <strong className="text-sm leading-5 sm:text-base">
                  {label}
                </strong>
              </span>
              <span
                id={`quick-state-${kind}`}
                className="mt-2 block text-sm leading-5 text-muted-foreground"
              >
                {isPottyAction &&
                activeWalk !== null &&
                activeWalk !== undefined
                  ? t("quick.duringWalk", { state })
                  : state}
              </span>
            </button>
          );
        })}
        <EnrichmentQuickLog
          activityTypes={activityTypes}
          disabled={isBusy}
          dog={dog}
          isEarlier={isEarlier}
        />
        <TrainingQuickLog
          commands={trainingCommands}
          disabled={isBusy}
          dog={dog}
          isEarlier={isEarlier}
        />
      </div>

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

      <WalkControls
        key={`walk-controls-${activeWalkKey}`}
        activeWalk={activeWalk}
        dog={dog}
        now={now}
        onError={onError}
        onDiarySaved={onWalkDiarySaved}
        onOperationEnd={onBackdateOperationEnd}
        onOperationStart={onWalkOperationStart}
        onTransition={onWalkTransition}
        pendingOperation={pendingOperation}
        timeFormatter={timeFormatter}
      />

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
}: {
  activityTypes: ActivityTypes | undefined;
  disabled: boolean;
  dog: DashboardDog;
  isEarlier: boolean;
}) {
  const { t } = useTranslation("dashboard");
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
        className="min-h-24 bg-card px-3 py-3 text-left transition-colors duration-150 hover:bg-accent active:bg-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 sm:px-4"
        onClick={() => {
          setIsOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className="w-5 shrink-0 text-center">
            ✦
          </span>
          <strong className="text-sm leading-5 sm:text-base">
            {t("enrichment.label")}
          </strong>
        </span>
        <span
          id="quick-state-enrichment"
          className="mt-2 block text-sm leading-5 text-muted-foreground"
        >
          {activityTypes === undefined
            ? t("common.checking")
            : t("enrichment.choose")}
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
                  {active.map((activity) => (
                    <label
                      key={activity._id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 has-[:checked]:bg-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={activeSelected.includes(activity._id)}
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
                      <span className="font-semibold">{activity.name}</span>
                    </label>
                  ))}
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
}: {
  commands: TrainingCommands | undefined;
  disabled: boolean;
  dog: DashboardDog;
  isEarlier: boolean;
}) {
  const { t } = useTranslation("dashboard");
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
        className="min-h-24 bg-card px-3 py-3 text-left transition-colors duration-150 hover:bg-accent active:bg-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-4"
        onClick={() => {
          setIsOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className="w-4 shrink-0 text-center text-sm">
            ◆
          </span>
          <strong className="text-sm leading-5 sm:text-base">
            {t("training.label")}
          </strong>
        </span>
        <span
          id="quick-state-training"
          className="mt-2 block text-sm leading-5 text-muted-foreground"
        >
          {commands === undefined ? t("common.checking") : t("training.choose")}
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
                      return (
                        <div
                          key={command._id}
                          className="rounded-lg border border-border px-3 py-2 has-[:checked]:bg-secondary"
                        >
                          <label className="flex min-h-8 cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
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
                            <span className="font-semibold">
                              {command.name}
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
  const { dateFormatter, dayFormatter, timeFormatter } = useMemo(
    () => ({
      dateFormatter: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: dog.timezone,
        year: "numeric",
      }),
      dayFormatter: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        timeZone: dog.timezone,
        weekday: "long",
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
  const rightNowItems = [
    { label: t("timers.sinceMeal"), value: elapsed(latest?.meal) },
    {
      detail: nextMeal?.label,
      label: t("timers.nextMeal"),
      value:
        now === null || routines === undefined
          ? t("timers.syncing")
          : nextMeal
            ? formatElapsed(nextMeal.countdownMs, locale)
            : t("timers.noMeal"),
    },
    { label: t("timers.sincePee"), value: elapsed(latest?.pee) },
    { label: t("timers.sincePoop"), value: elapsed(latest?.poop) },
    {
      detail: sleepState
        ? sleepState.state === "awake"
          ? t("timers.awake")
          : t("timers.asleep")
        : undefined,
      label: t("timers.restState"),
      value:
        now === null || latest === undefined
          ? t("timers.syncing")
          : sleepState
            ? formatElapsed(getElapsedMs(sleepState.startedAt, now), locale)
            : t("timers.noState"),
    },
    {
      label:
        latestWalk && latestWalk.endedAt === undefined
          ? t("timers.currentWalk")
          : t("timers.sinceWalk"),
      value:
        now === null || latest === undefined
          ? t("timers.syncing")
          : latestWalk
            ? formatElapsed(
                getElapsedMs(latestWalk.endedAt ?? latestWalk.at, now),
                locale,
              )
            : t("timers.noWalk"),
    },
  ];
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
      <section className="py-6 sm:py-8" aria-labelledby="dashboard-title">
        <p className="text-sm font-medium text-muted-foreground">
          {now === null ? t("page.syncingDay") : dayFormatter.format(now)} ·{" "}
          {t("page.today")}
        </p>
        <h1
          id="dashboard-title"
          className="mt-2 text-balance text-[1.75rem] font-bold leading-[2.125rem]"
        >
          {t("page.greeting", { dogName: dog.name })}
        </h1>
        <p className="mt-3 max-w-[70ch] text-pretty text-base leading-6 text-muted-foreground">
          {t("page.description")}
        </p>
      </section>

      <RightNowSummary
        enrichment={enrichmentToday}
        isLoading={latest === undefined || routines === undefined}
        items={rightNowItems}
        training={trainingToday}
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

      {dog.waterIntervalMinutes !== undefined && (
        <WaterTodaySummary
          count={
            waterToday === undefined
              ? undefined
              : formatNumber(waterToday, locale)
          }
          nextDrink={nextWater}
        />
      )}

      <AgendaSummary agenda={agenda} />

      <div className="flex flex-col gap-8">
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
          timeFormatter={timeFormatter}
          trainingCommands={trainingCommands}
        />
        <RecentActivity
          activityTypesById={activityTypesById}
          dateFormatter={dateFormatter}
          dog={dog}
          now={now}
          recent={recent?.slice(0, 8)}
          timeFormatter={timeFormatter}
        />
      </div>
    </AppFrame>
  );
}

export default DashboardPage;
