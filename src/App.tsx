import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  type FormEvent,
  lazy,
  type PropsWithChildren,
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import BrandLockup from "@/components/BrandLockup";
import AppFrame from "@/components/AppFrame";
import ConnectivityStatus from "@/components/ConnectivityStatus";
import { Button } from "@/components/ui/button";
import { DogSelectionProvider } from "@/contexts/DogSelectionContext";
import useInstallPrompt from "@/hooks/useInstallPrompt";
import i18n, { setLocale } from "@/i18n";
import { type Locale, resolveBrowserLocale } from "@/i18n/locale";
import DashboardPage from "@/pages/DashboardPage";

const AgendaPage = lazy(() => import("@/pages/AgendaPage"));
const EnrichmentPage = lazy(() => import("@/pages/EnrichmentPage"));
const InsightsPage = lazy(() => import("@/pages/InsightsPage"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const TimelinePage = lazy(() => import("@/pages/TimelinePage"));
const TrainingPage = lazy(() => import("@/pages/TrainingPage"));

type Mode = "signIn" | "signUp";
type FieldErrors = Partial<
  Record<"email" | "password" | "confirmation", string>
>;
type DogChoice = {
  dogList: readonly { _id: Id<"dogs"> }[] | undefined;
  fallbackDogId: Id<"dogs"> | null;
  requestedDogId: Id<"dogs"> | null;
  requestedWasAuthorized: boolean;
};

const initialDogChoice: DogChoice = {
  dogList: undefined,
  fallbackDogId: null,
  requestedDogId: null,
  requestedWasAuthorized: false,
};

const reconcileDogChoice = (choice: DogChoice, dogs: DogChoice["dogList"]) => {
  const requestedIsAuthorized = Boolean(
    dogs?.some(({ _id }) => _id === choice.requestedDogId),
  );
  const requestedWasRemoved =
    choice.requestedWasAuthorized && !requestedIsAuthorized;
  const fallbackIsAuthorized = dogs?.some(
    ({ _id }) => _id === choice.fallbackDogId,
  );

  return {
    dogList: dogs,
    fallbackDogId: fallbackIsAuthorized
      ? choice.fallbackDogId
      : (dogs?.[0]?._id ?? null),
    requestedDogId: requestedWasRemoved ? null : choice.requestedDogId,
    requestedWasAuthorized: requestedWasRemoved
      ? false
      : choice.requestedWasAuthorized || requestedIsAuthorized,
  };
};

function AuthLoading() {
  const { t } = useTranslation("app");

  return (
    <main className="grid min-h-svh place-items-center bg-background px-5 text-foreground">
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto w-fit animate-pulse motion-reduce:animate-none">
          <BrandLockup />
        </div>
        <p className="mt-5 text-sm font-medium text-muted-foreground">
          {t("loading.auth")}
        </p>
      </div>
    </main>
  );
}

function OnboardingLoading() {
  const { t } = useTranslation("app");

  return (
    <main className="grid min-h-svh place-items-center bg-background px-5 text-foreground">
      <p
        role="status"
        aria-live="polite"
        className="text-sm font-medium text-muted-foreground"
      >
        {t("loading.section")}
      </p>
    </main>
  );
}

function RouteLoading({
  dogName,
  kind,
}: {
  dogName: string;
  kind: "section" | "insights";
}) {
  const { t } = useTranslation("app");

  return (
    <AppFrame dogName={dogName}>
      <p role="status" aria-live="polite" className="sr-only">
        {t(`loading.${kind}`)}
      </p>
      <div
        aria-hidden="true"
        className="animate-pulse py-8 motion-reduce:animate-none sm:py-10"
      >
        <div className="h-3 w-24 rounded-sm bg-muted" />
        <div className="mt-4 h-10 w-3/5 max-w-sm rounded-md bg-muted" />
        <div className="mt-3 h-4 w-4/5 max-w-xl rounded-sm bg-muted" />
        <div
          className={`mt-8 grid gap-4 ${kind === "insights" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
        >
          <div className="h-40 rounded-xl bg-card" />
          <div className="h-40 rounded-xl bg-card" />
          {kind === "insights" && <div className="h-40 rounded-xl bg-card" />}
        </div>
      </div>
    </AppFrame>
  );
}

function LoginPage() {
  const { t } = useTranslation("app");
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>("signIn");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isSignUp = mode === "signUp";

  const changeMode = (nextMode: Mode) => {
    if (isPending || nextMode === mode) return;
    setMode(nextMode);
    setErrors({});
    setFormError("");
    setShowPassword(false);
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    setErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    const nextErrors: FieldErrors = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = t("login.errors.email");
    }
    if (!password) {
      nextErrors.password = t("login.errors.password");
    } else if (isSignUp && password.length < 8) {
      nextErrors.password = t("login.errors.passwordLength");
    }
    if (isSignUp && confirmation !== password) {
      nextErrors.confirmation = t("login.errors.confirmation");
    }

    setErrors(nextErrors);
    setFormError("");
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      form.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }

    setIsPending(true);
    try {
      await signIn("password", { email, password, flow: mode });
    } catch {
      setFormError(
        isSignUp ? t("login.errors.signUp") : t("login.errors.signIn"),
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex min-h-svh max-w-6xl flex-col px-5 pb-8 pt-5 sm:px-8 lg:px-12 lg:pt-8">
        <header className="border-b border-border pb-4">
          <BrandLockup />
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,0.75fr)] lg:gap-16 lg:py-16">
          <section aria-labelledby="login-intro" className="max-w-xl">
            <h1
              id="login-intro"
              className="text-balance font-display text-4xl leading-tight tracking-[-0.03em] sm:text-5xl"
            >
              {t("login.title")}
              <span className="block italic text-primary">
                {t("login.titleAccent")}
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-pretty leading-7 text-muted-foreground">
              {t("login.description")}
            </p>
          </section>

          <section
            aria-labelledby="auth-title"
            className="mx-auto w-full max-w-lg rounded-xl border border-border bg-card p-5 sm:p-8"
          >
            <h2 id="auth-title" className="text-2xl font-bold leading-8">
              {isSignUp ? t("login.signUpTitle") : t("login.signInTitle")}
            </h2>

            <div
              role="group"
              className="mt-6 grid grid-cols-2 rounded-full border border-input bg-background p-1"
              aria-label={t("login.accountAccess")}
            >
              {(
                [
                  ["signIn", t("login.signIn")],
                  ["signUp", t("login.signUp")],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant="quiet"
                  aria-pressed={mode === value}
                  disabled={isPending}
                  onClick={() => changeMode(value)}
                  className="rounded-full px-3 text-sm aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {label}
                </Button>
              ))}
            </div>

            <form
              className="mt-6"
              noValidate
              aria-label={
                isSignUp ? t("login.signUpForm") : t("login.signInForm")
              }
              aria-busy={isPending}
              onSubmit={handleSubmit}
            >
              <fieldset disabled={isPending} className="m-0 border-0 p-0">
                <legend className="sr-only">
                  {isSignUp ? t("login.signUpForm") : t("login.signInForm")}
                </legend>
                <div>
                  <label htmlFor="email" className="text-sm font-bold">
                    {t("login.email")}
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    className="field-control mt-2 w-full"
                    onChange={() => clearFieldError("email")}
                  />
                  {errors.email && (
                    <p
                      id="email-error"
                      className="mt-2 text-sm text-destructive"
                    >
                      {errors.email}
                    </p>
                  )}
                </div>

                <div className="mt-5">
                  <label htmlFor="password" className="text-sm font-bold">
                    {t("login.password")}
                  </label>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      isSignUp ? "new-password" : "current-password"
                    }
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={
                      errors.password
                        ? "password-error"
                        : isSignUp
                          ? "password-help"
                          : undefined
                    }
                    className="field-control mt-2 w-full"
                    onChange={() => clearFieldError("password")}
                  />
                  {errors.password ? (
                    <p
                      id="password-error"
                      className="mt-2 text-sm text-destructive"
                    >
                      {errors.password}
                    </p>
                  ) : (
                    isSignUp && (
                      <p
                        id="password-help"
                        className="mt-2 text-sm text-muted-foreground"
                      >
                        {t("login.passwordHelp")}
                      </p>
                    )
                  )}
                </div>

                {isSignUp && (
                  <div className="mt-5">
                    <label htmlFor="confirmation" className="text-sm font-bold">
                      {t("login.confirmation")}
                    </label>
                    <input
                      id="confirmation"
                      name="confirmation"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      aria-invalid={Boolean(errors.confirmation)}
                      aria-describedby={
                        errors.confirmation ? "confirmation-error" : undefined
                      }
                      className="field-control mt-2 w-full"
                      onChange={() => clearFieldError("confirmation")}
                    />
                    {errors.confirmation && (
                      <p
                        id="confirmation-error"
                        className="mt-2 text-sm text-destructive"
                      >
                        {errors.confirmation}
                      </p>
                    )}
                  </div>
                )}

                <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(event) => setShowPassword(event.target.checked)}
                    className="size-4 accent-primary"
                  />
                  {isSignUp
                    ? t("login.showPasswords")
                    : t("login.showPassword")}
                </label>

                {formError && (
                  <p
                    role="alert"
                    className="mt-5 rounded-xl border border-destructive/25 bg-background/75 px-4 py-3 text-sm text-destructive"
                  >
                    {formError}
                  </p>
                )}

                <Button type="submit" size="lg" className="mt-6 w-full">
                  {isPending
                    ? isSignUp
                      ? t("login.creatingAccount")
                      : t("login.signingIn")
                    : isSignUp
                      ? t("login.signUp")
                      : t("login.signIn")}
                </Button>
              </fieldset>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}

const useLocaleBootstrap = (
  isAuthenticated: boolean,
  preference: Locale | null | undefined,
  persistLocale: (args: { locale: Locale }) => Promise<null>,
) => {
  const [browserLocale] = useState(resolveBrowserLocale);
  const [retry, setRetry] = useState(0);
  const pending = useRef<{
    key: string;
    promise: Promise<void>;
  } | null>(null);
  const targetLocale = isAuthenticated
    ? (preference ?? browserLocale)
    : browserLocale;
  const key = `${isAuthenticated ? "account" : "browser"}:${targetLocale}:${retry}`;
  const [state, setState] = useState<{
    key: string;
    status: "pending" | "ready" | "error";
  }>(() => ({
    key,
    status:
      (!isAuthenticated && i18n.resolvedLanguage === targetLocale) ||
      (isAuthenticated &&
        preference !== null &&
        preference !== undefined &&
        i18n.resolvedLanguage === targetLocale)
        ? "ready"
        : "pending",
  }));

  useLayoutEffect(() => {
    if (isAuthenticated && preference === undefined) {
      pending.current = null;
      return;
    }

    let active = true;
    const task =
      pending.current?.key === key
        ? pending.current.promise
        : (async () => {
            await setLocale(targetLocale);
            if (isAuthenticated && preference === null)
              await persistLocale({ locale: targetLocale });
          })();
    pending.current = { key, promise: task };
    void task.then(
      () => {
        if (active) setState({ key, status: "ready" });
      },
      () => {
        if (active) setState({ key, status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [isAuthenticated, key, persistLocale, preference, targetLocale]);

  const status = state.key === key ? state.status : "pending";
  return {
    error: status === "error" && (!isAuthenticated || preference !== undefined),
    ready:
      status === "ready" &&
      (!isAuthenticated || preference !== undefined) &&
      i18n.resolvedLanguage === targetLocale,
    retry: () => setRetry((current) => current + 1),
  };
};

function LocaleBootstrapError({ retry }: { retry: () => void }) {
  const { t } = useTranslation("app");

  return (
    <main className="grid min-h-svh place-items-center bg-background px-5 text-foreground">
      <div className="max-w-md text-center">
        <p role="alert" className="text-sm font-bold text-destructive">
          {t("loading.localeError")}
        </p>
        <Button className="mt-5" onClick={retry}>
          {t("loading.retry")}
        </Button>
      </div>
    </main>
  );
}

function AppShell({ children }: PropsWithChildren) {
  return (
    <>
      <ConnectivityStatus />
      {children}
    </>
  );
}

function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const persistLocale = useMutation(api.preferences.setLocale);
  const dogs = useQuery(api.dogs.listMine, isAuthenticated ? {} : "skip");
  const localePreference = useQuery(
    api.preferences.current,
    isAuthenticated ? {} : "skip",
  );
  const localeBootstrap = useLocaleBootstrap(
    isAuthenticated,
    localePreference,
    persistLocale,
  );
  const installApp = useInstallPrompt();
  const [dogChoice, setDogChoice] = useState(initialDogChoice);
  if (dogChoice.dogList !== dogs) {
    setDogChoice(reconcileDogChoice(dogChoice, dogs));
  }
  const location = useLocation();
  const intendedPath =
    (location.state as { from?: string } | null)?.from ?? "/";
  const requestedPath = `${location.pathname}${location.search}`;
  const selectedDog = dogs?.find(({ _id }) => _id === dogChoice.requestedDogId);
  const fallbackDog = dogs?.find(({ _id }) => _id === dogChoice.fallbackDogId);
  const activeDog = selectedDog ?? fallbackDog ?? dogs?.[0];
  const hasDogs = activeDog !== undefined;
  const selectDog = useCallback(
    (dogId: Id<"dogs">) => {
      setDogChoice((current) => ({
        ...current,
        requestedDogId: dogId,
        requestedWasAuthorized: Boolean(dogs?.some(({ _id }) => _id === dogId)),
      }));
    },
    [dogs],
  );
  const dogSelection = useMemo(
    () => ({
      activeDogId: activeDog?._id ?? null,
      dogs: dogs ?? [],
      selectDog,
    }),
    [activeDog?._id, dogs, selectDog],
  );

  if (localeBootstrap.error) {
    return (
      <AppShell>
        <LocaleBootstrapError retry={localeBootstrap.retry} />
      </AppShell>
    );
  }

  if (
    isLoading ||
    !localeBootstrap.ready ||
    (isAuthenticated && (dogs === undefined || localePreference === undefined))
  ) {
    return (
      <AppShell>
        <AuthLoading />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <DogSelectionProvider value={dogSelection}>
        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to={hasDogs ? intendedPath : "/onboarding"} replace />
              ) : (
                <LoginPage />
              )
            }
          />
          <Route
            path="/onboarding"
            element={
              !isAuthenticated ? (
                <Navigate to="/login" replace />
              ) : hasDogs ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<OnboardingLoading />}>
                  <OnboardingPage />
                </Suspense>
              )
            }
          />
          <Route
            path="/"
            element={
              !isAuthenticated ? (
                <Navigate to="/login" replace state={{ from: requestedPath }} />
              ) : activeDog ? (
                <DashboardPage key={activeDog._id} dog={activeDog} />
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          <Route
            path="/agenda"
            element={
              !isAuthenticated ? (
                <Navigate to="/login" replace state={{ from: requestedPath }} />
              ) : activeDog ? (
                <Suspense
                  fallback={
                    <RouteLoading dogName={activeDog.name} kind="section" />
                  }
                >
                  <AgendaPage key={activeDog._id} dog={activeDog} />
                </Suspense>
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          <Route
            path="/timeline"
            element={
              !isAuthenticated ? (
                <Navigate to="/login" replace state={{ from: requestedPath }} />
              ) : activeDog ? (
                <Suspense
                  fallback={
                    <RouteLoading dogName={activeDog.name} kind="section" />
                  }
                >
                  <TimelinePage key={activeDog._id} dog={activeDog} />
                </Suspense>
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          <Route
            path="/insights"
            element={
              !isAuthenticated ? (
                <Navigate to="/login" replace state={{ from: requestedPath }} />
              ) : activeDog ? (
                <Suspense
                  fallback={
                    <RouteLoading dogName={activeDog.name} kind="insights" />
                  }
                >
                  <InsightsPage key={activeDog._id} dog={activeDog} />
                </Suspense>
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          <Route
            path="/enrichment"
            element={
              !isAuthenticated ? (
                <Navigate to="/login" replace state={{ from: requestedPath }} />
              ) : activeDog ? (
                <Suspense
                  fallback={
                    <RouteLoading dogName={activeDog.name} kind="section" />
                  }
                >
                  <EnrichmentPage key={activeDog._id} dog={activeDog} />
                </Suspense>
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          <Route
            path="/training"
            element={
              !isAuthenticated ? (
                <Navigate to="/login" replace state={{ from: requestedPath }} />
              ) : activeDog ? (
                <Suspense
                  fallback={
                    <RouteLoading dogName={activeDog.name} kind="section" />
                  }
                >
                  <TrainingPage key={activeDog._id} dog={activeDog} />
                </Suspense>
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          <Route
            path="/settings"
            element={
              !isAuthenticated ? (
                <Navigate to="/login" replace state={{ from: requestedPath }} />
              ) : activeDog ? (
                <Suspense
                  fallback={
                    <RouteLoading dogName={activeDog.name} kind="section" />
                  }
                >
                  <SettingsPage
                    key={activeDog._id}
                    dog={activeDog}
                    installApp={installApp}
                  />
                </Suspense>
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          <Route
            path="*"
            element={
              <Navigate
                to={!isAuthenticated ? "/login" : hasDogs ? "/" : "/onboarding"}
                replace
                state={isAuthenticated ? undefined : { from: requestedPath }}
              />
            }
          />
        </Routes>
      </DogSelectionProvider>
    </AppShell>
  );
}

export default App;
