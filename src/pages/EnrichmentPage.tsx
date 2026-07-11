import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import AppFrame from "@/components/AppFrame";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { parseZonedDateTimeLocal } from "@/lib/zonedDateTime";

type ActivityTypes = FunctionReturnType<typeof api.activityTypes.list>;
type ActivityType = ActivityTypes[number];
type EnrichmentDog = Pick<
  Doc<"dogs">,
  "_id" | "birthday" | "name" | "timezone"
>;
type FieldErrors = {
  at: string;
  emoji: string;
  name: string;
  note: string;
  type: string;
};

const emptyErrors: FieldErrors = {
  at: "",
  emoji: "",
  name: "",
  note: "",
  type: "",
};
const maxFutureMs = 5 * 60_000;
const getNow = () => Date.now();
const hasErrorCode = (error: unknown, code: string) =>
  (error instanceof Error && error.message.includes(code)) ||
  (typeof error === "object" &&
    error !== null &&
    "data" in error &&
    error.data === code);
const focusLater = (id: string) =>
  window.setTimeout(() => document.getElementById(id)?.focus());

function ActivityShelf({
  active,
  activityTypes,
  archived,
  confirmArchiveId,
  isBusy,
  onArchiveChange,
  onAddActivity,
  onConfirmArchive,
  onLogNow,
  pending,
}: {
  active: ActivityTypes;
  activityTypes: ActivityTypes | undefined;
  archived: ActivityTypes;
  confirmArchiveId: Id<"activityTypes"> | null;
  isBusy: boolean;
  onArchiveChange: (activity: ActivityType, isArchived: boolean) => void;
  onAddActivity: () => void;
  onConfirmArchive: (id: Id<"activityTypes"> | null) => void;
  onLogNow: (activity: ActivityType, now: number) => void;
  pending: string | null;
}) {
  const { t } = useTranslation("enrichment");
  useEffect(() => {
    if (!confirmArchiveId) return;
    document.getElementById(`keep-${confirmArchiveId}`)?.focus();
  }, [confirmArchiveId]);

  const cancelArchive = (id: Id<"activityTypes">) => {
    onConfirmArchive(null);
    focusLater(`archive-${id}`);
  };

  return (
    <section
      aria-labelledby="activity-shelf-title"
      aria-busy={activityTypes === undefined || undefined}
      className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <h2
        id="activity-shelf-title"
        className="text-balance text-xl font-bold leading-[1.625rem]"
      >
        {t("shelf.title")}
      </h2>

      {activityTypes === undefined ? (
        <>
          <p role="status" className="sr-only">
            {t("loading")}
          </p>
          <div
            aria-hidden="true"
            className="mt-5 divide-y divide-border border-y border-border"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 py-4">
                <span className="size-5 shrink-0 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                <span className="h-5 w-2/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                <span className="ms-auto h-11 w-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </>
      ) : active.length === 0 ? (
        <div className="mt-5 border-y border-border py-6">
          <strong className="text-lg font-bold">
            {activityTypes.length === 0
              ? t("empty.none")
              : t("empty.allArchived")}
          </strong>
          <p className="mt-2 text-sm text-muted-foreground">
            {activityTypes.length === 0
              ? t("empty.noneHelp")
              : t("empty.allArchivedHelp")}
          </p>
          {activityTypes.length === 0 && (
            <Button
              type="button"
              variant="secondary"
              aria-label={t("empty.addAria")}
              className="mt-4 whitespace-normal text-center"
              onClick={onAddActivity}
            >
              {t("empty.addAction")}
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {active.map((activity) => {
            const confirmationId = `archive-confirmation-${activity._id}`;
            const helpId = `archive-help-${activity._id}`;
            return (
              <li key={activity._id} className="min-w-0 py-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="w-8 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center text-xl leading-7"
                      aria-hidden="true"
                    >
                      {activity.emoji ?? "🐾"}
                    </span>
                    <h3 className="min-w-0 break-words font-semibold leading-6 [overflow-wrap:anywhere]">
                      {activity.name}
                    </h3>
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:shrink-0">
                    <Button
                      type="button"
                      aria-label={t("logNowAria", { name: activity.name })}
                      disabled={isBusy}
                      className="min-w-0 whitespace-normal text-center sm:flex-none"
                      onClick={() => onLogNow(activity, getNow())}
                    >
                      {pending === `log:${activity._id}`
                        ? t("actions.logging")
                        : t("actions.logNow")}
                    </Button>
                    <Button
                      type="button"
                      id={`archive-${activity._id}`}
                      variant="quiet"
                      aria-label={t("archiveAria", { name: activity.name })}
                      disabled={isBusy}
                      className="min-w-0 whitespace-normal text-center text-muted-foreground sm:flex-none"
                      onClick={() => onConfirmArchive(activity._id)}
                    >
                      {t("actions.archive")}
                    </Button>
                  </div>
                </div>
                {confirmArchiveId === activity._id && (
                  <div
                    role="group"
                    aria-labelledby={confirmationId}
                    aria-describedby={helpId}
                    className="mt-3 rounded-lg bg-muted p-3"
                  >
                    <p
                      id={confirmationId}
                      className="text-sm font-bold [overflow-wrap:anywhere]"
                    >
                      {t("archive.confirm", { name: activity.name })}
                    </p>
                    <p
                      id={helpId}
                      className="mt-1 text-xs text-muted-foreground"
                    >
                      {t("archive.help")}
                    </p>
                    <div className="mt-3 flex flex-col gap-2 min-[400px]:flex-row">
                      <Button
                        type="button"
                        id={`keep-${activity._id}`}
                        variant="secondary"
                        disabled={isBusy}
                        className="min-w-0 flex-1 whitespace-normal text-center"
                        onClick={() => cancelArchive(activity._id)}
                      >
                        {t("actions.keep")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        aria-label={t("actions.confirmArchive", {
                          name: activity.name,
                        })}
                        disabled={isBusy}
                        className="min-w-0 flex-1 whitespace-normal text-center"
                        onClick={() => onArchiveChange(activity, true)}
                      >
                        {pending === `archive:${activity._id}`
                          ? t("actions.archiving")
                          : t("actions.archive")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {activityTypes !== undefined && archived.length > 0 && (
        <details className="group mt-6 border-t border-border pt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center font-bold [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden="true"
              className="me-2 inline-block text-sm transition-transform duration-150 ease-[var(--ease-out)] group-open:rotate-90 motion-reduce:transition-none"
            >
              ▸
            </span>
            {t("archivedShelf", { count: archived.length })}
          </summary>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {archived.map((activity) => (
              <li
                key={activity._id}
                className="flex min-w-0 flex-col gap-3 py-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between"
              >
                <span className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                  <span aria-hidden="true">{activity.emoji ?? "🐾"} </span>
                  {activity.name}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={t("restoreAria", { name: activity.name })}
                  disabled={isBusy}
                  className="min-w-0 whitespace-normal text-center min-[400px]:shrink-0"
                  onClick={() => onArchiveChange(activity, false)}
                >
                  {pending === `restore:${activity._id}`
                    ? t("actions.restoring")
                    : t("actions.restore")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function EnrichmentForms({
  active,
  activityTypes,
  at,
  dog,
  emoji,
  errors,
  isBusy,
  name,
  note,
  onAtChange,
  onCreate,
  onEmojiChange,
  onLogBackdated,
  onNameChange,
  onNoteChange,
  onSelectedChange,
  pending,
  selectedId,
}: {
  active: ActivityTypes;
  activityTypes: ActivityTypes | undefined;
  at: string;
  dog: EnrichmentDog;
  emoji: string;
  errors: FieldErrors;
  isBusy: boolean;
  name: string;
  note: string;
  onAtChange: (value: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onEmojiChange: (value: string) => void;
  onLogBackdated: (event: FormEvent<HTMLFormElement>, now: number) => void;
  onNameChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSelectedChange: (id: Id<"activityTypes"> | "") => void;
  pending: string | null;
  selectedId: Id<"activityTypes"> | "";
}) {
  const { t } = useTranslation("enrichment");
  const disabled = isBusy || activityTypes === undefined;
  return (
    <div className="grid min-w-0 gap-6">
      <form
        aria-busy={pending === "backdate"}
        aria-label={t("forms.log")}
        className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6"
        noValidate
        onSubmit={(event) => onLogBackdated(event, getNow())}
      >
        <h2 className="text-balance text-xl font-bold leading-[1.625rem]">
          {t("forms.logTitle")}
        </h2>
        <fieldset disabled={disabled} className="m-0 border-0 p-0">
          <div className="mt-5">
            <label htmlFor="play-type" className="text-sm font-bold">
              {t("fields.activity")}
            </label>
            <select
              id="play-type"
              value={selectedId}
              aria-invalid={Boolean(errors.type)}
              aria-describedby={errors.type ? "play-type-error" : undefined}
              className="field-control mt-2 min-w-0 w-full"
              onChange={(event) =>
                onSelectedChange(event.target.value as Id<"activityTypes"> | "")
              }
            >
              <option value="" disabled={active.length > 0}>
                {active.length === 0
                  ? t("fields.noActive")
                  : t("fields.chooseActivity")}
              </option>
              {active.map((activity) => (
                <option key={activity._id} value={activity._id}>
                  {activity.emoji ? `${activity.emoji} ` : ""}
                  {activity.name}
                </option>
              ))}
            </select>
            {errors.type && (
              <p id="play-type-error" className="mt-2 text-sm text-destructive">
                {errors.type}
              </p>
            )}
          </div>
          <div className="mt-4">
            <label htmlFor="play-at" className="text-sm font-bold">
              {t("fields.startedAt")}
            </label>
            <input
              id="play-at"
              type="datetime-local"
              step="60"
              value={at}
              aria-invalid={Boolean(errors.at)}
              aria-describedby={
                errors.at ? "play-timezone play-at-error" : "play-timezone"
              }
              className="field-control mt-2 min-w-0 w-full"
              onChange={(event) => onAtChange(event.target.value)}
            />
            {errors.at && (
              <p id="play-at-error" className="mt-2 text-sm text-destructive">
                {errors.at}
              </p>
            )}
            <p
              id="play-timezone"
              className="mt-2 text-xs text-muted-foreground [overflow-wrap:anywhere]"
            >
              {t("fields.timezone", { timezone: dog.timezone })}
            </p>
          </div>
          <div className="mt-4">
            <label htmlFor="play-note" className="text-sm font-bold">
              {t("fields.note")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("fields.optional")}
              </span>
            </label>
            <textarea
              id="play-note"
              value={note}
              aria-invalid={Boolean(errors.note)}
              aria-describedby={
                errors.note
                  ? "play-note-count play-note-error"
                  : "play-note-count"
              }
              className="field-control mt-2 min-h-24 min-w-0 w-full"
              onChange={(event) => onNoteChange(event.target.value)}
            />
            <p
              id="play-note-count"
              className="mt-2 text-xs text-muted-foreground"
            >
              {t("forms.noteCount", { count: note.length })}
            </p>
            {errors.note && (
              <p id="play-note-error" className="mt-2 text-sm text-destructive">
                {errors.note}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="mt-5 w-full whitespace-normal text-center"
          >
            {pending === "backdate" ? t("actions.logging") : t("actions.log")}
          </Button>
        </fieldset>
      </form>

      <form
        aria-busy={pending === "create"}
        aria-label={t("forms.create")}
        className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6"
        noValidate
        onSubmit={onCreate}
      >
        <h2 className="text-balance text-xl font-bold leading-[1.625rem]">
          {t("forms.createTitle")}
        </h2>
        <fieldset disabled={disabled} className="m-0 border-0 p-0">
          <div className="mt-5">
            <label htmlFor="activity-name" className="text-sm font-bold">
              {t("fields.activityName")}
            </label>
            <input
              id="activity-name"
              value={name}
              maxLength={65}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "activity-name-error" : undefined}
              className="field-control mt-2 min-w-0 w-full"
              onChange={(event) => onNameChange(event.target.value)}
            />
            {errors.name && (
              <p
                id="activity-name-error"
                className="mt-2 text-sm text-destructive"
              >
                {errors.name}
              </p>
            )}
          </div>
          <div className="mt-4">
            <label htmlFor="activity-emoji" className="text-sm font-bold">
              {t("fields.emoji")}
            </label>
            <input
              id="activity-emoji"
              value={emoji}
              maxLength={17}
              aria-invalid={Boolean(errors.emoji)}
              aria-describedby={
                errors.emoji ? "activity-emoji-error" : undefined
              }
              className="field-control mt-2 min-w-0 w-full"
              onChange={(event) => onEmojiChange(event.target.value)}
            />
            {errors.emoji && (
              <p
                id="activity-emoji-error"
                className="mt-2 text-sm text-destructive"
              >
                {errors.emoji}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="mt-5 w-full whitespace-normal text-center"
          >
            {pending === "create" ? t("actions.adding") : t("actions.add")}
          </Button>
        </fieldset>
      </form>
    </div>
  );
}

function EnrichmentHeader({
  dogName,
  error,
  status,
}: {
  dogName: string;
  error: string;
  status: string;
}) {
  const { t } = useTranslation("enrichment");
  return (
    <>
      <header className="min-w-0 py-6 sm:py-8">
        <h1
          id="enrichment-title"
          className="text-balance text-[1.75rem] font-bold leading-[2.125rem]"
        >
          {t("intro.title")}
        </h1>
        <p className="mt-3 max-w-[70ch] text-pretty text-base leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          {t("intro.body", { name: dogName })}
        </p>
      </header>
      {status && (
        <p
          role="status"
          aria-atomic="true"
          className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-semibold text-success [overflow-wrap:anywhere]"
        >
          {status}
        </p>
      )}
      {error && (
        <p
          role="alert"
          aria-atomic="true"
          className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive [overflow-wrap:anywhere]"
        >
          {error}
        </p>
      )}
    </>
  );
}

function EnrichmentPage({ dog }: { dog: EnrichmentDog }) {
  const { i18n, t } = useTranslation("enrichment");
  const locale = i18n.resolvedLanguage as Locale;
  const birthdayLabel = formatDate(
    new Date(`${dog.birthday}T12:00:00.000Z`),
    locale,
    "UTC",
  );
  const activityTypes = useQuery(api.activityTypes.list, {
    dogId: dog._id,
    includeArchived: true,
    limit: 100,
  });
  const createActivity = useMutation(api.activityTypes.create);
  const logPlay = useMutation(api.activityTypes.logPlay);
  const setArchived = useMutation(api.activityTypes.setArchived);
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"activityTypes"> | "">("");
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState(emptyErrors);
  const [confirmArchiveId, setConfirmArchiveId] =
    useState<Id<"activityTypes"> | null>(null);
  const operationPending = useRef(false);

  const active = activityTypes?.filter(({ isArchived }) => !isArchived) ?? [];
  const archived = activityTypes?.filter(({ isArchived }) => isArchived) ?? [];
  const effectiveSelectedId = active.some(({ _id }) => _id === selectedId)
    ? selectedId
    : "";
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

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.normalize("NFKC").trim();
    const normalizedEmoji = emoji.normalize("NFKC").trim();
    const nextErrors = {
      ...emptyErrors,
      name: !normalizedName
        ? t("errors.createName")
        : normalizedName.length > 64
          ? t("errors.nameLength")
          : "",
      emoji: normalizedEmoji.length > 16 ? t("errors.emojiLength") : "",
    };
    setErrors(nextErrors);
    const firstError = nextErrors.name
      ? "activity-name"
      : nextErrors.emoji
        ? "activity-emoji"
        : "";
    if (firstError) {
      document.getElementById(firstError)?.focus();
      return;
    }
    if (!begin("create")) return;
    try {
      await createActivity({
        dogId: dog._id,
        name: normalizedName,
        ...(normalizedEmoji ? { emoji: normalizedEmoji } : {}),
      });
      setName("");
      setEmoji("");
      setErrors(emptyErrors);
      setStatus(t("status.added", { name: normalizedName }));
    } catch (caught) {
      if (hasErrorCode(caught, "DUPLICATE_ACTIVITY_TYPE")) {
        setError(t("errors.duplicate"));
        focusLater("activity-name");
      } else if (hasErrorCode(caught, "ACTIVITY_TYPE_LIMIT")) {
        setError(t("errors.activityLimit"));
      } else if (hasErrorCode(caught, "INVALID_ACTIVITY_NAME")) {
        setErrors({
          ...nextErrors,
          name: t("errors.invalidName"),
        });
        focusLater("activity-name");
      } else if (hasErrorCode(caught, "INVALID_ACTIVITY_EMOJI")) {
        setErrors({ ...nextErrors, emoji: t("errors.emojiLength") });
        focusLater("activity-emoji");
      } else {
        setError(t("errors.addFailed"));
      }
    } finally {
      end();
    }
  };

  const archivedRaceMessage = t("errors.activityArchived");

  const logNow = async (activity: ActivityType, now: number) => {
    if (!begin(`log:${activity._id}`)) return;
    try {
      await logPlay({
        dogId: dog._id,
        activityTypeId: activity._id,
        at: now,
      });
      setStatus(t("status.logged", { activity: activity.name, dog: dog.name }));
    } catch (caught) {
      setError(
        hasErrorCode(caught, "ACTIVITY_TYPE_ARCHIVED")
          ? archivedRaceMessage
          : t("errors.logFailed"),
      );
    } finally {
      end();
    }
  };

  const logBackdated = async (
    event: FormEvent<HTMLFormElement>,
    now: number,
  ) => {
    event.preventDefault();
    const activity = active.find(({ _id }) => _id === effectiveSelectedId);
    const parsedAt = parseZonedDateTimeLocal(at, dog.timezone);
    const normalizedNote = note.trim();
    const atError =
      parsedAt === null
        ? t("errors.invalidTime")
        : at.slice(0, 10) < dog.birthday
          ? t("errors.boundary", { date: birthdayLabel })
          : parsedAt > now + maxFutureMs
            ? t("errors.future")
            : "";
    const nextErrors = {
      ...emptyErrors,
      at: atError,
      note: normalizedNote.length > 500 ? t("errors.noteLength") : "",
      type: activity ? "" : t("errors.activeRequired"),
    };
    setErrors(nextErrors);
    const firstError = nextErrors.type
      ? "play-type"
      : nextErrors.at
        ? "play-at"
        : nextErrors.note
          ? "play-note"
          : "";
    if (firstError) {
      document.getElementById(firstError)?.focus();
      return;
    }
    if (!activity || parsedAt === null || !begin("backdate")) return;
    try {
      await logPlay({
        dogId: dog._id,
        activityTypeId: activity._id,
        at: parsedAt,
        ...(normalizedNote ? { note: normalizedNote } : {}),
      });
      setAt("");
      setNote("");
      setErrors(emptyErrors);
      setStatus(t("status.logged", { activity: activity.name, dog: dog.name }));
    } catch (caught) {
      if (hasErrorCode(caught, "ACTIVITY_TYPE_ARCHIVED")) {
        setError(archivedRaceMessage);
      } else if (hasErrorCode(caught, "INVALID_TIMESTAMP")) {
        setErrors({
          ...nextErrors,
          at: t("errors.outOfRange"),
        });
        focusLater("play-at");
      } else if (hasErrorCode(caught, "INVALID_NOTE")) {
        setErrors({ ...nextErrors, note: t("errors.noteLength") });
        focusLater("play-note");
      } else {
        setError(t("errors.saveFailed"));
      }
    } finally {
      end();
    }
  };

  const changeArchive = async (activity: ActivityType, isArchived: boolean) => {
    if (!begin(`${isArchived ? "archive" : "restore"}:${activity._id}`)) return;
    try {
      await setArchived({
        dogId: dog._id,
        activityTypeId: activity._id,
        isArchived,
      });
      setConfirmArchiveId(null);
      setStatus(
        isArchived
          ? t("status.archived", { name: activity.name })
          : t("status.restored", { name: activity.name }),
      );
    } catch {
      setError(
        t(isArchived ? "errors.archiveFailed" : "errors.restoreFailed", {
          name: activity.name,
        }),
      );
    } finally {
      end();
    }
  };

  return (
    <AppFrame dogName={dog.name} isBusy={isBusy}>
      <EnrichmentHeader dogName={dog.name} error={error} status={status} />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <ActivityShelf
          active={active}
          activityTypes={activityTypes}
          archived={archived}
          confirmArchiveId={confirmArchiveId}
          isBusy={isBusy}
          onArchiveChange={(activity, isArchived) =>
            void changeArchive(activity, isArchived)
          }
          onAddActivity={() =>
            document.getElementById("activity-name")?.focus()
          }
          onConfirmArchive={setConfirmArchiveId}
          onLogNow={(activity, now) => void logNow(activity, now)}
          pending={pending}
        />

        <EnrichmentForms
          active={active}
          activityTypes={activityTypes}
          at={at}
          dog={dog}
          emoji={emoji}
          errors={errors}
          isBusy={isBusy}
          name={name}
          note={note}
          onAtChange={(value) => {
            setAt(value);
            setErrors((current) => ({ ...current, at: "" }));
          }}
          onCreate={(event) => void create(event)}
          onEmojiChange={(value) => {
            setEmoji(value);
            setErrors((current) => ({ ...current, emoji: "" }));
          }}
          onLogBackdated={(event, now) => void logBackdated(event, now)}
          onNameChange={(value) => {
            setName(value);
            setErrors((current) => ({ ...current, name: "" }));
          }}
          onNoteChange={(value) => {
            setNote(value);
            setErrors((current) => ({ ...current, note: "" }));
          }}
          onSelectedChange={(id) => {
            setSelectedId(id);
            setErrors((current) => ({ ...current, type: "" }));
          }}
          pending={pending}
          selectedId={effectiveSelectedId}
        />
      </div>
    </AppFrame>
  );
}

export default EnrichmentPage;
