import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import AppFrame from "@/components/AppFrame";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { resolveBrowserLocale } from "@/i18n/locale";
import { getZonedDayKeys } from "@/lib/zonedDateTime";

type AgendaDay = FunctionReturnType<typeof api.agenda.get>;
type Goal = NonNullable<AgendaDay>["enrichmentGoals"][number];
type Category = "enrichment" | "training";
type AgendaDog = Pick<Doc<"dogs">, "_id" | "birthday" | "name" | "timezone">;

const formatAgendaDate = (date: string, locale: Locale) =>
  formatDate(Date.parse(`${date}T00:00:00Z`), locale, "UTC", {
    dateStyle: "medium",
  });
const hasErrorCode = (error: unknown, code: string) =>
  (error instanceof Error && error.message.includes(code)) ||
  (typeof error === "object" &&
    error !== null &&
    "data" in error &&
    error.data === code);

function GoalSection({
  category,
  disabled,
  goals,
  onAdd,
  onRemove,
  onToggle,
  pending,
}: {
  category: Category;
  disabled: boolean;
  goals: Goal[];
  onAdd: (text: string) => Promise<boolean>;
  onRemove: (goal: Goal) => void;
  onToggle: (goal: Goal) => void;
  pending: string | null;
}) {
  const { i18n, t } = useTranslation("agenda");
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const inputId = `${category}-goal`;
  const isFull = goals.length >= 20;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = draft.normalize("NFKC").trim();
    const nextError = !normalized
      ? t("goals.descriptionRequired")
      : normalized.length > 160
        ? t("common.maxCharacters", {
            formattedMax: formatNumber(160, locale),
          })
        : "";
    setError(nextError);
    if (nextError) {
      document.getElementById(inputId)?.focus();
      return;
    }
    if (await onAdd(normalized)) setDraft("");
  };

  return (
    <section
      aria-labelledby={`${category}-goals-title`}
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3
          id={`${category}-goals-title`}
          className="text-balance text-xl font-bold leading-[1.625rem]"
        >
          {t(
            category === "enrichment"
              ? "goals.enrichmentTitle"
              : "goals.trainingTitle",
          )}
        </h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatNumber(goals.filter(({ done }) => done).length, locale)}/
          {formatNumber(goals.length, locale)}
        </span>
      </div>

      {goals.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">{t("goals.empty")}</p>
      ) : (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {goals.map((goal) => (
            <li key={goal.id} className="flex min-w-0 items-center gap-2 py-2">
              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1 font-semibold">
                <input
                  type="checkbox"
                  checked={goal.done}
                  disabled={disabled}
                  className="size-5 shrink-0 accent-primary"
                  onChange={() => onToggle(goal)}
                />
                <span
                  className={`min-w-0 [overflow-wrap:anywhere] ${goal.done ? "line-through opacity-60" : ""}`}
                >
                  {goal.text}
                </span>
              </label>
              <Button
                type="button"
                variant="quiet"
                aria-label={t("goals.removeAria", { goal: goal.text })}
                disabled={disabled}
                className="max-w-[45%] shrink-0 whitespace-normal px-3 text-center text-sm text-destructive"
                onClick={() => onRemove(goal)}
              >
                {pending === `remove:${category}:${goal.id}`
                  ? t("goals.removing")
                  : t("goals.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        aria-label={t(
          category === "enrichment"
            ? "goals.addEnrichmentAria"
            : "goals.addTrainingAria",
        )}
        className="mt-5 border-t border-foreground/10 pt-4"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <fieldset disabled={disabled} className="m-0 border-0 p-0">
          <label htmlFor={inputId} className="text-sm font-bold">
            {t(
              category === "enrichment"
                ? "goals.newEnrichment"
                : "goals.newTraining",
            )}
          </label>
          <input
            id={inputId}
            value={draft}
            maxLength={161}
            disabled={disabled || isFull}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? `${inputId}-count ${inputId}-error` : `${inputId}-count`
            }
            className="field-control mt-2 w-full"
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
          />
          <div
            id={`${inputId}-count`}
            className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground"
          >
            <span className="min-w-0 flex-1 break-words">
              {isFull
                ? t("goals.limit", {
                    count: 20,
                    formattedCount: formatNumber(20, locale),
                    formattedMax: formatNumber(20, locale),
                  })
                : t("goals.count", {
                    count: goals.length,
                    formattedCount: formatNumber(goals.length, locale),
                    formattedMax: formatNumber(20, locale),
                  })}
            </span>
            <span className="break-words">
              {t("common.characters", {
                count: draft.length,
                formattedCount: formatNumber(draft.length, locale),
                formattedMax: formatNumber(160, locale),
              })}
            </span>
          </div>
          {error && (
            <p
              id={`${inputId}-error`}
              className="mt-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={disabled || isFull}
            className="mt-3 w-full whitespace-normal text-center"
          >
            {pending === `add:${category}`
              ? t("goals.adding")
              : t(
                  category === "enrichment"
                    ? "goals.addEnrichment"
                    : "goals.addTraining",
                )}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}

function TextReflectionForm({
  disabled,
  id,
  label,
  maxLength,
  multiline = false,
  onSave,
  pending,
  serverValue,
  title,
}: {
  disabled: boolean;
  id: "diary" | "win";
  label: string;
  maxLength: number;
  multiline?: boolean;
  onSave: (value: string | null) => Promise<boolean>;
  pending: boolean;
  serverValue?: string;
  title: string;
}) {
  const { i18n, t } = useTranslation("agenda");
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const value = draft ?? serverValue ?? "";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = value.trim();
    const nextError =
      normalized.length > maxLength
        ? t("common.maxCharacters", {
            formattedMax: formatNumber(maxLength, locale),
          })
        : "";
    setError(nextError);
    if (nextError) {
      document.getElementById(`agenda-${id}`)?.focus();
      return;
    }
    if (await onSave(normalized || null)) setDraft(null);
  };

  const fieldProps = {
    id: `agenda-${id}`,
    value,
    "aria-invalid": Boolean(error),
    "aria-describedby": error
      ? `agenda-${id}-count agenda-${id}-error`
      : `agenda-${id}-count`,
    className: `field-control mt-2 w-full ${multiline ? "min-h-36" : ""}`,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setDraft(event.target.value);
      setError("");
    },
  };

  return (
    <form
      aria-label={t(
        id === "win" ? "reflection.saveWinAria" : "reflection.saveDiaryAria",
      )}
      aria-busy={pending}
      className={`min-w-0 border-t border-border pt-5 ${id === "diary" ? "md:col-span-2" : ""}`}
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={disabled} className="m-0 border-0 p-0">
        <legend className="sr-only">{title}</legend>
        <label htmlFor={`agenda-${id}`} className="block text-sm font-bold">
          {label}
        </label>
        {multiline ? <textarea {...fieldProps} /> : <input {...fieldProps} />}
        <p
          id={`agenda-${id}-count`}
          className="mt-2 break-words text-xs text-muted-foreground"
        >
          {t("common.characters", {
            count: value.length,
            formattedCount: formatNumber(value.length, locale),
            formattedMax: formatNumber(maxLength, locale),
          })}
        </p>
        {error && (
          <p
            id={`agenda-${id}-error`}
            className="mt-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="mt-4 w-full whitespace-normal text-center"
        >
          {pending
            ? t("common.saving")
            : t(id === "win" ? "reflection.saveWin" : "reflection.saveDiary")}
        </Button>
      </fieldset>
    </form>
  );
}

function RatingForm({
  disabled,
  onSave,
  pending,
  serverValue,
}: {
  disabled: boolean;
  onSave: (value: number | null) => Promise<boolean>;
  pending: boolean;
  serverValue?: number;
}) {
  const { t } = useTranslation("agenda");
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const value = draft ?? serverValue?.toString() ?? "";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const rating = value === "" ? null : Number(value);
    const nextError =
      rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)
        ? t("reflection.ratingError")
        : "";
    setError(nextError);
    if (nextError) {
      document.getElementById("agenda-rating")?.focus();
      return;
    }
    if (await onSave(rating)) setDraft(null);
  };

  return (
    <form
      aria-label={t("reflection.saveRating")}
      aria-busy={pending}
      className="min-w-0 border-t border-border pt-5"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={disabled} className="m-0 border-0 p-0">
        <legend className="sr-only">{t("reflection.rating")}</legend>
        <label htmlFor="agenda-rating" className="block text-sm font-bold">
          {t("reflection.rating")}
        </label>
        <input
          id="agenda-rating"
          type="number"
          inputMode="numeric"
          min="1"
          max="5"
          step="1"
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error
              ? "agenda-rating-help agenda-rating-error"
              : "agenda-rating-help"
          }
          className="field-control mt-2 w-full"
          onChange={(event) => {
            setDraft(event.target.value);
            setError("");
          }}
        />
        <p
          id="agenda-rating-help"
          className="mt-2 text-xs text-muted-foreground"
        >
          {t("reflection.ratingHelp")}
        </p>
        {error && (
          <p id="agenda-rating-error" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="mt-4 w-full whitespace-normal text-center"
        >
          {pending ? t("common.saving") : t("reflection.saveRating")}
        </Button>
      </fieldset>
    </form>
  );
}

function TodayAgenda({
  date,
  dateLabel,
  day,
  dog,
}: {
  date: string;
  dateLabel: string;
  day: AgendaDay | undefined;
  dog: AgendaDog;
}) {
  const { t } = useTranslation("agenda");
  const addGoal = useMutation(api.agenda.addGoal);
  const setGoalDone = useMutation(api.agenda.setGoalDone);
  const removeGoal = useMutation(api.agenda.removeGoal);
  const setWin = useMutation(api.agenda.setWin);
  const setRating = useMutation(api.agenda.setRating);
  const setDiary = useMutation(api.agenda.setDiary);
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const operationPending = useRef(false);
  const isBusy = pending !== null;

  const begin = (operation: string) => {
    if (operationPending.current) return false;
    operationPending.current = true;
    setPending(operation);
    setStatus("");
    setError("");
    return true;
  };
  const end = () => {
    operationPending.current = false;
    setPending(null);
  };
  const run = async ({
    action,
    fallback,
    focusId,
    operation,
    success,
  }: {
    action: () => Promise<unknown>;
    fallback: string;
    focusId?: string;
    operation: string;
    success: string;
  }) => {
    if (!begin(operation)) return false;
    try {
      await action();
      setStatus(success);
      return true;
    } catch (caught) {
      setError(
        hasErrorCode(caught, "AGENDA_READ_ONLY")
          ? t("goals.readOnly")
          : hasErrorCode(caught, "AGENDA_GOAL_NOT_FOUND")
            ? t("goals.changedElsewhere")
            : hasErrorCode(caught, "AGENDA_GOAL_LIMIT")
              ? t(
                  operation.endsWith("enrichment")
                    ? "goals.limitErrorEnrichment"
                    : "goals.limitErrorTraining",
                )
              : fallback,
      );
      if (focusId) document.getElementById(focusId)?.focus();
      return false;
    } finally {
      end();
    }
  };

  if (day === undefined) {
    return (
      <section aria-label={t("today.aria")}>
        <p role="status" className="sr-only">
          {t("today.loading")}
        </p>
        <div
          aria-hidden="true"
          className="animate-pulse motion-reduce:animate-none"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="h-6 w-36 rounded bg-muted" />
            <div className="h-5 w-24 rounded bg-muted" />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="h-6 w-40 rounded bg-muted" />
                <div className="mt-5 h-11 rounded bg-muted" />
                <div className="mt-4 h-11 rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="mt-8 border-t border-border pt-6">
            <div className="h-6 w-28 rounded bg-muted" />
            <div className="mt-4 h-24 rounded bg-muted" />
          </div>
        </div>
      </section>
    );
  }

  const enrichmentGoals = day?.enrichmentGoals ?? [];
  const trainingGoals = day?.trainingGoals ?? [];
  const add = (category: Category, text: string) =>
    run({
      action: () => addGoal({ dogId: dog._id, date, category, text }),
      fallback: t(
        category === "enrichment"
          ? "goals.addErrorEnrichment"
          : "goals.addErrorTraining",
      ),
      focusId: `${category}-goal`,
      operation: `add:${category}`,
      success: t(
        category === "enrichment"
          ? "goals.addedEnrichment"
          : "goals.addedTraining",
      ),
    });
  const toggle = (category: Category, goal: Goal) =>
    void run({
      action: () =>
        setGoalDone({
          dogId: dog._id,
          date,
          category,
          goalId: goal.id,
          done: !goal.done,
        }),
      fallback: t("goals.updateError"),
      operation: `toggle:${category}:${goal.id}`,
      success: t("goals.updated", {
        category: t(`categories.${category}`),
      }),
    });
  const remove = (category: Category, goal: Goal) =>
    void run({
      action: () =>
        removeGoal({ dogId: dog._id, date, category, goalId: goal.id }),
      fallback: t("goals.removeError"),
      operation: `remove:${category}:${goal.id}`,
      success: t("goals.removed", {
        category: t(`categories.${category}`),
      }),
    });

  return (
    <section aria-label={t("today.aria")} aria-busy={isBusy}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-4">
        <h2 className="text-balance text-xl font-bold leading-[1.625rem]">
          {t("today.title")}
        </h2>
        <time
          dateTime={date}
          className="text-sm font-medium text-muted-foreground"
        >
          {dateLabel}
        </time>
      </div>

      {status && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-sm font-bold text-primary"
        >
          {status}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/25 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <GoalSection
          category="enrichment"
          disabled={isBusy}
          goals={enrichmentGoals}
          onAdd={(text) => add("enrichment", text)}
          onRemove={(goal) => remove("enrichment", goal)}
          onToggle={(goal) => toggle("enrichment", goal)}
          pending={pending}
        />
        <GoalSection
          category="training"
          disabled={isBusy}
          goals={trainingGoals}
          onAdd={(text) => add("training", text)}
          onRemove={(goal) => remove("training", goal)}
          onToggle={(goal) => toggle("training", goal)}
          pending={pending}
        />
      </div>

      <section
        className="mt-8 border-t border-border pt-6"
        aria-labelledby="reflection-title"
      >
        <h3
          id="reflection-title"
          className="text-balance text-xl font-bold leading-[1.625rem]"
        >
          {t("today.reflectionTitle")}
        </h3>
        <div className="mt-4 grid min-w-0 gap-x-6 gap-y-5 md:grid-cols-2">
          <TextReflectionForm
            disabled={isBusy}
            id="win"
            label={t("reflection.win")}
            maxLength={500}
            onSave={(win) =>
              run({
                action: () => setWin({ dogId: dog._id, date, win }),
                fallback: t("reflection.winSaveError"),
                focusId: "agenda-win",
                operation: "win",
                success: t("reflection.winSaved"),
              })
            }
            pending={pending === "win"}
            serverValue={day?.win}
            title={t("reflection.win")}
          />
          <RatingForm
            disabled={isBusy}
            onSave={(rating) =>
              run({
                action: () => setRating({ dogId: dog._id, date, rating }),
                fallback: t("reflection.ratingSaveError"),
                focusId: "agenda-rating",
                operation: "rating",
                success: t("reflection.ratingSaved"),
              })
            }
            pending={pending === "rating"}
            serverValue={day?.rating}
          />
          <TextReflectionForm
            disabled={isBusy}
            id="diary"
            label={t("reflection.diary")}
            maxLength={4_000}
            multiline
            onSave={(diary) =>
              run({
                action: () => setDiary({ dogId: dog._id, date, diary }),
                fallback: t("reflection.diarySaveError"),
                focusId: "agenda-diary",
                operation: "diary",
                success: t("reflection.diarySaved"),
              })
            }
            pending={pending === "diary"}
            serverValue={day?.diary}
            title={t("reflection.diaryTitle")}
          />
        </div>
      </section>
    </section>
  );
}

function ReadonlyGoals({ goals, title }: { goals: Goal[]; title: string }) {
  const { t } = useTranslation("agenda");
  return (
    <section aria-label={title} className="min-w-0 border-t border-border pt-4">
      <h3 className="text-base font-semibold">{title}</h3>
      {goals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("yesterday.noGoals")}
        </p>
      ) : (
        <ul className="mt-2 min-w-0 divide-y divide-border">
          {goals.map((goal) => (
            <li
              key={goal.id}
              className="flex min-w-0 items-start gap-2 py-2 text-sm"
            >
              <span aria-hidden="true" className="font-semibold text-primary">
                {goal.done ? "✅" : "⭕"}
              </span>
              <span className="sr-only">
                {t(
                  goal.done
                    ? "yesterday.completeStatus"
                    : "yesterday.openStatus",
                )}
              </span>
              <span
                className={`min-w-0 [overflow-wrap:anywhere] ${goal.done ? "line-through opacity-60" : ""}`}
              >
                {goal.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function YesterdayAgenda({
  date,
  dateLabel,
  day,
}: {
  date: string;
  dateLabel: string;
  day: AgendaDay | undefined;
}) {
  const { i18n, t } = useTranslation("agenda");
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  return (
    <section
      aria-label={t("yesterday.aria")}
      className="min-w-0 rounded-xl border border-border bg-muted p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-balance text-xl font-bold leading-[1.625rem]">
          {t("yesterday.title")}
        </h2>
        <time
          dateTime={date}
          className="text-sm font-medium text-muted-foreground"
        >
          {dateLabel}
        </time>
      </div>
      {day === undefined ? (
        <>
          <p role="status" className="sr-only">
            {t("yesterday.loading")}
          </p>
          <div
            aria-hidden="true"
            className="mt-5 animate-pulse space-y-4 border-t border-border pt-4 motion-reduce:animate-none"
          >
            <div className="h-5 w-2/3 rounded bg-secondary" />
            <div className="h-4 w-full rounded bg-secondary" />
            <div className="h-4 w-4/5 rounded bg-secondary" />
            <div className="h-16 rounded bg-secondary" />
          </div>
        </>
      ) : day === null ? (
        <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
          {t("yesterday.empty")}
        </p>
      ) : (
        <div className="mt-5 min-w-0 space-y-4">
          <ReadonlyGoals
            title={t("yesterday.enrichmentHistory")}
            goals={day.enrichmentGoals}
          />
          <ReadonlyGoals
            title={t("yesterday.trainingHistory")}
            goals={day.trainingGoals}
          />
          <dl className="min-w-0 space-y-4 border-t border-border pt-4 text-sm">
            <div className="min-w-0">
              <dt className="font-semibold text-muted-foreground">
                {t("yesterday.win")}
              </dt>
              <dd className="mt-1 min-w-0 break-words">
                {day.win ?? t("yesterday.notRecorded")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="font-semibold text-muted-foreground">
                {t("yesterday.rating")}
              </dt>
              <dd className="mt-1">
                {day.rating
                  ? `${formatNumber(day.rating, locale)}/${formatNumber(5, locale)}`
                  : t("yesterday.notRated")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="font-semibold text-muted-foreground">
                {t("yesterday.diary")}
              </dt>
              <dd className="mt-1 min-w-0 whitespace-pre-wrap break-words">
                {day.diary ?? t("yesterday.noDiary")}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}

function AgendaPage({ dog }: { dog: AgendaDog }) {
  const { i18n, t } = useTranslation("agenda");
  const locale = resolveBrowserLocale([i18n.resolvedLanguage ?? i18n.language]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const dayKeys = getZonedDayKeys(now, dog.timezone);
  const today = useQuery(
    api.agenda.get,
    dayKeys ? { dogId: dog._id, date: dayKeys.today } : "skip",
  );
  const yesterday = useQuery(
    api.agenda.get,
    dayKeys ? { dogId: dog._id, date: dayKeys.yesterday } : "skip",
  );

  return (
    <AppFrame dogName={dog.name}>
      <header className="min-w-0 py-6 sm:py-8">
        <h1
          id="agenda-title"
          className="text-balance text-[1.75rem] font-bold leading-[2.125rem]"
        >
          {t("page.title")}
        </h1>
        <p className="mt-3 min-w-0 max-w-[70ch] text-pretty text-base leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          {t("page.description", { dogName: dog.name })}
        </p>
      </header>
      {!dayKeys ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t("page.timezoneError", { dogName: dog.name })}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
          <TodayAgenda
            key={dayKeys.today}
            date={dayKeys.today}
            dateLabel={formatAgendaDate(dayKeys.today, locale)}
            day={today}
            dog={dog}
          />
          <YesterdayAgenda
            date={dayKeys.yesterday}
            dateLabel={formatAgendaDate(dayKeys.yesterday, locale)}
            day={yesterday}
          />
        </div>
      )}
    </AppFrame>
  );
}

export default AgendaPage;
