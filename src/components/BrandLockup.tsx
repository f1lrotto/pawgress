import { useTranslation } from "react-i18next";

function BrandLockup({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("common");

  return (
    <div
      className={`flex min-w-0 items-center ${compact ? "gap-2 sm:gap-3" : "gap-3"}`}
    >
      <span
        className={`grid shrink-0 place-items-center bg-foreground font-display text-background ${
          compact
            ? "size-9 rounded-lg text-base sm:size-10 sm:rounded-xl sm:text-lg"
            : "size-10 rounded-xl text-lg"
        }`}
        aria-hidden="true"
      >
        P
      </span>
      <span className="min-w-0">
        <strong
          className={`block whitespace-nowrap font-display leading-none ${compact ? "text-base sm:text-lg" : "text-lg"}`}
        >
          {t("brand.name")}
        </strong>
        <span
          className={`mt-1 text-sm font-medium leading-5 text-muted-foreground ${compact ? "hidden sm:block" : "block"}`}
        >
          {t("brand.tagline")}
        </span>
      </span>
    </div>
  );
}

export default BrandLockup;
