import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import NotebookHeader from "@/components/NotebookHeader";

function AppFrame({
  children,
  dogName,
  isBusy,
}: {
  children: ReactNode;
  dogName: string;
  isBusy?: boolean;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="min-h-svh bg-background px-4 pb-10 pt-4 text-foreground sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
      <a
        href="#main-content"
        className="fixed start-4 top-4 z-[var(--z-tooltip)] -translate-y-[calc(100%+2rem)] rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground transition-transform focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        {t("header.skipToContent")}
      </a>
      <div className="mx-auto max-w-7xl">
        <NotebookHeader dogName={dogName} />
        <main id="main-content" tabIndex={-1} aria-busy={isBusy || undefined}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppFrame;
