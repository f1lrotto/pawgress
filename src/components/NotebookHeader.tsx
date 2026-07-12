import { useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { Id } from "../../convex/_generated/dataModel";
import BrandLockup from "@/components/BrandLockup";
import { DogSelectionConsumer } from "@/contexts/DogSelectionContext";

const primaryTabs = [
  { label: "header.today", to: "/" },
  { label: "header.agenda", to: "/agenda" },
  { label: "header.timeline", to: "/timeline" },
] as const;

const secondaryTabs = [
  { label: "header.insights", to: "/insights" },
  { label: "header.enrichment", to: "/enrichment" },
  { label: "header.training", to: "/training" },
] as const;

const tabs = [...primaryTabs, ...secondaryTabs];

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-5 sm:hidden"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.6 3.3 10.2 2h3.6l.6 1.3 1.6.7 1.4-.5 2.5 2.5-.5 1.4.7 1.6 1.3.6v3.6l-1.3.6-.7 1.6.5 1.4-2.5 2.5-1.4-.5-1.6.7-.6 1.3h-3.6l-.6-1.3-1.6-.7-1.4.5-2.5-2.5.5-1.4-.7-1.6-1.3-.6V9.6L3.9 9l.7-1.6L4.1 6l2.5-2.5L8 4l1.6-.7Z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function NotebookHeader({ dogName }: { dogName: string }) {
  const { t } = useTranslation(["settings", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const moreNavigationRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      const disclosure = moreNavigationRef.current;
      if (disclosure?.open && !disclosure.contains(event.target as Node))
        disclosure.removeAttribute("open");
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      const disclosure = moreNavigationRef.current;
      if (event.key !== "Escape" || !disclosure?.open) return;
      disclosure.removeAttribute("open");
      disclosure.querySelector("summary")?.focus();
    };

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, []);

  useEffect(() => {
    moreNavigationRef.current?.removeAttribute("open");
  }, [location.pathname]);

  return (
    <DogSelectionConsumer>
      {(dogSelection) => (
        <header className="relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 border-b border-foreground/15 pb-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 sm:pb-4 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
          <BrandLockup compact />

          <nav
            aria-label={t("header.navigation")}
            className="order-last col-span-3 grid w-full min-w-0 grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-1 sm:col-span-2 sm:grid-cols-6 xl:order-none xl:col-span-1 xl:justify-self-center"
          >
            {tabs.map(({ label, to }) => (
              <NavLink
                key={to}
                end={to === "/"}
                to={to}
                className={({ isActive }) =>
                  `relative min-h-11 min-w-0 items-center justify-center rounded-md px-1.5 py-2 text-center text-sm font-medium leading-4 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-accent sm:inline-flex sm:px-2 ${secondaryTabs.some((tab) => tab.to === to) ? "hidden" : "inline-flex"} ${
                    isActive
                      ? "font-semibold text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary sm:bg-secondary sm:after:hidden"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
                }
              >
                {t(label)}
              </NavLink>
            ))}
            <details
              ref={moreNavigationRef}
              className="group relative sm:hidden"
            >
              <summary
                className={`relative flex min-h-11 cursor-pointer list-none items-center justify-center rounded-md px-1.5 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] marker:hidden hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-accent group-open:bg-accent [&::-webkit-details-marker]:hidden ${
                  secondaryTabs.some(({ to }) => location.pathname === to)
                    ? "font-semibold text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground"
                }`}
              >
                {t("header.more")}
                <svg
                  aria-hidden="true"
                  className="ml-0.5 size-3.5 shrink-0 transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 16 16"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    d="m4 6 4 4 4-4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[var(--z-dropdown)] grid min-w-44 gap-1 rounded-lg border border-border bg-popover p-2 shadow-[var(--elevation-2)]">
                {secondaryTabs.map(({ label, to }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() =>
                      moreNavigationRef.current?.removeAttribute("open")
                    }
                    className={({ isActive }) =>
                      `flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-accent ${
                        isActive
                          ? "bg-secondary font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`
                    }
                  >
                    {t(label)}
                  </NavLink>
                ))}
              </div>
            </details>
          </nav>

          <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:col-span-1 sm:w-auto">
            {dogSelection?.dogs.length ? (
              <select
                aria-label={t("header.currentDog")}
                value={dogSelection.activeDogId ?? ""}
                onChange={(event) => {
                  dogSelection.selectDog(event.target.value as Id<"dogs">);
                  if (location.search)
                    navigate(location.pathname, { replace: true });
                }}
                className="field-control w-full min-w-0 max-w-28 px-2.5 text-sm font-semibold sm:max-w-none sm:px-3"
              >
                {dogSelection.dogs.map((dog) => (
                  <option key={dog._id} value={dog._id}>
                    {dog.name}
                  </option>
                ))}
              </select>
            ) : (
              <div
                aria-label={t("header.currentDogNamed", { dogName })}
                className="flex min-h-11 min-w-0 max-w-28 items-center overflow-hidden px-2 py-2 text-sm font-semibold text-foreground sm:max-w-none sm:overflow-visible sm:px-3"
              >
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap sm:whitespace-normal sm:[overflow-wrap:anywhere]">
                  {dogName}
                </span>
              </div>
            )}
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-accent sm:px-3 ${
                  isActive
                    ? "bg-secondary font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`
              }
              title={t("header.settings")}
            >
              <SettingsIcon />
              <span className="sr-only sm:not-sr-only sm:ml-2">
                {t("header.settings")}
              </span>
            </NavLink>
          </div>
        </header>
      )}
    </DogSelectionConsumer>
  );
}

export default NotebookHeader;
