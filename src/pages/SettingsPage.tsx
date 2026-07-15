import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import AppFrame from "@/components/AppFrame";
import InstallAppSection from "@/components/InstallAppSection";
import RedeemInviteForm from "@/components/RedeemInviteForm";
import { Button } from "@/components/ui/button";
import type { InstallApp } from "@/hooks/useInstallPrompt";
import { formatDuration } from "@/i18n/format";
import { setLocale } from "@/i18n";
import type { Locale } from "@/i18n/locale";

type SettingsDog = Pick<Doc<"dogs">, "_id" | "name" | "waterIntervalMinutes">;

const waterIntervals = [
  15, 30, 60, 90, 120, 180, 240, 360, 480, 720, 1440,
] as const;

const hasErrorCode = (error: unknown, code: string) =>
  (error instanceof Error && error.message.includes(code)) ||
  (typeof error === "object" &&
    error !== null &&
    "data" in error &&
    error.data === code);

function SettingsPage({
  dog,
  installApp = null,
}: {
  dog: SettingsDog;
  installApp?: InstallApp | null;
}) {
  const { t, i18n } = useTranslation("settings");
  const currentUser = useQuery(api.users.current, {});
  const members = useQuery(api.sharing.listMembers, { dogId: dog._id });
  const activeInvite = useQuery(api.sharing.activeInvite, { dogId: dog._id });
  const persistLocale = useMutation(api.preferences.setLocale);
  const setWaterTracking = useMutation(api.dogs.setWaterTracking);
  const generateInvite = useMutation(api.sharing.generateInvite);
  const revokeInvite = useMutation(api.sharing.revokeInvite);
  const [inviteError, setInviteError] = useState<{
    dogId: SettingsDog["_id"];
    kind: "revoke" | "limit" | "create";
  } | null>(null);
  const [confirmingInvite, setConfirmingInvite] = useState<{
    dogId: SettingsDog["_id"];
    inviteId: Doc<"invites">["_id"];
  } | null>(null);
  const [operation, setOperation] = useState<"generate" | "revoke" | null>(
    null,
  );
  const operationLock = useRef(false);
  const copyLock = useRef(false);
  const languageLock = useRef(false);
  const waterLock = useRef(false);
  const languageErrorRef = useRef<HTMLParagraphElement>(null);
  const [languagePending, setLanguagePending] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const [languageSaved, setLanguageSaved] = useState(false);
  const [copyState, setCopyState] = useState<{
    dogId: SettingsDog["_id"];
    inviteId: Doc<"invites">["_id"];
    status: "copying" | "copied" | "error";
  } | null>(null);
  const [waterEnabled, setWaterEnabled] = useState(
    dog.waterIntervalMinutes !== undefined,
  );
  const [waterInterval, setWaterInterval] = useState(
    String(dog.waterIntervalMinutes ?? 120),
  );
  const [waterStatus, setWaterStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const hasCustomWaterInterval = !waterIntervals.some(
    (minutes) => String(minutes) === waterInterval,
  );

  useEffect(() => {
    if (languageError) languageErrorRef.current?.focus();
  }, [languageError]);

  const changeLanguage = async (nextLocale: Locale) => {
    const previousLocale: Locale = i18n.resolvedLanguage === "sk" ? "sk" : "en";
    if (languageLock.current || nextLocale === previousLocale) return;
    languageLock.current = true;
    setLanguagePending(true);
    setLanguageError(false);
    setLanguageSaved(false);
    try {
      await setLocale(nextLocale);
      await persistLocale({ locale: nextLocale });
      setLanguageSaved(true);
    } catch {
      await setLocale(previousLocale);
      setLanguageError(true);
    } finally {
      languageLock.current = false;
      setLanguagePending(false);
    }
  };

  const saveWaterTracking = async (event: FormEvent) => {
    event.preventDefault();
    if (waterLock.current) return;
    waterLock.current = true;
    setWaterStatus("saving");
    try {
      await setWaterTracking({
        dogId: dog._id,
        intervalMinutes: waterEnabled ? Number(waterInterval) : null,
      });
      setWaterStatus("saved");
    } catch {
      setWaterStatus("error");
    } finally {
      waterLock.current = false;
    }
  };

  const runInviteOperation = async (
    kind: "generate" | "revoke",
    task: () => Promise<unknown>,
  ) => {
    if (operationLock.current) return;
    operationLock.current = true;
    const dogId = dog._id;
    setOperation(kind);
    setInviteError(null);
    setCopyState(null);
    try {
      await task();
      if (kind === "revoke") setConfirmingInvite(null);
    } catch (error) {
      const errorKind =
        kind === "revoke"
          ? "revoke"
          : hasErrorCode(error, "INVITE_LIMIT")
            ? "limit"
            : "create";
      setInviteError({ dogId, kind: errorKind });
    } finally {
      operationLock.current = false;
      setOperation(null);
    }
  };

  const copyInviteCode = async (invite: NonNullable<typeof activeInvite>) => {
    if (copyLock.current) return;
    copyLock.current = true;
    const inviteScope = { dogId: dog._id, inviteId: invite.inviteId };
    setInviteError(null);
    setCopyState({ ...inviteScope, status: "copying" });
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(invite.code);
      setCopyState({ ...inviteScope, status: "copied" });
    } catch {
      setCopyState({ ...inviteScope, status: "error" });
    } finally {
      copyLock.current = false;
    }
  };

  const busyLabel = t(
    operation === "generate" ? "invite.creating" : "invite.revoking",
  );
  const isConfirming =
    activeInvite !== undefined &&
    activeInvite !== null &&
    confirmingInvite?.dogId === dog._id &&
    confirmingInvite.inviteId === activeInvite.inviteId;
  const visibleError = inviteError?.dogId === dog._id ? inviteError.kind : null;
  const visibleCopyStatus =
    activeInvite &&
    copyState?.dogId === dog._id &&
    copyState.inviteId === activeInvite.inviteId
      ? copyState.status
      : null;
  const copyPending = copyState?.status === "copying";
  const visibleCopyPending = visibleCopyStatus === "copying";
  const accountLabel =
    currentUser?.name ?? currentUser?.email ?? t("personal.unknown");

  return (
    <AppFrame
      dogName={dog.name}
      isBusy={
        languagePending ||
        waterStatus === "saving" ||
        operation !== null ||
        copyPending
      }
    >
      <section className="py-6 sm:py-8" aria-labelledby="settings-title">
        <h1
          id="settings-title"
          className="break-words text-balance text-[1.75rem] font-bold leading-[2.125rem] [overflow-wrap:anywhere]"
        >
          {t("page.title", { dogName: dog.name })}
        </h1>
        <p className="mt-3 max-w-[70ch] text-pretty text-base leading-6 text-muted-foreground">
          {t("page.description")}
        </p>
      </section>

      <section
        aria-labelledby="personal-title"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 border-b border-border py-6 sm:py-8 lg:grid-cols-2"
      >
        <div className="min-w-0">
          <h2
            id="personal-title"
            className="text-xl font-bold leading-[1.625rem]"
          >
            {t("personal.title")}
          </h2>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {t("personal.signedInAs")}
          </p>
          {currentUser === undefined ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              {t("personal.loading")}
            </p>
          ) : (
            <div className="mt-2 min-w-0">
              <strong className="block break-words [overflow-wrap:anywhere]">
                {accountLabel}
              </strong>
              {currentUser.name && currentUser.email && (
                <span className="block break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {currentUser.email}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <label htmlFor="locale" className="text-sm font-semibold">
            {t("personal.language")}
          </label>
          <select
            id="locale"
            value={i18n.resolvedLanguage === "sk" ? "sk" : "en"}
            disabled={languagePending}
            aria-describedby="locale-help locale-status"
            className="field-control mt-2 w-full"
            onChange={(event) =>
              void changeLanguage(event.target.value as Locale)
            }
          >
            <option value="en">{t("personal.english")}</option>
            <option value="sk">{t("personal.slovak")}</option>
          </select>
          <p id="locale-help" className="mt-2 text-sm text-muted-foreground">
            {t("personal.languageHelp")}
          </p>
          <div id="locale-status" aria-live="polite">
            {languagePending && (
              <p role="status" className="mt-3 text-sm font-semibold">
                {t("personal.saving")}
              </p>
            )}
            {languageSaved && !languagePending && (
              <p
                role="status"
                className="mt-3 text-sm font-semibold text-success"
              >
                {t("personal.saved")}
              </p>
            )}
            {languageError && !languagePending && (
              <p
                ref={languageErrorRef}
                role="alert"
                tabIndex={-1}
                className="mt-3 rounded-sm text-sm font-semibold text-destructive focus:outline-2 focus:outline-offset-2 focus:outline-ring"
              >
                {t("personal.error")}
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="water-title"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 border-b border-border py-6 sm:py-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start"
      >
        <div className="min-w-0">
          <h2 id="water-title" className="text-xl font-bold leading-[1.625rem]">
            {t("water.title")}
          </h2>
          <p className="mt-3 max-w-[70ch] text-sm leading-5 text-muted-foreground">
            {t("water.description", { dogName: dog.name })}
          </p>
        </div>
        <form
          aria-label={t("water.form")}
          aria-busy={waterStatus === "saving"}
          className="min-w-0 rounded-xl bg-muted/70 p-5"
          onSubmit={(event) => void saveWaterTracking(event)}
        >
          <fieldset
            disabled={waterStatus === "saving"}
            className="m-0 border-0 p-0"
          >
            <label
              htmlFor="water-enabled"
              className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"
            >
              <input
                id="water-enabled"
                type="checkbox"
                checked={waterEnabled}
                className="size-5 shrink-0 accent-primary"
                onChange={(event) => {
                  setWaterEnabled(event.target.checked);
                  setWaterStatus("idle");
                }}
              />
              {t("water.enable", { dogName: dog.name })}
            </label>

            <div className="mt-4">
              <label htmlFor="water-interval" className="text-sm font-semibold">
                {t("water.interval")}
              </label>
              <select
                id="water-interval"
                value={hasCustomWaterInterval ? "custom" : waterInterval}
                disabled={!waterEnabled || waterStatus === "saving"}
                aria-describedby="water-interval-help"
                className="field-control mt-2 w-full"
                onChange={(event) => {
                  setWaterInterval(
                    event.target.value === "custom" ? "" : event.target.value,
                  );
                  setWaterStatus("idle");
                }}
              >
                {waterIntervals.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(
                      minutes * 60_000,
                      i18n.resolvedLanguage === "sk" ? "sk" : "en",
                    )}
                  </option>
                ))}
                <option value="custom">{t("water.custom")}</option>
              </select>
              {hasCustomWaterInterval && (
                <div className="mt-4">
                  <label
                    htmlFor="water-custom-interval"
                    className="text-sm font-semibold"
                  >
                    {t("water.customInterval")}
                  </label>
                  <input
                    id="water-custom-interval"
                    type="number"
                    inputMode="numeric"
                    min="15"
                    max="1440"
                    step="1"
                    required={waterEnabled}
                    value={waterInterval}
                    disabled={!waterEnabled || waterStatus === "saving"}
                    aria-describedby="water-custom-interval-help"
                    className="field-control mt-2 w-full"
                    onChange={(event) => {
                      setWaterInterval(event.target.value);
                      setWaterStatus("idle");
                    }}
                  />
                  <p
                    id="water-custom-interval-help"
                    className="mt-2 text-sm text-muted-foreground"
                  >
                    {t("water.customHelp")}
                  </p>
                </div>
              )}
              <p
                id="water-interval-help"
                className="mt-2 text-sm text-muted-foreground"
              >
                {t("water.intervalHelp")}
              </p>
            </div>

            <Button type="submit" className="mt-4 w-full">
              {waterStatus === "saving" ? t("water.saving") : t("water.save")}
            </Button>
          </fieldset>
          <div aria-live="polite">
            {waterStatus === "saved" && (
              <p
                role="status"
                className="mt-3 text-sm font-semibold text-success"
              >
                {t(waterEnabled ? "water.saved" : "water.disabled")}
              </p>
            )}
            {waterStatus === "error" && (
              <p
                role="alert"
                className="mt-3 text-sm font-semibold text-destructive"
              >
                {t("water.error")}
              </p>
            )}
          </div>
        </form>
      </section>

      <InstallAppSection installApp={installApp} />

      <section aria-labelledby="household-title" className="py-6 sm:py-8">
        <h2
          id="household-title"
          className="break-words text-balance text-xl font-bold leading-[1.625rem] [overflow-wrap:anywhere]"
        >
          {t("household.title", { dogName: dog.name })}
        </h2>
        <p className="mt-3 max-w-[70ch] text-pretty text-base leading-6 text-muted-foreground">
          {t("household.description")}
        </p>

        <div className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <section aria-labelledby="members-title" className="min-w-0">
            <h3
              id="members-title"
              className="text-xl font-bold leading-[1.625rem]"
            >
              {t("members.title")}
            </h3>
            {members === undefined ? (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                {t("members.loading")}
              </p>
            ) : members.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {t("members.empty")}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {members.map((member) => {
                  const label =
                    member.name ?? member.email ?? t("members.fallback");
                  return (
                    <li
                      key={member.userId}
                      className="flex min-w-0 items-center justify-between gap-4 py-3"
                    >
                      <span className="min-w-0">
                        <strong className="block break-words [overflow-wrap:anywhere]">
                          {label}
                        </strong>
                        {member.name && member.email && (
                          <span className="block break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                            {member.email}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                        {t(`members.${member.role}`)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="invite-title"
            className="min-w-0 rounded-xl bg-muted/70 p-5 sm:p-6"
          >
            <h3
              id="invite-title"
              className="text-xl font-bold leading-[1.625rem]"
            >
              {t("invite.title")}
            </h3>
            <p className="mt-3 max-w-md break-words text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              {t("invite.description", { dogName: dog.name })}
            </p>

            {activeInvite === undefined ? (
              <>
                <p role="status" className="mt-5 text-sm text-muted-foreground">
                  {t("invite.checking")}
                </p>
                <Button type="button" disabled className="mt-4 w-full">
                  {t("invite.checkingButton")}
                </Button>
              </>
            ) : activeInvite ? (
              <>
                <div className="mt-5">
                  <label
                    htmlFor="active-invite"
                    className="text-sm font-semibold"
                  >
                    {t("invite.activeCode")}
                  </label>
                  <input
                    id="active-invite"
                    readOnly
                    value={activeInvite.code}
                    className="field-control mt-2 w-full min-w-0 max-w-full font-mono uppercase tracking-[0.06em]"
                  />
                </div>
                {isConfirming ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="text-sm font-semibold">
                      {t("invite.warning")}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={operation !== null}
                        onClick={() => setConfirmingInvite(null)}
                      >
                        {t("invite.keep")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={operation !== null}
                        onClick={() =>
                          void runInviteOperation("revoke", () =>
                            revokeInvite({
                              dogId: dog._id,
                              inviteId: activeInvite.inviteId,
                            }),
                          )
                        }
                      >
                        {operation === "revoke"
                          ? t("invite.revoking")
                          : t("invite.confirm")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Button
                      type="button"
                      disabled={copyPending || operation !== null}
                      onClick={() => void copyInviteCode(activeInvite)}
                    >
                      {visibleCopyPending
                        ? t("invite.copying")
                        : t("invite.copy")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={copyPending || operation !== null}
                      onClick={() =>
                        setConfirmingInvite({
                          dogId: dog._id,
                          inviteId: activeInvite.inviteId,
                        })
                      }
                    >
                      {operation === null ? t("invite.revoke") : busyLabel}
                    </Button>
                  </div>
                )}
                {visibleCopyStatus === "copied" && (
                  <p
                    role="status"
                    className="mt-3 text-sm font-medium text-success"
                  >
                    {t("invite.copied")}
                  </p>
                )}
                {visibleCopyStatus === "error" && (
                  <p
                    role="alert"
                    className="mt-3 text-sm font-medium text-destructive"
                  >
                    {t("invite.copyError")}
                  </p>
                )}
              </>
            ) : (
              <Button
                type="button"
                disabled={operation !== null}
                className="mt-5 w-full"
                onClick={() =>
                  void runInviteOperation("generate", () =>
                    generateInvite({ dogId: dog._id }),
                  )
                }
              >
                {operation === null ? t("invite.create") : busyLabel}
              </Button>
            )}
            {visibleError && (
              <p
                role="alert"
                className="mt-3 text-sm font-medium text-destructive"
              >
                {t(`invite.${visibleError}Error`)}
              </p>
            )}
          </section>
        </div>
      </section>

      <section
        aria-labelledby="join-title"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 border-t border-border py-6 sm:py-8 lg:grid-cols-[1fr_1.1fr] lg:items-center"
      >
        <div className="min-w-0">
          <h2 id="join-title" className="text-xl font-bold leading-[1.625rem]">
            {t("join.title")}
          </h2>
          <p className="mt-3 max-w-[70ch] text-sm leading-5 text-muted-foreground">
            {t("join.description")}
          </p>
        </div>
        <div className="min-w-0">
          <RedeemInviteForm />
        </div>
      </section>
    </AppFrame>
  );
}

export default SettingsPage;
