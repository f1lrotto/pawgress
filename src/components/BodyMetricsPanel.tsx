import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { TFunction } from "i18next";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { getAgeParts } from "@/lib/age";
import {
  formatZonedDateTimeLocal,
  getZonedDayKeys,
  parseZonedDateTimeLocal,
} from "@/lib/zonedDateTime";

type BodyDog = Pick<Doc<"dogs">, "_id" | "birthday" | "name" | "timezone">;
type BodyMetric = FunctionReturnType<typeof api.bodyMetrics.listRecent>[number];
type Field = "weightKg" | "neckCm" | "chestCm" | "backCm";
type Draft = Record<Field, string>;
type DraftErrors = Partial<Record<Field | "at", string>>;
type MetricPatch = Partial<Record<Field, number | null>>;
type InsightsT = TFunction<"insights">;
type RunOperation = (options: {
  action: () => Promise<unknown>;
  failure: string;
  focusId: string;
  operation: string;
  success: string;
}) => Promise<boolean>;

const fields = [
  { key: "weightKg", suffix: "kg" },
  { key: "neckCm", suffix: "cm" },
  { key: "chestCm", suffix: "cm" },
  { key: "backCm", suffix: "cm" },
] as const;
const emptyDraft = (): Draft => ({
  weightKg: "",
  neckCm: "",
  chestCm: "",
  backCm: "",
});
const draftFromMetric = (metric: BodyMetric): Draft => ({
  weightKg: metric.weightKg?.toString() ?? "",
  neckCm: metric.neckCm?.toString() ?? "",
  chestCm: metric.chestCm?.toString() ?? "",
  backCm: metric.backCm?.toString() ?? "",
});
const parseDraft = (draft: Draft, emptyMessage: string, t: InsightsT) => {
  const values: Partial<Record<Field, number>> = {};
  for (const { key } of fields) {
    const text = draft[key].trim();
    if (!text) continue;
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0 || value > 500) {
      return {
        error: { field: key, message: t("body.errors.invalid") },
        values,
      };
    }
    values[key] = value;
  }
  return Object.keys(values).length
    ? { error: null, values }
    : { error: { field: "weightKg" as const, message: emptyMessage }, values };
};

const formatAge = (
  birthday: string,
  today: string | undefined,
  t: InsightsT,
) => {
  if (!today) return t("body.age.unavailable");
  const age = getAgeParts(birthday, today);
  if (!age) return t("body.age.unavailable");
  const parts = [
    age.years ? t("body.age.years", { count: age.years }) : "",
    age.months ? t("body.age.months", { count: age.months }) : "",
  ].filter(Boolean);
  return t("body.age.old", {
    age: parts.join(", ") || t("body.age.months", { count: 0 }),
  });
};

const focusLater = (...ids: string[]) =>
  window.setTimeout(() => {
    for (const id of ids) {
      const element = document.getElementById(id);
      if (!element) continue;
      element.focus();
      break;
    }
  }, 0);

const hasErrorCode = (error: unknown, code: string) =>
  (error instanceof Error && error.message.includes(code)) ||
  (typeof error === "object" &&
    error !== null &&
    "data" in error &&
    error.data === code);

const friendlyError = (error: unknown, fallback: string, t: InsightsT) => {
  if (hasErrorCode(error, "BODY_METRIC_NOT_FOUND")) {
    return t("body.errors.changed");
  }
  if (hasErrorCode(error, "INVALID_TIMESTAMP")) {
    return t("body.errors.time");
  }
  if (
    hasErrorCode(error, "INVALID_WEIGHT") ||
    hasErrorCode(error, "INVALID_MEASUREMENT")
  ) {
    return t("body.errors.invalidServer");
  }
  if (hasErrorCode(error, "EMPTY_BODY_METRIC")) {
    return t("body.errors.empty");
  }
  return fallback;
};

function MetricFields({
  draft,
  errors,
  onChange,
  prefix,
}: {
  draft: Draft;
  errors: DraftErrors;
  onChange: (field: Field, value: string) => void;
  prefix: string;
}) {
  const { t } = useTranslation("insights");
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {fields.map(({ key }) => (
        <div key={key} className="min-w-0">
          <label htmlFor={`${prefix}-${key}`} className="text-sm font-bold">
            {t(`body.fields.${key}`)}
          </label>
          <input
            id={`${prefix}-${key}`}
            type="number"
            inputMode="decimal"
            min="0"
            max="500"
            step="any"
            value={draft[key]}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={
              errors[key] ? `${prefix}-${key}-error` : undefined
            }
            className="field-control mt-1 w-full disabled:cursor-wait"
            onChange={(event) => onChange(key, event.target.value)}
          />
          {errors[key] && (
            <p
              id={`${prefix}-${key}-error`}
              className="mt-1 break-words text-xs text-destructive"
            >
              {errors[key]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function CreateMetricForm({
  disabled,
  dog,
  run,
}: {
  disabled: boolean;
  dog: BodyDog;
  run: RunOperation;
}) {
  const { t } = useTranslation("insights");
  const [draft, setDraft] = useState(emptyDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [backdated, setBackdated] = useState(false);
  const [at, setAt] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>, now: number) => {
    event.preventDefault();
    const parsed = parseDraft(draft, t("body.errors.required"), t);
    if (parsed.error) {
      setErrors({ [parsed.error.field]: parsed.error.message });
      document.getElementById(`body-new-${parsed.error.field}`)?.focus();
      return;
    }
    const parsedAt = backdated
      ? parseZonedDateTimeLocal(at, dog.timezone)
      : now;
    if (
      parsedAt === null ||
      (backdated && at.slice(0, 10) < dog.birthday) ||
      parsedAt > now + 5 * 60_000
    ) {
      setErrors({ at: t("body.errors.time") });
      document.getElementById("body-new-at")?.focus();
      return;
    }
    const saved = await run({
      action: () =>
        createMetric({ dogId: dog._id, at: parsedAt, ...parsed.values }),
      failure: t("body.errors.add"),
      focusId: "body-new-weightKg",
      operation: "create",
      success: t("body.success.added"),
    });
    if (saved) {
      setDraft(emptyDraft());
      setBackdated(false);
      setAt("");
      setErrors({});
    }
  };
  const createMetric = useMutation(api.bodyMetrics.create);

  return (
    <form
      aria-label={t("body.aria.add")}
      aria-busy={disabled}
      className="min-w-0 rounded-lg bg-muted/70 p-4 sm:p-5"
      onSubmit={(event) => void submit(event, Date.now())}
      noValidate
    >
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <legend className="text-xl font-bold leading-[1.625rem]">
          {t("body.create.title")}
        </legend>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("body.create.help")}
        </p>
        <div className="mt-4">
          <MetricFields
            draft={draft}
            errors={errors}
            prefix="body-new"
            onChange={(field, value) => {
              setDraft((current) => ({ ...current, [field]: value }));
              setErrors((current) => ({ ...current, [field]: undefined }));
            }}
          />
        </div>
        <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={backdated}
            onChange={(event) => {
              const checked = event.target.checked;
              setBackdated(checked);
              setErrors((current) => ({ ...current, at: undefined }));
              if (checked && !at) {
                setAt(formatZonedDateTimeLocal(Date.now(), dog.timezone) ?? "");
              }
            }}
          />
          {t("body.create.backdated")}
        </label>
        {backdated && (
          <div className="mt-2">
            <label htmlFor="body-new-at" className="text-sm font-bold">
              {t("body.create.time")}
            </label>
            <input
              id="body-new-at"
              type="datetime-local"
              value={at}
              aria-invalid={Boolean(errors.at)}
              aria-describedby={errors.at ? "body-new-at-error" : undefined}
              className="field-control mt-1 w-full disabled:cursor-wait"
              onChange={(event) => {
                setAt(event.target.value);
                setErrors((current) => ({ ...current, at: undefined }));
              }}
            />
            {errors.at && (
              <p
                id="body-new-at-error"
                className="mt-1 text-xs text-destructive"
              >
                {errors.at}
              </p>
            )}
          </div>
        )}
        <Button type="submit" className="mt-4">
          {disabled ? t("body.actions.saving") : t("body.actions.add")}
        </Button>
      </fieldset>
    </form>
  );
}

function EditMetricForm({
  disabled,
  dog,
  metric,
  onCancel,
  run,
}: {
  disabled: boolean;
  dog: BodyDog;
  metric: BodyMetric;
  onCancel: () => void;
  run: RunOperation;
}) {
  const { t } = useTranslation("insights");
  const updateMetric = useMutation(api.bodyMetrics.update);
  const initialAt = formatZonedDateTimeLocal(metric.at, dog.timezone) ?? "";
  const [draft, setDraft] = useState(() => draftFromMetric(metric));
  const [at, setAt] = useState(initialAt);
  const [errors, setErrors] = useState<DraftErrors>({});
  const touched = useRef(new Set<Field | "at">());

  useEffect(() => {
    const serverDraft = draftFromMetric(metric);
    setDraft(
      (current) =>
        Object.fromEntries(
          fields.map(({ key }) => [
            key,
            touched.current.has(key) ? current[key] : serverDraft[key],
          ]),
        ) as Draft,
    );
    if (!touched.current.has("at")) {
      setAt(formatZonedDateTimeLocal(metric.at, dog.timezone) ?? "");
    }
  }, [dog.timezone, metric]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseDraft(draft, t("body.errors.empty"), t);
    if (parsed.error) {
      setErrors({ [parsed.error.field]: parsed.error.message });
      document
        .getElementById(`body-edit-${metric._id}-${parsed.error.field}`)
        ?.focus();
      return;
    }
    const changes: MetricPatch = {};
    for (const { key } of fields) {
      const value = parsed.values[key];
      if (value === undefined && metric[key] !== undefined) changes[key] = null;
      if (value !== undefined && value !== metric[key]) changes[key] = value;
    }
    const changedAt: { at?: number } = {};
    if (touched.current.has("at")) {
      const parsedAt = parseZonedDateTimeLocal(at, dog.timezone);
      if (
        parsedAt === null ||
        at.slice(0, 10) < dog.birthday ||
        parsedAt > Date.now() + 5 * 60_000
      ) {
        setErrors({ at: t("body.errors.time") });
        document.getElementById(`body-edit-${metric._id}-at`)?.focus();
        return;
      }
      if (parsedAt !== metric.at) changedAt.at = parsedAt;
    }
    if (Object.keys(changes).length === 0 && changedAt.at === undefined) {
      onCancel();
      return;
    }
    const saved = await run({
      action: () =>
        updateMetric({
          dogId: dog._id,
          metricId: metric._id,
          ...changedAt,
          ...changes,
        }),
      failure: t("body.errors.update"),
      focusId: `body-edit-${metric._id}-at`,
      operation: `edit:${metric._id}`,
      success: t("body.success.updated"),
    });
    if (saved) onCancel();
  };

  return (
    <form
      aria-label={t("body.aria.editForm")}
      aria-busy={disabled}
      className="mt-4 min-w-0 border-t border-border pt-4"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <legend className="text-base font-bold">{t("body.editTitle")}</legend>
        <div className="mt-3">
          <label
            htmlFor={`body-edit-${metric._id}-at`}
            className="text-sm font-bold"
          >
            {t("body.create.time")}
          </label>
          <input
            id={`body-edit-${metric._id}-at`}
            type="datetime-local"
            value={at}
            aria-invalid={Boolean(errors.at)}
            aria-describedby={
              errors.at ? `body-edit-${metric._id}-at-error` : undefined
            }
            className="field-control mt-1 w-full disabled:cursor-wait"
            onChange={(event) => {
              touched.current.add("at");
              setAt(event.target.value);
              setErrors((current) => ({ ...current, at: undefined }));
            }}
          />
          {errors.at && (
            <p
              id={`body-edit-${metric._id}-at-error`}
              className="mt-1 text-xs text-destructive"
            >
              {errors.at}
            </p>
          )}
        </div>
        <div className="mt-3">
          <MetricFields
            draft={draft}
            errors={errors}
            prefix={`body-edit-${metric._id}`}
            onChange={(field, value) => {
              touched.current.add(field);
              setDraft((current) => ({ ...current, [field]: value }));
              setErrors((current) => ({ ...current, [field]: undefined }));
            }}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit">
            {disabled ? t("body.actions.saving") : t("body.actions.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("body.actions.cancel")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function MetricRow({
  confirmDelete,
  dateFormatter,
  disabled,
  dog,
  editing,
  metric,
  onCancelDelete,
  onCancelEdit,
  onConfirmDelete,
  onDelete,
  onEdit,
  run,
}: {
  confirmDelete: boolean;
  dateFormatter: Intl.DateTimeFormat;
  disabled: boolean;
  dog: BodyDog;
  editing: boolean;
  metric: BodyMetric;
  onCancelDelete: () => void;
  onCancelEdit: () => void;
  onConfirmDelete: () => void;
  onDelete: () => void;
  onEdit: () => void;
  run: RunOperation;
}) {
  const { i18n, t } = useTranslation("insights");
  const locale = i18n.resolvedLanguage as Locale;
  const label = dateFormatter.format(metric.at);
  const visible = fields.flatMap(({ key, suffix }) =>
    metric[key] === undefined ? [] : [{ key, suffix, value: metric[key] }],
  );
  return (
    <article
      id={`body-metric-row-${metric._id}`}
      aria-label={t("body.aria.measurement", { date: label })}
      tabIndex={-1}
      className="min-w-0 border-t border-border py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <time className="break-words text-sm font-medium text-muted-foreground">
            {label}
          </time>
          <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {visible.map(({ key, suffix, value }) => (
              <div key={key} className="min-w-0">
                <dt className="break-words text-xs font-medium text-muted-foreground">
                  {t(`body.fields.${key}Short`)}
                </dt>
                <dd className="mt-1 break-words text-sm font-semibold">
                  {formatNumber(value, locale)} {suffix}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button
            id={`body-edit-trigger-${metric._id}`}
            type="button"
            disabled={disabled}
            variant="secondary"
            aria-label={t("body.aria.edit", { date: label })}
            onClick={onEdit}
          >
            {t("body.actions.edit")}
          </Button>
          <Button
            id={`body-delete-${metric._id}`}
            type="button"
            disabled={disabled}
            variant="quiet"
            aria-label={t("body.aria.delete", { date: label })}
            onClick={onDelete}
          >
            {t("body.actions.delete")}
          </Button>
        </div>
      </div>
      {confirmDelete && (
        <div className="mt-4 border-t border-destructive/25 pt-4">
          <p className="text-sm font-bold">{t("body.deleteConfirm")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={disabled}
              variant="destructive"
              className="whitespace-normal"
              onClick={onConfirmDelete}
            >
              {t("body.actions.confirmDelete")}
            </Button>
            <Button
              type="button"
              disabled={disabled}
              variant="secondary"
              onClick={onCancelDelete}
            >
              {t("body.actions.keep")}
            </Button>
          </div>
        </div>
      )}
      {editing && (
        <EditMetricForm
          key={metric._id}
          disabled={disabled}
          dog={dog}
          metric={metric}
          onCancel={onCancelEdit}
          run={run}
        />
      )}
    </article>
  );
}

function BodyMetricsPanel({ dog }: { dog: BodyDog }) {
  const { i18n, t } = useTranslation("insights");
  const locale = i18n.resolvedLanguage as Locale;
  const metrics = useQuery(api.bodyMetrics.listRecent, {
    dogId: dog._id,
    limit: 100,
  });
  const removeMetric = useMutation(api.bodyMetrics.remove);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<Id<"bodyMetrics"> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] =
    useState<Id<"bodyMetrics"> | null>(null);
  const operation = useRef(false);
  const dayKeys = getZonedDayKeys(now, dog.timezone);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZone: dog.timezone,
        year: "numeric",
      }),
    [dog.timezone, locale],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const run: RunOperation = async ({
    action,
    failure,
    focusId,
    operation: name,
    success,
  }) => {
    if (operation.current) return false;
    operation.current = true;
    setPending(name);
    setStatus("");
    setError("");
    try {
      await action();
      setStatus(success);
      return true;
    } catch (caught) {
      setError(friendlyError(caught, failure, t));
      document.getElementById(focusId)?.focus();
      return false;
    } finally {
      operation.current = false;
      setPending(null);
    }
  };
  const remove = (metricId: Id<"bodyMetrics">, successFocusId: string) =>
    void run({
      action: () => removeMetric({ dogId: dog._id, metricId }),
      failure: t("body.errors.delete"),
      focusId: `body-delete-${metricId}`,
      operation: `delete:${metricId}`,
      success: t("body.success.deleted"),
    }).then((removed) => {
      if (removed) {
        setConfirmDeleteId(null);
        if (editingId === metricId) setEditingId(null);
        focusLater(successFocusId, "body-history-title");
      }
    });

  return (
    <section
      aria-label={t("body.aria.bodyMeasurements")}
      aria-busy={pending !== null}
      className="min-w-0"
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-border pb-5">
        <h2 className="min-w-0 text-balance text-xl font-bold leading-[1.625rem] [overflow-wrap:anywhere]">
          {t("body.header.title", { name: dog.name })}
        </h2>
        <p className="text-sm font-medium text-muted-foreground">
          {formatAge(dog.birthday, dayKeys?.today, t)}
        </p>
      </div>

      {status && (
        <p
          role="status"
          className="mt-4 break-words rounded-md bg-success/10 px-4 py-3 text-sm font-semibold text-success"
        >
          {status}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 break-words rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="mt-6 grid min-w-0 gap-8 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] xl:items-start">
        <CreateMetricForm disabled={pending !== null} dog={dog} run={run} />
        <section aria-label={t("body.aria.recent")} className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3
              id="body-history-title"
              tabIndex={-1}
              className="text-xl font-bold leading-[1.625rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("body.list.title")}
            </h3>
            <span className="text-sm font-medium text-muted-foreground">
              {t("body.list.newest")}
            </span>
          </div>
          {metrics === undefined ? (
            <div className="mt-4">
              <p role="status" className="sr-only">
                {t("body.list.loading")}
              </p>
              <div
                aria-hidden="true"
                className="animate-pulse divide-y divide-border border-y border-border motion-reduce:animate-none"
              >
                {[0, 1, 2].map((item) => (
                  <div key={item} className="py-4">
                    <div className="h-4 w-32 rounded-sm bg-muted" />
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[0, 1, 2, 3].map((datum) => (
                        <div key={datum}>
                          <div className="h-3 w-16 rounded-sm bg-muted" />
                          <div className="mt-2 h-4 w-12 rounded-sm bg-muted" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : metrics.length === 0 ? (
            <p className="mt-4 rounded-md bg-muted/70 px-4 py-6 text-sm leading-5 text-muted-foreground">
              {t("body.empty")}
            </p>
          ) : (
            <div className="mt-4 min-w-0">
              {metrics.map((metric, index) => {
                const nextMetric = metrics[index + 1] ?? metrics[index - 1];
                return (
                  <MetricRow
                    key={metric._id}
                    confirmDelete={confirmDeleteId === metric._id}
                    dateFormatter={dateFormatter}
                    disabled={pending !== null}
                    dog={dog}
                    editing={editingId === metric._id}
                    metric={metric}
                    onCancelDelete={() => {
                      setConfirmDeleteId(null);
                      focusLater(`body-delete-${metric._id}`);
                    }}
                    onCancelEdit={() => {
                      setEditingId(null);
                      focusLater(`body-edit-trigger-${metric._id}`);
                    }}
                    onConfirmDelete={() =>
                      remove(
                        metric._id,
                        nextMetric
                          ? `body-metric-row-${nextMetric._id}`
                          : "body-history-title",
                      )
                    }
                    onDelete={() => {
                      setConfirmDeleteId(metric._id);
                      setEditingId(null);
                    }}
                    onEdit={() => {
                      setEditingId(metric._id);
                      setConfirmDeleteId(null);
                      focusLater(`body-edit-${metric._id}-at`);
                    }}
                    run={run}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export default BodyMetricsPanel;
