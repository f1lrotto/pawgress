import { useQuery } from "convex/react";
import {
  Component,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import AppFrame from "@/components/AppFrame";
import BodyMetricsPanel from "@/components/BodyMetricsPanel";
import {
  OutingInsight,
  PottyInsight,
  RatingInsight,
  SleepInsight,
  WeightInsight,
} from "@/components/insights/InsightCharts";
import { Button } from "@/components/ui/button";
import { getRecentZonedDayWindows } from "@/lib/zonedDateTime";

type InsightsDog = Pick<Doc<"dogs">, "_id" | "birthday" | "name" | "timezone">;

function InsightsErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("insights");
  const alertRef = useRef<HTMLElement | null>(null);

  useEffect(() => alertRef.current?.focus(), []);

  return (
    <section
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="py-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:py-10"
    >
      <h1 className="text-balance text-[1.75rem] font-bold leading-[2.125rem]">
        {t("page.errorTitle")}
      </h1>
      <p className="mt-3 max-w-[70ch] text-pretty text-base leading-6 text-muted-foreground">
        {t("page.errorBody")}
      </p>
      <Button type="button" className="mt-6" onClick={onRetry}>
        {t("page.retry")}
      </Button>
    </section>
  );
}

class InsightsErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  retry = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? (
      <InsightsErrorFallback onRetry={this.retry} />
    ) : (
      this.props.children
    );
  }
}

function InsightsContent({ dog }: { dog: InsightsDog }) {
  const { t } = useTranslation("insights");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const days = useMemo(
    () => getRecentZonedDayWindows(now, dog.timezone, 30),
    [dog.timezone, now],
  );
  const first = days[0];
  const last = days.at(-1);
  const validRange = days.length === 30 && first && last;
  const windowArgs = validRange
    ? { dogId: dog._id, startAt: first.startAt, endAt: last.endAt }
    : "skip";
  const potty = useQuery(api.insights.pottyByHour, windowArgs);
  const outings = useQuery(api.insights.walkIntervals, windowArgs);
  const sleep = useQuery(
    api.insights.sleepByDay,
    validRange ? { dogId: dog._id, days, now } : "skip",
  );
  const ratings = useQuery(
    api.insights.dayRatings,
    validRange
      ? { dogId: dog._id, startDate: first.date, endDate: last.date }
      : "skip",
  );
  const metrics = useQuery(
    api.bodyMetrics.listRecent,
    validRange ? { dogId: dog._id, limit: 500 } : "skip",
  );

  return (
    <>
      <section className="py-6 sm:py-8" aria-labelledby="insights-title">
        <p className="text-sm font-medium text-muted-foreground">
          {t("page.range")}
        </p>
        <h1
          id="insights-title"
          className="mt-2 min-w-0 break-words text-balance text-[1.75rem] font-bold leading-[2.125rem] [overflow-wrap:anywhere]"
        >
          {t("page.title", { name: dog.name })}
        </h1>
        <p className="mt-3 max-w-[70ch] text-pretty text-base leading-6 text-muted-foreground">
          {t("page.body")}
        </p>
      </section>

      {!validRange ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/25 bg-card p-4 text-sm text-destructive"
        >
          {t("page.invalidTimezone")}
        </div>
      ) : (
        <>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <WeightInsight
              loading={metrics === undefined}
              metrics={metrics ?? []}
              timezone={dog.timezone}
            />
            <PottyInsight loading={potty === undefined} buckets={potty ?? []} />
            <OutingInsight
              loading={outings === undefined}
              intervals={outings ?? []}
              timezone={dog.timezone}
            />
            <SleepInsight loading={sleep === undefined} totals={sleep ?? []} />
            <div className="min-w-0 lg:col-span-2">
              <RatingInsight
                loading={ratings === undefined}
                ratings={ratings ?? []}
              />
            </div>
          </div>
          <div className="mt-8">
            <BodyMetricsPanel dog={dog} />
          </div>
        </>
      )}
    </>
  );
}

function InsightsPage({ dog }: { dog: InsightsDog }) {
  return (
    <AppFrame dogName={dog.name}>
      <InsightsErrorBoundary>
        <InsightsContent dog={dog} />
      </InsightsErrorBoundary>
    </AppFrame>
  );
}

export default InsightsPage;
