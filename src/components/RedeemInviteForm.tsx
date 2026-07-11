import { useMutation } from "convex/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../convex/_generated/api";
import {
  DogSelectionConsumer,
  type DogSelection,
} from "@/contexts/DogSelectionContext";
import { Button } from "@/components/ui/button";

const codePattern = /^[A-F0-9]{32}$/;

const hasErrorCode = (error: unknown, code: string) =>
  (error instanceof Error && error.message.includes(code)) ||
  (typeof error === "object" &&
    error !== null &&
    "data" in error &&
    error.data === code);

type InviteError =
  "validation" | "membershipLimit" | "memberLimit" | "unavailable";

function RedeemInviteFields({
  dogSelection,
}: {
  dogSelection: DogSelection | null;
}) {
  const { t } = useTranslation("settings");
  const redeemInvite = useMutation(api.sharing.redeemInvite);
  const [code, setCode] = useState("");
  const [error, setError] = useState<InviteError | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const activeDogId = useRef(dogSelection?.activeDogId ?? null);
  const selectionVersion = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const nextDogId = dogSelection?.activeDogId ?? null;
    if (activeDogId.current === nextDogId) return;
    activeDogId.current = nextDogId;
    selectionVersion.current += 1;
  }, [dogSelection?.activeDogId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const normalized = code.trim().toUpperCase();
    if (!codePattern.test(normalized)) {
      setError("validation");
      setAccepted(false);
      document.getElementById("invite-code")?.focus();
      return;
    }

    const submittedSelectionVersion = selectionVersion.current;
    submitting.current = true;
    setIsPending(true);
    setError(null);
    setAccepted(false);
    try {
      const dogId = await redeemInvite({ code: normalized });
      if (
        !mounted.current ||
        selectionVersion.current !== submittedSelectionVersion
      )
        return;
      dogSelection?.selectDog(dogId);
      setCode("");
      setAccepted(true);
    } catch (caught) {
      if (
        !mounted.current ||
        selectionVersion.current !== submittedSelectionVersion
      )
        return;
      setError(
        hasErrorCode(caught, "DOG_MEMBERSHIP_LIMIT")
          ? "membershipLimit"
          : hasErrorCode(caught, "MEMBER_LIMIT")
            ? "memberLimit"
            : "unavailable",
      );
    } finally {
      submitting.current = false;
      if (mounted.current) setIsPending(false);
    }
  };

  return (
    <form
      aria-label={t("join.form")}
      aria-busy={isPending}
      noValidate
      onSubmit={submit}
    >
      <fieldset disabled={isPending} className="m-0 border-0 p-0">
        <label htmlFor="invite-code" className="text-sm font-semibold">
          {t("join.code")}
        </label>
        <input
          id="invite-code"
          value={code}
          maxLength={64}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "invite-code-error" : undefined}
          className="field-control mt-2 w-full font-mono uppercase tracking-[0.08em]"
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
            setAccepted(false);
          }}
        />
        {error && (
          <p
            id="invite-code-error"
            role="alert"
            className="mt-2 text-sm text-destructive"
          >
            {t(`join.${error}`)}
          </p>
        )}
        {accepted && (
          <p role="status" className="mt-2 text-sm font-semibold text-success">
            {t("join.accepted")}
          </p>
        )}
        <Button type="submit" className="mt-4 w-full">
          {isPending ? t("join.joining") : t("join.submit")}
        </Button>
      </fieldset>
    </form>
  );
}

function RedeemInviteForm() {
  return (
    <DogSelectionConsumer>
      {(dogSelection) => <RedeemInviteFields dogSelection={dogSelection} />}
    </DogSelectionConsumer>
  );
}

export default RedeemInviteForm;
