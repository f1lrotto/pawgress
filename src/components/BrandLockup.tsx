import { useTranslation } from "react-i18next";

function BrandLockup() {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground font-display text-lg text-background"
        aria-hidden="true"
      >
        P
      </span>
      <span className="min-w-0">
        <strong className="block whitespace-nowrap font-display text-lg leading-none">
          {t("brand.name")}
        </strong>
        <span className="mt-1 block text-sm font-medium leading-5 text-muted-foreground">
          {t("brand.tagline")}
        </span>
      </span>
    </div>
  );
}

export default BrandLockup;
