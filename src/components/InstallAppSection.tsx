import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { InstallApp } from "@/hooks/useInstallPrompt";

const isInstalled = () =>
  window.matchMedia?.("(display-mode: standalone)").matches === true ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function InstallAppSection({ installApp }: { installApp: InstallApp | null }) {
  const { t } = useTranslation("settings");
  const [status, setStatus] = useState<
    "idle" | "installing" | "accepted" | "dismissed" | "error"
  >("idle");
  const installed = isInstalled();
  const ios = isIos();

  const install = async () => {
    if (!installApp || status === "installing") return;
    setStatus("installing");
    try {
      setStatus(await installApp());
    } catch {
      setStatus("error");
    }
  };

  const message = installed
    ? t("install.installed")
    : status === "accepted"
      ? t("install.accepted")
      : status === "dismissed"
        ? t("install.dismissed")
        : ios
          ? t("install.ios")
          : installApp
            ? t("install.available")
            : t("install.unavailable");

  return (
    <section
      aria-labelledby="install-title"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 border-b border-border py-6 sm:py-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-center"
    >
      <div className="min-w-0">
        <h2 id="install-title" className="text-xl font-bold leading-[1.625rem]">
          {t("install.title")}
        </h2>
        <p className="mt-3 max-w-[70ch] text-sm leading-5 text-muted-foreground">
          {t("install.description")}
        </p>
      </div>
      <div className="min-w-0" aria-live="polite" aria-atomic="true">
        {status === "error" ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {t("install.error")}
          </p>
        ) : (
          <p className="text-sm leading-5">
            {status === "installing" ? t("install.installing") : message}
          </p>
        )}
        {!installed && installApp && status === "idle" && (
          <Button
            type="button"
            className="mt-4 w-full"
            onClick={() => void install()}
          >
            {t("install.action")}
          </Button>
        )}
        {!installed && installApp && status === "error" && (
          <Button
            type="button"
            className="mt-4 w-full"
            onClick={() => void install()}
          >
            {t("install.retry")}
          </Button>
        )}
      </div>
    </section>
  );
}

export default InstallAppSection;
