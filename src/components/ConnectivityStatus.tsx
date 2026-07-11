import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const getOnline = () => navigator.onLine;

function ConnectivityStatus() {
  const { t } = useTranslation("app");
  const online = useSyncExternalStore(subscribe, getOnline, () => true);

  if (online) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sticky top-0 z-50 flex min-h-11 items-center justify-center bg-foreground px-4 py-2 text-center text-sm font-bold text-background shadow-md"
    >
      {t("connectivity.offline")}
    </aside>
  );
}

export default ConnectivityStatus;
