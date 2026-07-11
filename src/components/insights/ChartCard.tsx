import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

function ChartCard({
  children,
  description,
  empty,
  loading,
  meta,
  title,
}: {
  children: ReactNode;
  description: string;
  empty: string;
  loading: boolean;
  meta: string;
  title: string;
}) {
  const { t } = useTranslation("insights");
  return (
    <section
      aria-label={title}
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-balance text-xl font-bold leading-[1.625rem]">
          {title}
        </h2>
        <p className="text-sm font-medium text-muted-foreground">{meta}</p>
      </div>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {loading ? (
        <div className="mt-6">
          <p
            role="status"
            aria-label={t("card.loadingAria", { title })}
            className="sr-only"
          >
            {t("card.loading")}
          </p>
          <div
            aria-hidden="true"
            className="animate-pulse space-y-4 motion-reduce:animate-none"
          >
            <div className="h-56 rounded-md bg-muted sm:h-64" />
            <div className="space-y-2 border-t border-border pt-4">
              <div className="h-4 w-3/5 rounded-sm bg-muted" />
              <div className="h-4 w-4/5 rounded-sm bg-muted" />
              <div className="h-4 w-2/3 rounded-sm bg-muted" />
            </div>
          </div>
        </div>
      ) : children ? (
        <div className="mt-5 min-w-0">{children}</div>
      ) : (
        <p className="mt-6 rounded-md bg-muted/70 px-4 py-6 text-sm leading-5 text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

export default ChartCard;
