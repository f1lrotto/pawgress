import { useMutation } from "convex/react";
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../convex/_generated/api";
import BrandLockup from "@/components/BrandLockup";
import RedeemInviteForm from "@/components/RedeemInviteForm";
import { Button } from "@/components/ui/button";

type Step = 1 | 2 | 3;
type Meal = { id: number; label: string; timeOfDay: string };
type ErrorKey =
  | "errors.nameRequired"
  | "errors.maxLength"
  | "errors.birthdayInvalid"
  | "errors.birthdayFuture"
  | "errors.weightPositive"
  | "errors.weightMaximum"
  | "errors.mealRequired"
  | "errors.mealDuplicate"
  | "errors.timeInvalid";
type MealError = { label?: ErrorKey; timeOfDay?: ErrorKey };
type SubmitHandler = (event: FormEvent<HTMLFormElement>) => void;

const maxMeals = 8;
const maxLabelLength = 64;
const maxNameLength = 64;
const maxWeightKg = 500;
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const steps = [
  [1, "shell.puppy"],
  [2, "shell.weight"],
  [3, "shell.meals"],
] as const;
const headingClassName =
  "text-balance text-[1.75rem] font-bold leading-[2.125rem] focus:rounded-md focus:outline-2 focus:outline-offset-4 focus:outline-ring";

const todayInTimezone = () => {
  try {
    return new Date().toLocaleDateString("sv-SE", { timeZone: timezone });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const getBirthdayError = (birthday: string) => {
  const parsed = new Date(`${birthday}T00:00:00.000Z`);
  const isRealDate =
    /^\d{4}-\d{2}-\d{2}$/.test(birthday) &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === birthday;

  if (!isRealDate) return "errors.birthdayInvalid" as const;
  if (birthday > todayInTimezone()) return "errors.birthdayFuture" as const;
  return null;
};

const validateMeals = (meals: Meal[]) => {
  const labels = meals.map(({ label }) => label.trim().toLowerCase());
  const errors = Object.fromEntries(
    meals.map((meal, index) => {
      const label = meal.label.trim();
      const duplicate =
        label.length > 0 &&
        labels.some(
          (candidate, otherIndex) =>
            otherIndex !== index && candidate === labels[index],
        );

      return [
        meal.id,
        {
          label:
            label.length === 0
              ? "errors.mealRequired"
              : label.length > maxLabelLength
                ? "errors.maxLength"
                : duplicate
                  ? "errors.mealDuplicate"
                  : undefined,
          timeOfDay: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(meal.timeOfDay)
            ? undefined
            : "errors.timeInvalid",
        },
      ];
    }),
  ) as Record<number, MealError>;

  return {
    errors,
    isValid:
      meals.length > 0 &&
      meals.length <= maxMeals &&
      Object.values(errors).every(
        ({ label, timeOfDay }) => !label && !timeOfDay,
      ),
  };
};

function StepProgress({ step }: { step: Step }) {
  const { t } = useTranslation("onboarding");

  return (
    <ol
      aria-label={t("shell.progress")}
      className="grid grid-cols-3 gap-2 border-b border-foreground/15 pb-5"
    >
      {steps.map(([number, label]) => {
        const completed = number < step;

        return (
          <li
            key={label}
            aria-current={step === number ? "step" : undefined}
            className="flex min-w-0 flex-col items-center gap-2 text-center text-sm font-semibold leading-5 text-muted-foreground aria-current:font-bold aria-current:text-foreground sm:flex-row sm:text-left"
          >
            <span
              aria-hidden="true"
              className={`grid size-8 shrink-0 place-items-center rounded-full border border-current text-sm ${step === number ? "bg-foreground text-background" : ""}`}
            >
              {completed ? "✅" : number}
            </span>
            <span>{t(label)}</span>
            {completed && (
              <span className="sr-only">{`, ${t("shell.completed")}`}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function PuppyStep({
  birthday,
  birthdayError,
  headingRef,
  name,
  nameError,
  onBirthdayChange,
  onNameChange,
  onSubmit,
}: {
  birthday: string;
  birthdayError: ErrorKey | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  name: string;
  nameError: ErrorKey | null;
  onBirthdayChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: SubmitHandler;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <form className="mt-7" noValidate onSubmit={onSubmit}>
      <h1 ref={headingRef} tabIndex={-1} className={headingClassName}>
        {t("puppy.title")}
      </h1>

      <div className="mt-7">
        <label htmlFor="puppy-name" className="text-sm font-bold">
          {t("puppy.name")}
        </label>
        <input
          id="puppy-name"
          name="name"
          value={name}
          autoComplete="off"
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? "name-error" : undefined}
          className="field-control mt-2 w-full"
          onChange={(event) => onNameChange(event.target.value)}
        />
        {nameError && (
          <p id="name-error" className="mt-2 text-sm text-destructive">
            {t(nameError)}
          </p>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor="birthday" className="text-sm font-bold">
          {t("puppy.birthday")}
        </label>
        <input
          id="birthday"
          name="birthday"
          type="date"
          value={birthday}
          max={todayInTimezone()}
          aria-invalid={Boolean(birthdayError)}
          aria-describedby={birthdayError ? "birthday-error" : undefined}
          className="field-control mt-2 w-full"
          onChange={(event) => onBirthdayChange(event.target.value)}
        />
        {birthdayError && (
          <p id="birthday-error" className="mt-2 text-sm text-destructive">
            {t(birthdayError)}
          </p>
        )}
      </div>

      <p className="mt-5 text-sm leading-5 text-muted-foreground">
        {t("puppy.timezone", { timezone })}
      </p>

      <Button type="submit" size="lg" className="mt-7 w-full">
        {t("actions.continue")}
      </Button>
    </form>
  );
}

function WeightStep({
  headingRef,
  name,
  onBack,
  onSubmit,
  onWeightChange,
  weight,
  weightError,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  name: string;
  onBack: () => void;
  onSubmit: SubmitHandler;
  onWeightChange: (value: string) => void;
  weight: string;
  weightError: ErrorKey | null;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <form className="mt-7" noValidate onSubmit={onSubmit}>
      <h1 ref={headingRef} tabIndex={-1} className={headingClassName}>
        {t("weight.title")}
      </h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        {t("weight.description", { dogName: name.trim() })}
      </p>

      <div className="mt-7">
        <label htmlFor="weight" className="text-sm font-bold">
          {t("weight.label")}
        </label>
        <div className="relative">
          <input
            id="weight"
            name="weight"
            type="number"
            inputMode="decimal"
            min="0"
            max={maxWeightKg}
            step="any"
            value={weight}
            aria-invalid={Boolean(weightError)}
            aria-describedby={
              weightError ? "weight-unit weight-error" : "weight-unit"
            }
            className="field-control mt-2 w-full pr-14"
            onChange={(event) => onWeightChange(event.target.value)}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 mt-1 -translate-y-1/2 text-sm font-bold text-muted-foreground">
            kg
          </span>
        </div>
        <p id="weight-unit" className="mt-2 text-sm text-muted-foreground">
          {t("weight.unitHint")}
        </p>
        {weightError && (
          <p id="weight-error" className="mt-2 text-sm text-destructive">
            {t(weightError)}
          </p>
        )}
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-[auto_1fr]">
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          {t("actions.back")}
        </Button>
        <Button type="submit" size="lg">
          {t("actions.continue")}
        </Button>
      </div>
    </form>
  );
}

function MealRow({
  error,
  index,
  meal,
  removable,
  onChange,
  onRemove,
}: {
  error: MealError;
  index: number;
  meal: Meal;
  removable: boolean;
  onChange: (id: number, field: "label" | "timeOfDay", value: string) => void;
  onRemove: (id: number) => void;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <fieldset className="rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        {t("meals.item", { number: index + 1 })}
      </legend>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div>
          <label
            htmlFor={`meal-label-${meal.id}`}
            className="text-sm font-bold"
          >
            {t("meals.name")}
          </label>
          <input
            id={`meal-label-${meal.id}`}
            value={meal.label}
            aria-invalid={Boolean(error.label)}
            aria-describedby={
              error.label ? `meal-label-error-${meal.id}` : undefined
            }
            className="field-control mt-2 w-full"
            onChange={(event) => onChange(meal.id, "label", event.target.value)}
          />
          {error.label && (
            <p
              id={`meal-label-error-${meal.id}`}
              className="mt-2 text-sm text-destructive"
            >
              {t(error.label)}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`meal-time-${meal.id}`} className="text-sm font-bold">
            {t("meals.time")}
          </label>
          <input
            id={`meal-time-${meal.id}`}
            type="time"
            step="60"
            value={meal.timeOfDay}
            aria-invalid={Boolean(error.timeOfDay)}
            aria-describedby={
              error.timeOfDay ? `meal-time-error-${meal.id}` : undefined
            }
            className="field-control mt-2 w-full"
            onChange={(event) =>
              onChange(meal.id, "timeOfDay", event.target.value)
            }
          />
          {error.timeOfDay && (
            <p
              id={`meal-time-error-${meal.id}`}
              className="mt-2 text-sm text-destructive"
            >
              {t(error.timeOfDay)}
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="quiet"
        disabled={!removable}
        aria-label={t("meals.removeAria", { number: index + 1 })}
        className="mt-3 text-destructive hover:bg-destructive/10 active:bg-destructive/15"
        onClick={() => onRemove(meal.id)}
      >
        {t("meals.remove")}
      </Button>
    </fieldset>
  );
}

function MealsStep({
  headingRef,
  isPending,
  mealErrors,
  meals,
  name,
  onAdd,
  onBack,
  onChange,
  onRemove,
  onSubmit,
  saveError,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  isPending: boolean;
  mealErrors: Record<number, MealError>;
  meals: Meal[];
  name: string;
  onAdd: () => void;
  onBack: () => void;
  onChange: (id: number, field: "label" | "timeOfDay", value: string) => void;
  onRemove: (id: number) => void;
  onSubmit: SubmitHandler;
  saveError: boolean;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <form className="mt-7" noValidate aria-busy={isPending} onSubmit={onSubmit}>
      <fieldset disabled={isPending} className="m-0 border-0 p-0">
        <legend className="sr-only">{t("meals.routine")}</legend>
        <h1 ref={headingRef} tabIndex={-1} className={headingClassName}>
          {t("meals.title")}
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          {t("meals.description")}
        </p>

        <div className="mt-7 space-y-4">
          {meals.map((meal, index) => (
            <MealRow
              key={meal.id}
              error={mealErrors[meal.id] ?? {}}
              index={index}
              meal={meal}
              removable={meals.length > 1}
              onChange={onChange}
              onRemove={onRemove}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
          disabled={meals.length >= maxMeals}
          onClick={onAdd}
        >
          {meals.length >= maxMeals ? t("meals.limit") : t("meals.add")}
        </Button>

        {saveError && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-destructive/25 px-4 py-3.5 text-sm text-destructive"
          >
            {t("errors.save", { dogName: name.trim() })}
          </p>
        )}

        <div className="mt-7 grid gap-3 sm:grid-cols-[auto_1fr]">
          <Button type="button" variant="outline" size="lg" onClick={onBack}>
            {t("actions.back")}
          </Button>
          <Button type="submit" size="lg">
            {isPending
              ? t("meals.pending", { dogName: name.trim() })
              : t("meals.finish")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function OnboardingPage() {
  const { t } = useTranslation("onboarding");
  const completeOnboarding = useMutation(api.onboarding.complete);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [weight, setWeight] = useState("");
  const [nameError, setNameError] = useState<ErrorKey | null>(null);
  const [birthdayError, setBirthdayError] = useState<ErrorKey | null>(null);
  const [weightError, setWeightError] = useState<ErrorKey | null>(null);
  const [meals, setMeals] = useState<Meal[]>(() => [
    { id: 1, label: t("meals.defaultLabel"), timeOfDay: "07:30" },
  ]);
  const [mealErrors, setMealErrors] = useState<Record<number, MealError>>({});
  const [isPending, setIsPending] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const nextMealId = useRef(2);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const submitPuppy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const nextNameError =
      trimmedName.length === 0
        ? "errors.nameRequired"
        : trimmedName.length > maxNameLength
          ? "errors.maxLength"
          : null;
    const nextBirthdayError = getBirthdayError(birthday);
    setNameError(nextNameError);
    setBirthdayError(nextBirthdayError);

    if (nextNameError || nextBirthdayError) {
      document
        .getElementById(nextNameError ? "puppy-name" : "birthday")
        ?.focus();
      return;
    }
    setStep(2);
  };

  const submitWeight = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(weight);
    const nextError =
      !weight.trim() || !Number.isFinite(value) || value <= 0
        ? "errors.weightPositive"
        : value > maxWeightKg
          ? "errors.weightMaximum"
          : null;
    setWeightError(nextError);

    if (nextError) {
      document.getElementById("weight")?.focus();
      return;
    }
    setStep(3);
  };

  const updateMeal = (
    id: number,
    field: "label" | "timeOfDay",
    value: string,
  ) => {
    setMeals((current) =>
      current.map((meal) =>
        meal.id === id ? { ...meal, [field]: value } : meal,
      ),
    );
    setMealErrors((current) => ({
      ...current,
      [id]: { ...current[id], [field]: undefined },
    }));
    setSaveError(false);
    setIsDirty(true);
  };

  const addMeal = () => {
    if (meals.length >= maxMeals) return;
    const id = nextMealId.current++;
    setMeals((current) => [...current, { id, label: "", timeOfDay: "" }]);
    setSaveError(false);
    setIsDirty(true);
  };

  const removeMeal = (id: number) => {
    if (meals.length <= 1) return;
    setMeals((current) => current.filter((meal) => meal.id !== id));
    setMealErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSaveError(false);
    setIsDirty(true);
  };

  const completeSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const result = validateMeals(meals);
    setMealErrors(result.errors);

    if (!result.isValid) {
      const firstInvalid = meals.find(({ id }) => {
        const error = result.errors[id];
        return error?.label || error?.timeOfDay;
      });
      const field =
        firstInvalid && result.errors[firstInvalid.id]?.label
          ? "label"
          : "time";
      if (firstInvalid) {
        document.getElementById(`meal-${field}-${firstInvalid.id}`)?.focus();
      }
      return;
    }

    submitting.current = true;
    setIsPending(true);
    setSaveError(false);
    setIsDirty(false);
    try {
      await completeOnboarding({
        birthday,
        mealRoutines: meals
          .map(({ label, timeOfDay }) => ({
            label: label.trim(),
            timeOfDay,
          }))
          .sort((a, b) =>
            a.timeOfDay < b.timeOfDay ? -1 : a.timeOfDay > b.timeOfDay ? 1 : 0,
          ),
        name: name.trim(),
        timezone,
        weightKg: Number(weight),
      });
    } catch {
      setSaveError(true);
      setIsDirty(true);
    } finally {
      submitting.current = false;
      setIsPending(false);
    }
  };

  const goBack = () => {
    setSaveError(false);
    setStep((current) => (current === 3 ? 2 : 1));
  };

  return (
    <main className="min-h-svh bg-background px-5 py-5 text-foreground sm:px-8 lg:px-12 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-border pb-4">
          <BrandLockup />
        </header>

        <section
          aria-label={t("shell.setup")}
          className="mx-auto mt-8 max-w-3xl rounded-xl border border-border bg-card p-5 sm:mt-12 sm:p-8"
        >
          <StepProgress step={step} />
          {step === 1 ? (
            <PuppyStep
              birthday={birthday}
              birthdayError={birthdayError}
              headingRef={headingRef}
              name={name}
              nameError={nameError}
              onBirthdayChange={(value) => {
                setBirthday(value);
                setBirthdayError(null);
                setSaveError(false);
                setIsDirty(true);
              }}
              onNameChange={(value) => {
                setName(value);
                setNameError(null);
                setSaveError(false);
                setIsDirty(true);
              }}
              onSubmit={submitPuppy}
            />
          ) : step === 2 ? (
            <WeightStep
              headingRef={headingRef}
              name={name}
              onBack={goBack}
              onSubmit={submitWeight}
              onWeightChange={(value) => {
                setWeight(value);
                setWeightError(null);
                setSaveError(false);
                setIsDirty(true);
              }}
              weight={weight}
              weightError={weightError}
            />
          ) : (
            <MealsStep
              headingRef={headingRef}
              isPending={isPending}
              mealErrors={mealErrors}
              meals={meals}
              name={name}
              onAdd={addMeal}
              onBack={goBack}
              onChange={updateMeal}
              onRemove={removeMeal}
              onSubmit={completeSetup}
              saveError={saveError}
            />
          )}
        </section>

        {step === 1 && (
          <section
            aria-labelledby="join-household-title"
            className="mx-auto mt-8 grid max-w-3xl gap-5 border-t border-border pt-8 sm:grid-cols-[1fr_1.1fr] sm:items-center"
          >
            <div>
              <h2
                id="join-household-title"
                className="text-xl font-bold leading-[1.625rem]"
              >
                {t("invite.title")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t("invite.description")}
              </p>
            </div>
            <RedeemInviteForm />
          </section>
        )}
      </div>
    </main>
  );
}

export default OnboardingPage;
