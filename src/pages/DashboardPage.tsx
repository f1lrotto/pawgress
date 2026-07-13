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
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/i18n/format";
import { resolveBrowserLocale } from "@/i18n/locale";
import { getNextMealCountdown } from "@/lib/mealCountdown";
import { deriveSleepState, formatElapsed, getElapsedMs } from "@/lib/timers";
import {
  formatZonedDateTimeLocal,
  getZonedDayKeys,
  getZonedDayWindow,
  parseZonedDateTimeLocal,
} from "@/lib/zonedDateTime";

type QuickKind = "pee" | "poop" | "meal" | "treat" | "wake" | "sleep";
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
type TrainingDay = FunctionReturnType<typeof api.training.listDay>;
const countCompleted = (goals: ReadonlyArray<{ done: boolean }>) =>
  goals.filter(({ done }) => done).length;
type ActivityTypesById = ReadonlyMap<
  Id<"activityTypes">,
  ActivityTypes[number]
>;
type SleepState = ReturnType<typeof deriveSleepState>;
type DashboardDog = Pick<Doc<"dogs">, "_id" | "birthday" | "name" | "timezone">;
type BackdateState = {
  amount: string;
  attachToWalk: boolean;
  at: string;
  error: string;
  errors: { amount: string; at: string; note: string };
  isOpen: boolean;
  isPending: boolean;
  kind: QuickKind;
  note: string;
  peePlace: PeePlace;
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
  errors: { amount: "", at: "", note: "" },
  isOpen: false,
  isPending: false,
  kind: "pee",
  note: "",
  peePlace: "outside",
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
  { kind: "treat", icon: "🦴" },
  { kind: "wake", icon: "☀️" },
  { kind: "sleep", icon: "😴" },
] as const satisfies ReadonlyArray<{
  kind: QuickKind;
  icon: string;
}>;
const quickTimePresets = [5, 15, 30] as const;

const walkFieldClassName = "field-control mt-2 w-full";
const maxFutureMs = 5 * 60_000;
const getCurrentTime = () => Date.now();
const isPottyKind = (kind: QuickKind): kind is "pee" | "poop" =>
  kind === "pee" || kind === "poop";

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

function RightNowSummary({
  isLoading,
  items,
  training,
}: {
  isLoading: boolean;
  items: Array<{ detail?: string; label: string; value: string }>;
  training:
    | Array<{ count: number; displayCount: string; id: string; name: string }>
    | undefined;
}) {
  const { t } = useTranslation("dashboard");
  const maxTrainingCount = Math.max(
    1,
    ...(training?.map(({ count }) => count) ?? []),
  );
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
        <div className="border-t border-border bg-secondary/60 px-4 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <h3 className="text-balance text-sm font-semibold">
              {t("timers.trainingToday")}
            </h3>
            <Link
              to="/training"
              className="-my-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("timers.viewTraining")}
            </Link>
          </div>
          {training === undefined ? (
            <div className="mt-3">
              <span role="status" className="sr-only">
                {t("timers.trainingLoading")}
              </span>
              <span
                aria-hidden="true"
                className="block h-5 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none"
              />
            </div>
          ) : training.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("timers.noTraining")}
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(8rem,100%),1fr))] gap-x-6 gap-y-4">
              {training.map(({ count, displayCount, id, name }) => (
                <li key={id} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">
                      {name}
                    </span>
                    <span
                      aria-label={t("timers.trainingCount", { count, name })}
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
                      style={{
                        transform: `scaleX(${count / maxTrainingCount})`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

const countTraining = (sessions: TrainingDay, locale: string) =>
  Array.from(
    sessions.reduce((counts, { commandId, commandName }) => {
      const current = counts.get(commandId);
      counts.set(commandId, {
        count: (current?.count ?? 0) + 1,
        id: commandId,
        name: commandName,
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
            type="number"
            inputMode="decimal"
            min="0"
            max="10000"
            step="any"
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
}: {
  activeWalk: ActiveWalk | undefined;
  disabled: boolean;
  dog: DashboardDog;
  onLogged: (eventId: Id<"events">, label: string) => void;
  onOperationEnd: () => void;
  onOperationStart: () => boolean;
}) {
  const { t } = useTranslation("dashboard");
  const logQuick = useMutation(api.events.logQuick);
  const logPotty = useMutation(api.walks.logPotty);
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
  } = form;
  const showsAmount = kind === "meal" || kind === "treat";
  const isPotty = isPottyKind(kind);
  const parsedAt = parseZonedDateTimeLocal(at, dog.timezone);
  const isBeforeWalk =
    activeWalk !== null &&
    activeWalk !== undefined &&
    parsedAt !== null &&
    parsedAt < activeWalk.at;

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
    const amountValue = amount.trim() ? Number(amount) : undefined;
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
    };
    updateForm({ error: "", errors: nextErrors });
    const firstError = (["at", "note", "amount"] as const).find(
      (field) => nextErrors[field],
    );
    if (firstError) {
      document.getElementById(`backdate-${firstError}`)?.focus();
      return;
    }
    if (parsedAt === null) return;
    if (!onOperationStart()) return;

    submitting.current = true;
    updateForm({ isPending: true });
    try {
      const shouldAttach =
        activeWalk !== null &&
        activeWalk !== undefined &&
        isPotty &&
        attachToWalk &&
        peePlace === "outside" &&
        !isBeforeWalk;
      const eventId = shouldAttach
        ? await logPotty({
            dogId: dog._id,
            walkId: activeWalk._id,
            kind,
            at: parsedAt,
            peePlace: "outside",
            ...(normalizedNote ? { note: normalizedNote } : {}),
          })
        : await logQuick({
            dogId: dog._id,
            kind,
            at: parsedAt,
            ...(normalizedNote ? { note: normalizedNote } : {}),
            ...(showsAmount && amountValue !== undefined
              ? { amount: amountValue }
              : {}),
            ...(kind === "pee" ? { peePlace } : {}),
          });
      const label = t(`events.${kind}`);
      clear();
      onLogged(eventId, label);
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
                : t("backdate.saveError"),
            },
      );
    } finally {
      submitting.current = false;
      updateForm({ isPending: false });
      onOperationEnd();
    }
  };

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
      onSubmit={(event) => void submit(event, Date.now())}
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
              {quickActions.map(({ kind }) => (
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

        {isPotty &&
          (kind !== "pee" || peePlace === "outside") &&
          activeWalk !== null &&
          activeWalk !== undefined && (
            <WalkAttachmentField
              attachToWalk={attachToWalk}
              isBeforeWalk={isBeforeWalk}
              onChange={(attachToWalk) => updateForm({ attachToWalk })}
            />
          )}

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
              })
            }
          />
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
  lastCreatedId,
  latest,
  onLog,
  onBackdated,
  onBackdateOperationEnd,
  onBackdateOperationStart,
  onError,
  onUndo,
  onWalkDiarySaved,
  onWalkOperationStart,
  onWalkTransition,
  now,
  pendingOperation,
  sleepState,
  timeFormatter,
  trainingCommands,
}: {
  activeWalk: ActiveWalk | undefined;
  dog: DashboardDog;
  error: string;
  feedback: string;
  lastCreatedId: Id<"events"> | null;
  latest: LatestEvents | undefined;
  onBackdated: (eventId: Id<"events">, label: string) => void;
  onBackdateOperationEnd: () => void;
  onBackdateOperationStart: () => boolean;
  onError: (message: string) => void;
  onLog: (
    kind: QuickKind,
    label: string,
    at: number,
    peePlace?: PeePlace,
  ) => void;
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
  trainingCommands: TrainingCommands | undefined;
}) {
  const { t } = useTranslation("dashboard");
  const earlierDialogRef = useRef<HTMLDialogElement>(null);
  const [isEarlier, setIsEarlier] = useState(false);
  const [earlierAction, setEarlierAction] = useState<EarlierAction | null>(
    null,
  );
  const [earlierAt, setEarlierAt] = useState<number | null>(null);
  const isBusy = pendingOperation !== null;
  const activeWalkKey = activeWalk?._id ?? "no-active-walk";
  const log = (action: EarlierAction) => {
    if (!isEarlier) {
      onLog(action.kind, action.label, getCurrentTime(), action.peePlace);
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
  const submitEarlier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (earlierAction === null || earlierAt === null) return;
    onLog(
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
        className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 lg:grid-cols-7"
      >
        {quickActions.map(({ icon, kind }) => {
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
        <TrainingQuickLog
          commands={trainingCommands}
          disabled={isBusy}
          dog={dog}
          isEarlier={isEarlier}
        />
      </div>

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
      />

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/25 bg-background px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {(feedback || lastCreatedId) && (
        <div className="mt-5 flex min-h-12 items-center justify-between gap-3 border-t border-border py-3 text-sm">
          <span role="status">{feedback || t("quick.fallbackUndo")}</span>
          {lastCreatedId && (
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
  const logSessions = useMutation(api.training.logSessions);
  const [selected, setSelected] = useState<Array<Id<"trainingCommands">>>([]);
  const [rating, setRating] = useState<number | null>(null);
  const at = useRef<number | null>(null);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const close = () => dialogRef.current?.close();
  const reset = () => {
    setSelected([]);
    setRating(null);
    at.current = null;
    setError("");
    setIsOpen(false);
    setIsPending(false);
    openerRef.current?.focus();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isEarlier && at.current === null)
      return setError(t("quick.chooseEarlier"));
    if (selected.length === 0) return setError(t("training.selectCommand"));
    if (rating === null) return setError(t("training.selectAssessment"));
    setIsPending(true);
    setError("");
    try {
      await logSessions({
        dogId: dog._id,
        commandIds: selected,
        at: isEarlier && at.current !== null ? at.current : getCurrentTime(),
        rating,
      });
      close();
    } catch {
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
        className="col-span-2 min-h-24 bg-card px-3 py-3 text-left transition-colors duration-150 hover:bg-accent active:bg-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:col-span-2 sm:px-4 lg:col-span-1"
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
                    {commands?.map((command) => (
                      <label
                        key={command._id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 has-[:checked]:bg-secondary"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(command._id)}
                          onChange={() => {
                            setSelected((current) =>
                              current.includes(command._id)
                                ? current.filter((id) => id !== command._id)
                                : [...current, command._id],
                            );
                            setError("");
                          }}
                        />
                        <span className="font-semibold">{command.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="mt-5">
                  <legend className="text-sm font-bold">
                    {t("training.assessment")}
                  </legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([1, 3, 5] as const).map((value) => (
                      <label
                        key={value}
                        className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-border px-2 has-[:checked]:bg-secondary"
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name="training-rating"
                          value={value}
                          checked={rating === value}
                          onChange={() => {
                            setRating(value);
                            setError("");
                          }}
                        />
                        <span aria-hidden="true" className="text-xl">
                          {value === 1 ? "👎" : value === 3 ? "😐" : "👍"}
                        </span>
                        <span className="sr-only">
                          {t(`training.rating${value}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
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
    const amountValue = amount.trim() ? Number(amount) : undefined;
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
                type="number"
                inputMode="decimal"
                min="0"
                max="10000"
                step="any"
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
        <span className="text-muted-foreground">
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
        <p className="mt-2 text-sm text-muted-foreground">
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
        <ol className="mt-4 divide-y divide-border border-y border-border">
          {recent.map((event) => {
            const activityType =
              event.kind === "play" && event.activityTypeId !== undefined
                ? activityTypesById.get(event.activityTypeId)
                : undefined;
            const label = activityType
              ? [activityType.emoji, activityType.name]
                  .filter(Boolean)
                  .join(" ")
              : t(`events.${event.kind}`);
            const date = dateFormatter.format(event.at);
            const time = timeFormatter.format(event.at);
            const isWalk = event.kind === "walk";
            const playDuration =
              event.kind === "play" && event.endedAt !== undefined
                ? formatElapsed(getElapsedMs(event.at, event.endedAt), locale)
                : null;
            const isConfirming = confirmDeleteId === event._id;
            return (
              <li key={event._id} className="py-4">
                {editId === event._id ? (
                  <div className="rounded-lg bg-muted/70 p-4">
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
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-2">
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
                        className="shrink-0 text-right"
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
                        <p className="mt-2 text-sm text-muted-foreground">
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
  const recent = useQuery(api.events.listRecent, { dogId: dog._id, limit: 8 });
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
  const removeEvent = useMutation(api.events.remove);
  const [pendingOperation, setPendingOperation] =
    useState<PendingOperation>(null);
  const [lastCreatedId, setLastCreatedId] = useState<Id<"events"> | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const dayKeys = now === null ? null : getZonedDayKeys(now, dog.timezone);
  const dayWindow = dayKeys
    ? getZonedDayWindow(dayKeys.today, dog.timezone)
    : null;
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
        : countTraining(trainingDay, locale).map((item) => ({
            ...item,
            displayCount: formatNumber(item.count, locale),
          })),
    [locale, trainingDay],
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
  ) => {
    const isPotty = isPottyKind(kind);
    const canAttach = kind !== "pee" || peePlace === "outside";
    if (isPotty && canAttach && activeWalk === undefined) return;
    const attachedWalk =
      isPotty && canAttach && activeWalk && at >= activeWalk.at
        ? activeWalk
        : null;
    if (!beginOperation(kind)) return;
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
      setLastCreatedId(eventId);
      setFeedback(t("feedback.logged", { dogName: dog.name, event: label }));
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
    } finally {
      endOperation();
    }
  };

  const undo = async () => {
    const eventId = lastCreatedId;
    if (!eventId || !beginOperation("undo")) return;
    setFeedback(t("feedback.removing"));
    setError("");
    try {
      await removeEvent({ dogId: dog._id, eventId });
      setLastCreatedId(null);
      setFeedback(t("feedback.removed"));
    } catch {
      setFeedback("");
      setError(t("feedback.undoError"));
    } finally {
      endOperation();
    }
  };

  const backdated = (eventId: Id<"events">, label: string) => {
    setLastCreatedId(eventId);
    setError("");
    setFeedback(t("feedback.logged", { dogName: dog.name, event: label }));
  };

  const walkTransition = (message: string) => {
    setLastCreatedId(null);
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
        isLoading={latest === undefined || routines === undefined}
        items={rightNowItems}
        training={trainingToday}
      />

      <AgendaSummary agenda={agenda} />

      <div className="flex flex-col gap-8">
        <QuickLogSection
          activeWalk={activeWalk}
          dog={dog}
          error={error}
          feedback={feedback}
          lastCreatedId={lastCreatedId}
          latest={latest}
          onBackdated={backdated}
          onBackdateOperationEnd={endOperation}
          onBackdateOperationStart={startBackdateOperation}
          onError={setError}
          onLog={(kind, label, at, peePlace) =>
            void log(kind, label, at, peePlace)
          }
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
          recent={recent}
          timeFormatter={timeFormatter}
        />
      </div>
    </AppFrame>
  );
}

export default DashboardPage;
