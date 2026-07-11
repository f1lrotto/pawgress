import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import AppFrame from "@/components/AppFrame";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import {
  formatZonedDateTimeLocal,
  parseZonedDateTimeLocal,
} from "@/lib/zonedDateTime";

type TrainingDog = Pick<Doc<"dogs">, "_id" | "birthday" | "name" | "timezone">;
type Status = "learning" | "solid" | "mastered";
type Operation =
  "archive" | "create" | "edit" | "restore" | "session" | "status";
type TextErrors = { description?: string; howToTrain?: string; name?: string };
type SessionErrors = { at?: string; notes?: string; rating?: string };
type EditDraft = {
  commandId: Id<"trainingCommands">;
  description: string;
  errors: TextErrors;
  howToTrain: string;
  name: string;
  touched: Partial<Record<keyof TextErrors, true>>;
};
type TrainingDetail = FunctionReturnType<typeof api.training.get>;
type SessionInput = {
  at: number;
  notes?: string;
  rating: number;
};

const statusOptions = ["learning", "solid", "mastered"] as const;
type TrainingT = TFunction<"training">;

const hasErrorCode = (error: unknown, code: string) =>
  (error instanceof Error && error.message.includes(code)) ||
  (typeof error === "object" &&
    error !== null &&
    "data" in error &&
    error.data === code);

const friendlyError = (error: unknown, fallback: string, t: TrainingT) => {
  if (hasErrorCode(error, "DUPLICATE_COMMAND")) {
    return t("errors.duplicate");
  }
  if (hasErrorCode(error, "INVALID_NAME")) return t("errors.invalidName");
  if (hasErrorCode(error, "INVALID_DESCRIPTION"))
    return t("errors.descriptionLength");
  if (hasErrorCode(error, "INVALID_HOW_TO_TRAIN"))
    return t("errors.howToLength");
  if (hasErrorCode(error, "INVALID_RATING")) return t("errors.rating");
  if (hasErrorCode(error, "INVALID_NOTES")) return t("errors.notesLength");
  if (hasErrorCode(error, "INVALID_TIMESTAMP")) return t("errors.timestamp");
  if (hasErrorCode(error, "COMMAND_ARCHIVED")) return t("errors.archived");
  if (hasErrorCode(error, "COMMAND_NOT_FOUND")) return t("errors.notFound");
  if (hasErrorCode(error, "FORBIDDEN")) return t("errors.forbidden");
  return fallback;
};

const validateText = (
  name: string,
  description: string,
  howToTrain: string,
  t: TrainingT,
) => ({
  name: !name.trim()
    ? t("errors.nameRequired")
    : name.trim().length > 64
      ? t("errors.nameLength")
      : undefined,
  description:
    description.trim().length > 1_000
      ? t("errors.descriptionBound")
      : undefined,
  howToTrain:
    howToTrain.trim().length > 2_000 ? t("errors.howToBound") : undefined,
});

const firstError = <T extends Record<string, string | undefined>>(errors: T) =>
  Object.keys(errors).find((key) => errors[key] !== undefined);

function FieldError({ id, children }: { children?: string; id: string }) {
  return children ? (
    <p id={id} className="mt-2 text-sm font-bold text-destructive">
      {children}
    </p>
  ) : null;
}

function TrainingSessionPanel({
  command,
  dog,
  isBusy,
  onSubmit,
  pending,
  sessions,
}: {
  command: TrainingDetail["command"];
  dog: TrainingDog;
  isBusy: boolean;
  onSubmit: (input: SessionInput) => Promise<boolean>;
  pending: boolean;
  sessions: TrainingDetail["sessions"];
}) {
  const { i18n, t } = useTranslation("training");
  const locale = i18n.resolvedLanguage as Locale;
  const birthdayLabel = formatDate(
    new Date(`${dog.birthday}T12:00:00.000Z`),
    locale,
    "UTC",
  );
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [at, setAt] = useState("");
  const [errors, setErrors] = useState<SessionErrors>({});
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: dog.timezone,
      }),
    [dog.timezone, locale],
  );

  const submit = async (event: FormEvent<HTMLFormElement>, now: number) => {
    event.preventDefault();
    const numericRating = Number(rating);
    const parsedAt = useCurrentTime
      ? now
      : parseZonedDateTimeLocal(at, dog.timezone);
    const nextErrors: SessionErrors = {
      rating:
        !Number.isInteger(numericRating) ||
        numericRating < 1 ||
        numericRating > 5
          ? t("errors.rating")
          : undefined,
      notes: notes.trim().length > 500 ? t("errors.notesBound") : undefined,
      at:
        parsedAt === null
          ? t("errors.invalidTime")
          : !useCurrentTime && at.slice(0, 10) < dog.birthday
            ? t("errors.boundary", { date: birthdayLabel })
            : parsedAt > now + 5 * 60_000
              ? t("errors.future")
              : undefined,
    };
    setErrors(nextErrors);
    const invalid = firstError(nextErrors);
    if (invalid) {
      document.getElementById(`session-${invalid}`)?.focus();
      return;
    }
    if (parsedAt === null) return;
    if (
      await onSubmit({
        at: parsedAt,
        rating: numericRating,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
    ) {
      setRating("");
      setNotes("");
      setErrors({});
      setUseCurrentTime(true);
      setAt("");
    }
  };

  return (
    <div className="mt-9 grid min-w-0 gap-7 border-t border-border pt-8 xl:grid-cols-[0.8fr_1.2fr]">
      <form
        aria-label={t("aria.logSession")}
        aria-busy={pending}
        className="min-w-0"
        noValidate
        onSubmit={(event) => void submit(event, Date.now())}
      >
        <fieldset
          disabled={isBusy || command.isArchived}
          className="m-0 border-0 p-0"
        >
          <legend className="text-xl font-bold leading-[1.625rem]">
            {t("session.practiceLog")}
          </legend>
          <div className="mt-5">
            <label htmlFor="session-rating" className="text-sm font-bold">
              {t("session.rating")}
            </label>
            <input
              id="session-rating"
              type="number"
              min="1"
              max="5"
              step="1"
              inputMode="numeric"
              value={rating}
              aria-invalid={Boolean(errors.rating)}
              aria-describedby={
                errors.rating ? "session-rating-error" : "session-rating-help"
              }
              className="field-control mt-2 w-full"
              onChange={(event) => {
                setRating(event.target.value);
                setErrors((current) => ({ ...current, rating: undefined }));
              }}
            />
            <FieldError id="session-rating-error">{errors.rating}</FieldError>
            {!errors.rating && (
              <p
                id="session-rating-help"
                className="mt-2 text-xs text-muted-foreground"
              >
                {t("session.ratingHelp")}
              </p>
            )}
          </div>
          <div className="mt-5">
            <label htmlFor="session-notes" className="text-sm font-bold">
              {t("session.notes")}
            </label>
            <textarea
              id="session-notes"
              value={notes}
              maxLength={500}
              rows={3}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={
                errors.notes ? "session-notes-error" : undefined
              }
              className="field-control mt-2 w-full"
              onChange={(event) => {
                setNotes(event.target.value);
                setErrors((current) => ({ ...current, notes: undefined }));
              }}
            />
            <FieldError id="session-notes-error">{errors.notes}</FieldError>
          </div>
          {useCurrentTime ? (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {t("session.now", { timezone: dog.timezone })}
              </p>
              <Button
                type="button"
                variant="quiet"
                className="mt-1 whitespace-normal px-2 text-sm underline underline-offset-4"
                onClick={() => {
                  setUseCurrentTime(false);
                  setAt(
                    formatZonedDateTimeLocal(Date.now(), dog.timezone) ?? "",
                  );
                }}
              >
                {t("actions.chooseTime")}
              </Button>
            </div>
          ) : (
            <div className="mt-5">
              <label htmlFor="session-at" className="text-sm font-bold">
                {t("session.dateTime")}
              </label>
              <input
                id="session-at"
                type="datetime-local"
                step="60"
                value={at}
                aria-invalid={Boolean(errors.at)}
                aria-describedby={
                  errors.at
                    ? "session-at-error session-timezone"
                    : "session-timezone"
                }
                className="field-control mt-2 w-full"
                onChange={(event) => {
                  setAt(event.target.value);
                  setErrors((current) => ({ ...current, at: undefined }));
                }}
              />
              <FieldError id="session-at-error">{errors.at}</FieldError>
              <p
                id="session-timezone"
                className="mt-2 text-xs text-muted-foreground [overflow-wrap:anywhere]"
              >
                {t("session.timezone", { timezone: dog.timezone })}
              </p>
              <Button
                type="button"
                variant="quiet"
                className="mt-2 whitespace-normal px-2 text-sm underline underline-offset-4"
                onClick={() => {
                  setUseCurrentTime(true);
                  setErrors((current) => ({ ...current, at: undefined }));
                }}
              >
                {t("actions.useCurrentTime")}
              </Button>
            </div>
          )}
          <Button type="submit" className="mt-5 w-full">
            {pending ? t("actions.logging") : t("actions.log")}
          </Button>
        </fieldset>
      </form>

      <section aria-labelledby="history-title" className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3
            id="history-title"
            className="text-xl font-bold leading-[1.625rem]"
          >
            {t("session.recent")}
          </h3>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {t("session.count", { count: sessions.length })}
          </span>
        </div>
        {sessions.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">
            {t("session.empty")}
          </p>
        ) : (
          <ol
            aria-label={t("aria.sessions")}
            className="mt-5 divide-y divide-border border-y border-border"
          >
            {[...sessions]
              .sort((left, right) => right.at - left.at)
              .map((item) => (
                <li key={item._id} className="min-w-0 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <time
                      dateTime={new Date(item.at).toISOString()}
                      className="min-w-0 text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]"
                    >
                      {formatter.format(item.at)}
                    </time>
                    <span
                      aria-label={t("aria.rating", {
                        rating: formatNumber(item.rating, locale),
                      })}
                      className="shrink-0 font-semibold tabular-nums"
                    >
                      {formatNumber(item.rating, locale)}/
                      {formatNumber(5, locale)}
                    </span>
                  </div>
                  {item.notes && (
                    <p className="mt-3 whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere]">
                      {item.notes}
                    </p>
                  )}
                </li>
              ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function TrainingPage({ dog }: { dog: TrainingDog }) {
  const { t } = useTranslation("training");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("command");
  const commands = useQuery(api.training.list, {
    dogId: dog._id,
    includeArchived: true,
    limit: 100,
  });
  const selectedSummary = commands?.find(({ _id }) => _id === selectedId);
  const detail = useQuery(
    api.training.get,
    selectedSummary
      ? {
          dogId: dog._id,
          commandId: selectedSummary._id,
          sessionLimit: 100,
        }
      : "skip",
  );
  const createCommand = useMutation(api.training.create);
  const updateCommand = useMutation(api.training.update);
  const setArchived = useMutation(api.training.setArchived);
  const logSession = useMutation(api.training.logSession);
  const [pending, setPending] = useState<Operation | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createHowTo, setCreateHowTo] = useState("");
  const [createErrors, setCreateErrors] = useState<TextErrors>({});
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] =
    useState<Id<"trainingCommands"> | null>(null);
  const operationLock = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const selectedCommand = detail?.command;
  const isBusy = pending !== null;
  const currentDraft =
    editDraft?.commandId === selectedCommand?._id ? editDraft : null;
  const editName = currentDraft?.touched.name
    ? currentDraft.name
    : (selectedCommand?.name ?? "");
  const editDescription = currentDraft?.touched.description
    ? currentDraft.description
    : (selectedCommand?.description ?? "");
  const editHowTo = currentDraft?.touched.howToTrain
    ? currentDraft.howToTrain
    : (selectedCommand?.howToTrain ?? "");
  const visibleEditErrors = currentDraft?.errors ?? {};
  const hasTouchedEdit = Boolean(
    currentDraft && Object.keys(currentDraft.touched).length,
  );
  const confirmArchive = confirmArchiveId === selectedCommand?._id;

  useEffect(() => {
    if (feedback) statusRef.current?.focus();
  }, [feedback]);

  useEffect(() => {
    if (!selectedCommand?._id) return;
    detailRef.current?.focus({ preventScroll: true });
    detailRef.current?.scrollIntoView({ block: "start" });
  }, [selectedCommand?._id]);

  const begin = (operation: Operation) => {
    if (operationLock.current) return false;
    operationLock.current = true;
    setPending(operation);
    setFeedback("");
    setError("");
    return true;
  };

  const end = () => {
    operationLock.current = false;
    setPending(null);
  };

  const changeEdit = (field: keyof TextErrors, value: string) => {
    if (!selectedCommand) return;
    setEditDraft({
      commandId: selectedCommand._id,
      errors: { ...visibleEditErrors, [field]: undefined },
      name: editName,
      description: editDescription,
      howToTrain: editHowTo,
      touched: { ...currentDraft?.touched, [field]: true },
      [field]: value,
    });
  };

  const select = (commandId: Id<"trainingCommands">) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("command", commandId);
      return next;
    });
    setFeedback("");
    setError("");
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validateText(createName, createDescription, createHowTo, t);
    setCreateErrors(errors);
    const invalid = firstError(errors);
    if (invalid) {
      document.getElementById(`create-${invalid}`)?.focus();
      return;
    }
    if (!begin("create")) return;
    try {
      const commandId = await createCommand({
        dogId: dog._id,
        name: createName.trim(),
        ...(createDescription.trim()
          ? { description: createDescription.trim() }
          : {}),
        ...(createHowTo.trim() ? { howToTrain: createHowTo.trim() } : {}),
      });
      setCreateName("");
      setCreateDescription("");
      setCreateHowTo("");
      setCreateErrors({});
      select(commandId);
      setFeedback(t("success.created"));
    } catch (caught) {
      setError(friendlyError(caught, t("errors.createFailed"), t));
    } finally {
      end();
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !selectedCommand ||
      selectedCommand.isArchived ||
      !currentDraft ||
      !hasTouchedEdit
    )
      return;
    const errors = validateText(editName, editDescription, editHowTo, t);
    setEditDraft({
      commandId: selectedCommand._id,
      errors,
      name: editName,
      description: editDescription,
      howToTrain: editHowTo,
      touched: currentDraft.touched,
    });
    const invalid = firstError(errors);
    if (invalid) {
      document.getElementById(`edit-${invalid}`)?.focus();
      return;
    }
    if (!begin("edit")) return;
    try {
      await updateCommand({
        dogId: dog._id,
        commandId: selectedCommand._id,
        ...(currentDraft.touched.name ? { name: editName.trim() } : {}),
        ...(currentDraft.touched.description
          ? { description: editDescription.trim() || null }
          : {}),
        ...(currentDraft.touched.howToTrain
          ? { howToTrain: editHowTo.trim() || null }
          : {}),
      });
      setEditDraft((current) =>
        current?.commandId === selectedCommand._id
          ? { ...current, touched: {}, errors: {} }
          : current,
      );
      setFeedback(t("success.saved"));
    } catch (caught) {
      setError(friendlyError(caught, t("errors.editFailed"), t));
    } finally {
      end();
    }
  };

  const changeStatus = async (status: Status) => {
    if (!selectedCommand || selectedCommand.isArchived || !begin("status"))
      return;
    try {
      await updateCommand({
        dogId: dog._id,
        commandId: selectedCommand._id,
        status,
      });
      setFeedback(t("success.status", { status: t(`status.${status}`) }));
    } catch (caught) {
      setError(friendlyError(caught, t("errors.statusFailed"), t));
    } finally {
      end();
    }
  };

  const archive = async (isArchived: boolean) => {
    if (!selectedCommand || !begin(isArchived ? "archive" : "restore")) return;
    try {
      await setArchived({
        dogId: dog._id,
        commandId: selectedCommand._id,
        isArchived,
      });
      setConfirmArchiveId(null);
      setFeedback(isArchived ? t("success.archived") : t("success.restored"));
    } catch (caught) {
      setError(
        friendlyError(
          caught,
          isArchived ? t("errors.archiveFailed") : t("errors.restoreFailed"),
          t,
        ),
      );
    } finally {
      end();
    }
  };

  const submitSession = async ({ at, notes, rating }: SessionInput) => {
    if (!selectedCommand || selectedCommand.isArchived) return false;
    if (!begin("session")) return false;
    try {
      await logSession({
        dogId: dog._id,
        commandId: selectedCommand._id,
        at,
        rating,
        ...(notes ? { notes } : {}),
      });
      setFeedback(t("success.session"));
      return true;
    } catch (caught) {
      setError(friendlyError(caught, t("errors.sessionFailed"), t));
      return false;
    } finally {
      end();
    }
  };

  return (
    <AppFrame dogName={dog.name}>
      <section className="py-6 sm:py-8" aria-labelledby="training-title">
        <h1
          id="training-title"
          className="text-balance text-[1.75rem] font-bold leading-[2.125rem]"
        >
          {t("intro.title")}
        </h1>
        <p className="mt-3 max-w-[70ch] text-pretty text-base leading-6 text-muted-foreground">
          {t("intro.body", { name: dog.name })}
        </p>
      </section>

      {feedback && (
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className="mb-5 rounded-lg bg-primary/10 px-4 py-3 text-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {feedback}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive"
        >
          {error}
        </p>
      )}

      {commands === undefined ? (
        <section aria-busy="true">
          <p role="status" className="sr-only">
            {t("loading")}
          </p>
          <div
            aria-hidden="true"
            className="grid animate-pulse items-start gap-6 motion-reduce:animate-none lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.65fr)]"
          >
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="h-5 w-2/3 rounded bg-muted" />
                <div className="mt-5 h-14 rounded-lg bg-muted" />
                <div className="mt-3 h-14 rounded-lg bg-muted" />
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="h-5 w-1/2 rounded bg-muted" />
                <div className="mt-5 h-12 rounded-lg bg-muted" />
                <div className="mt-4 h-11 rounded-lg bg-muted" />
              </div>
            </div>
            <div className="min-h-[34rem] rounded-xl border border-border bg-card p-5">
              <div className="h-7 w-2/5 rounded bg-muted" />
              <div className="mt-6 h-12 rounded-lg bg-muted" />
              <div className="mt-5 h-28 rounded-lg bg-muted" />
            </div>
          </div>
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.65fr)]">
          <aside className="rounded-xl border border-border bg-card lg:sticky lg:top-6">
            <section
              aria-labelledby="command-index-title"
              className="p-4 sm:p-5"
            >
              <div className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
                <h2
                  id="command-index-title"
                  className="text-balance text-xl font-bold leading-[1.625rem]"
                >
                  {t("command.indexTitle")}
                </h2>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {t("command.count", { count: commands.length })}
                </span>
              </div>
              {commands.length === 0 ? (
                <div className="py-6">
                  <p className="font-semibold">{t("command.empty")}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("command.emptyHelp")}
                  </p>
                </div>
              ) : (
                <ol className="mt-3 divide-y divide-border border-y border-border">
                  {commands.map((command) => (
                    <li key={command._id}>
                      <Link
                        to={`?command=${command._id}#command-detail`}
                        aria-label={`${t("aria.open", {
                          name: command.name,
                        })} · ${
                          command.isArchived
                            ? t("status.archived")
                            : t(`status.${command.status}`)
                        }`}
                        aria-current={
                          selectedId === command._id ? "true" : undefined
                        }
                        aria-disabled={isBusy}
                        className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-current:bg-secondary aria-disabled:cursor-wait aria-disabled:opacity-60"
                        onClick={(event) => {
                          if (isBusy) {
                            event.preventDefault();
                            return;
                          }
                          setFeedback("");
                          setError("");
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <strong className="block [overflow-wrap:anywhere]">
                            {command.name}
                          </strong>
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            {command.isArchived
                              ? t("status.archived")
                              : t(`status.${command.status}`)}
                          </span>
                        </span>
                        <span aria-hidden="true" className="shrink-0 text-lg">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <form
              aria-label={t("aria.create")}
              aria-busy={pending === "create"}
              className="border-t border-border p-4 sm:p-5"
              noValidate
              onSubmit={(event) => void create(event)}
            >
              <fieldset disabled={isBusy} className="m-0 border-0 p-0">
                <legend className="text-xl font-bold leading-[1.625rem]">
                  {t("command.createTitle")}
                </legend>
                <div className="mt-4">
                  <label htmlFor="create-name" className="text-sm font-bold">
                    {t("command.name")}
                  </label>
                  <input
                    id="create-name"
                    value={createName}
                    maxLength={64}
                    aria-invalid={Boolean(createErrors.name)}
                    aria-describedby={
                      createErrors.name ? "create-name-error" : undefined
                    }
                    className="field-control mt-2 w-full"
                    onChange={(event) => {
                      setCreateName(event.target.value);
                      setCreateErrors((current) => ({
                        ...current,
                        name: undefined,
                      }));
                    }}
                  />
                  <FieldError id="create-name-error">
                    {createErrors.name}
                  </FieldError>
                </div>
                <details className="mt-4 rounded-lg border border-border px-4 open:pb-4">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold">
                    {t("command.addGuidance")}
                  </summary>
                  <div className="mt-4">
                    <label
                      htmlFor="create-description"
                      className="text-sm font-bold"
                    >
                      {t("command.description")}
                    </label>
                    <textarea
                      id="create-description"
                      value={createDescription}
                      maxLength={1_000}
                      rows={3}
                      aria-invalid={Boolean(createErrors.description)}
                      aria-describedby={
                        createErrors.description
                          ? "create-description-error"
                          : undefined
                      }
                      className="field-control mt-2 w-full"
                      onChange={(event) => {
                        setCreateDescription(event.target.value);
                        setCreateErrors((current) => ({
                          ...current,
                          description: undefined,
                        }));
                      }}
                    />
                    <FieldError id="create-description-error">
                      {createErrors.description}
                    </FieldError>
                  </div>
                  <div className="mt-4">
                    <label
                      htmlFor="create-howToTrain"
                      className="text-sm font-bold"
                    >
                      {t("command.howTo")}
                    </label>
                    <textarea
                      id="create-howToTrain"
                      value={createHowTo}
                      maxLength={2_000}
                      rows={4}
                      aria-invalid={Boolean(createErrors.howToTrain)}
                      aria-describedby={
                        createErrors.howToTrain
                          ? "create-howToTrain-error"
                          : undefined
                      }
                      className="field-control mt-2 w-full"
                      onChange={(event) => {
                        setCreateHowTo(event.target.value);
                        setCreateErrors((current) => ({
                          ...current,
                          howToTrain: undefined,
                        }));
                      }}
                    />
                    <FieldError id="create-howToTrain-error">
                      {createErrors.howToTrain}
                    </FieldError>
                  </div>
                </details>
                <Button type="submit" className="mt-4 w-full">
                  {pending === "create"
                    ? t("actions.adding")
                    : t("actions.add")}
                </Button>
              </fieldset>
            </form>
          </aside>

          <section
            ref={detailRef}
            id="command-detail"
            tabIndex={-1}
            className="scroll-mt-6 rounded-xl border border-border bg-card p-5 focus:outline-2 focus:outline-offset-4 focus:outline-ring sm:p-7 lg:p-9"
          >
            {!selectedId ? (
              <div className="grid place-items-center py-12 text-center lg:min-h-80">
                <div className="max-w-md">
                  <h2 className="text-balance text-xl font-bold leading-[1.625rem]">
                    {t("command.choose")}
                  </h2>
                  <p className="mt-3 text-pretty leading-6 text-muted-foreground">
                    {t("command.chooseHelp")}
                  </p>
                </div>
              </div>
            ) : !selectedSummary ? (
              <div className="grid place-items-center py-12 text-center lg:min-h-80">
                <div className="max-w-md">
                  <p className="text-xl font-bold leading-[1.625rem]">
                    {t("command.notFound")}
                  </p>
                  <p className="mt-3 text-pretty text-muted-foreground">
                    {t("command.notFoundHelp")}
                  </p>
                </div>
              </div>
            ) : detail === undefined || !selectedCommand ? (
              <div className="grid min-h-[28rem] place-items-center">
                <p
                  role="status"
                  className="animate-pulse font-semibold motion-reduce:animate-none"
                >
                  {t("command.loading", { name: selectedSummary.name })}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-balance text-[1.75rem] font-bold leading-[2.125rem] [overflow-wrap:anywhere]">
                      {selectedCommand.name}
                    </h2>
                    {selectedCommand.isArchived && (
                      <p className="mt-3 inline-flex rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground">
                        {t("archive.historyOnly")}
                      </p>
                    )}
                  </div>
                  {selectedCommand.isArchived ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isBusy}
                      className="shrink-0 self-start"
                      onClick={() => void archive(false)}
                    >
                      {pending === "restore"
                        ? t("actions.restoring")
                        : t("actions.restore")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-controls="archive-confirmation"
                      aria-expanded={confirmArchive}
                      disabled={isBusy}
                      className="shrink-0 self-start text-destructive"
                      onClick={() => setConfirmArchiveId(selectedCommand._id)}
                    >
                      {t("actions.archive")}
                    </Button>
                  )}
                </div>

                {confirmArchive && !selectedCommand.isArchived && (
                  <div
                    id="archive-confirmation"
                    className="mt-5 rounded-lg bg-destructive/10 p-4"
                  >
                    <p className="font-bold [overflow-wrap:anywhere]">
                      {t("archive.confirm", { name: selectedCommand.name })}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("archive.help")}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() => setConfirmArchiveId(null)}
                      >
                        {t("actions.keepActive")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={isBusy}
                        onClick={() => void archive(true)}
                      >
                        {pending === "archive"
                          ? t("actions.archiving")
                          : t("actions.confirmArchive")}
                      </Button>
                    </div>
                  </div>
                )}

                <section aria-labelledby="progress-title" className="mt-7">
                  <h3
                    id="progress-title"
                    className="text-xl font-bold leading-[1.625rem]"
                  >
                    {t("command.progress")}
                  </h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {statusOptions.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={
                          selectedCommand.status === value
                            ? "primary"
                            : "secondary"
                        }
                        aria-label={t("aria.setStatus", {
                          status: t(`status.${value}`),
                        })}
                        aria-pressed={selectedCommand.status === value}
                        disabled={isBusy || selectedCommand.isArchived}
                        className="min-w-0 whitespace-normal"
                        onClick={() => void changeStatus(value)}
                      >
                        {t(`status.${value}`)}
                      </Button>
                    ))}
                  </div>
                </section>

                <form
                  aria-label={t("aria.edit")}
                  aria-busy={pending === "edit"}
                  className="mt-8"
                  noValidate
                  onSubmit={(event) => void save(event)}
                >
                  <fieldset
                    disabled={isBusy || selectedCommand.isArchived}
                    className="m-0 border-0 p-0"
                  >
                    <legend className="text-xl font-bold leading-[1.625rem]">
                      {t("command.workingNotes")}
                    </legend>
                    <div className="mt-5 min-w-0">
                      <label htmlFor="edit-name" className="text-sm font-bold">
                        {t("fields.name")}
                      </label>
                      <input
                        id="edit-name"
                        value={editName}
                        maxLength={64}
                        aria-invalid={Boolean(visibleEditErrors.name)}
                        aria-describedby={
                          visibleEditErrors.name ? "edit-name-error" : undefined
                        }
                        className="field-control mt-2 w-full"
                        onChange={(event) => {
                          changeEdit("name", event.target.value);
                        }}
                      />
                      <FieldError id="edit-name-error">
                        {visibleEditErrors.name}
                      </FieldError>
                    </div>
                    <div className="mt-5 grid min-w-0 gap-5 md:grid-cols-2">
                      <div className="min-w-0">
                        <label
                          htmlFor="edit-description"
                          className="text-sm font-bold"
                        >
                          {t("fields.description")}
                        </label>
                        <textarea
                          id="edit-description"
                          value={editDescription}
                          maxLength={1_000}
                          rows={5}
                          aria-invalid={Boolean(visibleEditErrors.description)}
                          aria-describedby={
                            visibleEditErrors.description
                              ? "edit-description-error"
                              : undefined
                          }
                          className="field-control mt-2 w-full"
                          onChange={(event) => {
                            changeEdit("description", event.target.value);
                          }}
                        />
                        <FieldError id="edit-description-error">
                          {visibleEditErrors.description}
                        </FieldError>
                      </div>
                      <div className="min-w-0">
                        <label
                          htmlFor="edit-howToTrain"
                          className="text-sm font-bold"
                        >
                          {t("command.trainingPlan")}
                        </label>
                        <textarea
                          id="edit-howToTrain"
                          value={editHowTo}
                          maxLength={2_000}
                          rows={5}
                          aria-invalid={Boolean(visibleEditErrors.howToTrain)}
                          aria-describedby={
                            visibleEditErrors.howToTrain
                              ? "edit-howToTrain-error"
                              : undefined
                          }
                          className="field-control mt-2 w-full"
                          onChange={(event) => {
                            changeEdit("howToTrain", event.target.value);
                          }}
                        />
                        <FieldError id="edit-howToTrain-error">
                          {visibleEditErrors.howToTrain}
                        </FieldError>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={!hasTouchedEdit}
                      className="mt-5"
                    >
                      {pending === "edit"
                        ? t("actions.saving")
                        : t("actions.save")}
                    </Button>
                  </fieldset>
                </form>

                <TrainingSessionPanel
                  key={selectedCommand._id}
                  command={selectedCommand}
                  dog={dog}
                  isBusy={isBusy}
                  onSubmit={submitSession}
                  pending={pending === "session"}
                  sessions={detail.sessions}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </AppFrame>
  );
}

export default TrainingPage;
