import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { Id } from "../../convex/_generated/dataModel";
import BrandLockup from "@/components/BrandLockup";
import { DogSelectionConsumer } from "@/contexts/DogSelectionContext";

const tabs = [
  { label: "header.today", to: "/" },
  { label: "header.agenda", to: "/agenda" },
  { label: "header.timeline", to: "/timeline" },
  { label: "header.insights", to: "/insights" },
  { label: "header.enrichment", to: "/enrichment" },
  { label: "header.training", to: "/training" },
] as const;

function NotebookHeader({ dogName }: { dogName: string }) {
  const { t } = useTranslation(["settings", "common"]);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <DogSelectionConsumer>
      {(dogSelection) => (
        <header className="grid min-w-0 gap-x-4 gap-y-3 border-b border-foreground/15 pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:grid-cols-[auto_minmax(0,1fr)_auto]">
          <BrandLockup />

          <nav
            aria-label={t("header.navigation")}
            className="order-last grid w-full min-w-0 grid-cols-3 gap-1 p-1 sm:col-span-2 sm:grid-cols-6 xl:order-none xl:col-span-1 xl:justify-self-center"
          >
            {tabs.map(({ label, to }) => (
              <NavLink
                key={to}
                end={to === "/"}
                to={to}
                className={({ isActive }) =>
                  `inline-flex min-h-11 min-w-0 items-center justify-center rounded-md px-1.5 py-2 text-center text-sm font-medium leading-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-2 ${
                    isActive
                      ? "bg-secondary font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
                }
              >
                {t(label)}
              </NavLink>
            ))}
          </nav>

          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:w-auto">
            {dogSelection?.dogs.length ? (
              <select
                aria-label={t("header.currentDog")}
                value={dogSelection.activeDogId ?? ""}
                onChange={(event) => {
                  dogSelection.selectDog(event.target.value as Id<"dogs">);
                  if (location.search)
                    navigate(location.pathname, { replace: true });
                }}
                className="field-control w-full min-w-0 text-sm font-semibold"
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
                className="flex min-h-11 min-w-0 items-center px-3 py-2 text-sm font-semibold text-foreground"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {dogName}
                </span>
              </div>
            )}
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  isActive
                    ? "bg-secondary font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`
              }
            >
              {t("header.settings")}
            </NavLink>
          </div>
        </header>
      )}
    </DogSelectionConsumer>
  );
}

export default NotebookHeader;
