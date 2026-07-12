import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ChartCard from "./ChartCard";
import { formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";

type WeightMetric = { at: number; weightKg?: number };
type PottyBucket = {
  hour: number;
  peeInside: number;
  peeOutside: number;
  poop: number;
};
type WalkInterval = {
  fromWalkAt: number;
  fromWalkEndedAt: number;
  intervalMs: number;
  mealAts: number[];
  toWalkAt: number;
};
type SleepTotal = { date: string; sleepMs: number };
type DayRating = { date: string; rating: number };

const hours = (milliseconds: number) =>
  Math.round((milliseconds / 3_600_000) * 10) / 10;
const compareDate = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;
const chartClassName = "h-56 min-w-0 w-full sm:h-64";
const listClassName =
  "mt-4 max-h-52 divide-y divide-border overflow-auto border-t border-border text-sm";
const compactChartQuery = "(max-width: 479px)";
const axisProps = {
  axisLine: { stroke: "var(--border)" },
  tick: { fill: "var(--muted-foreground)", fontSize: 12 },
  tickLine: false,
} as const;

const useChartLocale = () => {
  const { i18n, t } = useTranslation("insights");
  const locale = i18n.resolvedLanguage as Locale;
  const number = (value: number) => formatNumber(value, locale);
  const hourFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        style: "unit",
        unit: "hour",
        unitDisplay: "long",
      }),
    [i18n.resolvedLanguage],
  );
  return {
    hoursText: (value: number) => hourFormatter.format(value),
    locale,
    number,
    t,
  };
};

const ChartGrid = () => (
  <CartesianGrid
    stroke="var(--border)"
    strokeDasharray="4 6"
    vertical={false}
  />
);

const ChartLegend = () => (
  <Legend
    iconSize={10}
    wrapperStyle={{ color: "var(--foreground)", fontSize: "0.875rem" }}
  />
);

const compactChartSnapshot = () =>
  window.matchMedia?.(compactChartQuery).matches === true;
const subscribeToCompactChart = (onChange: () => void) => {
  const query = window.matchMedia?.(compactChartQuery);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
};
const useCompactChart = () =>
  useSyncExternalStore(
    subscribeToCompactChart,
    compactChartSnapshot,
    () => false,
  );

const LocalizedTooltip = ({ locale }: { locale: Locale }) => (
  <Tooltip
    formatter={(value, name) =>
      name === "label" ? null : formatNumber(Number(value), locale)
    }
    contentStyle={{
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-control)",
      color: "var(--foreground)",
      fontSize: "0.875rem",
    }}
    itemStyle={{ color: "var(--foreground)" }}
    labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
  />
);

export function WeightInsight({
  loading,
  metrics,
  timezone,
}: {
  loading: boolean;
  metrics: WeightMetric[];
  timezone: string;
}) {
  const { locale, number, t } = useChartLocale();
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZone: timezone,
      }),
    [locale, timezone],
  );
  const data = metrics
    .filter(
      (metric): metric is WeightMetric & { weightKg: number } =>
        typeof metric.weightKg === "number",
    )
    .sort((left, right) => left.at - right.at)
    .map((metric) => ({ ...metric, label: formatter.format(metric.at) }));
  const latest = data.at(-1);

  return (
    <ChartCard
      title={t("charts.weight.title")}
      description={t("charts.weight.description")}
      empty={t("charts.weight.empty")}
      loading={loading}
      meta={t("charts.weight.meta")}
    >
      {latest && (
        <>
          <p className="border-b border-border pb-4 text-sm font-semibold text-primary">
            {t("charts.weight.latest", {
              date: latest.label,
              weight: number(latest.weightKg),
            })}
          </p>
          <div aria-hidden="true" className={chartClassName}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ left: 0, right: 18, top: 20 }}>
                <ChartGrid />
                <XAxis {...axisProps} dataKey="label" minTickGap={24} />
                <YAxis
                  {...axisProps}
                  unit=" kg"
                  width={54}
                  domain={["auto", "auto"]}
                  tickFormatter={number}
                />
                <LocalizedTooltip locale={locale} />
                <Line
                  dataKey="weightKg"
                  name={t("charts.weight.series")}
                  stroke="var(--chart-1)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ol aria-label={t("charts.weight.data")} className={listClassName}>
            {data.map(({ at, label, weightKg }) => (
              <li key={at} className="flex justify-between gap-3 py-2">
                <span>{label}</span>
                <strong>{number(weightKg)} kg</strong>
              </li>
            ))}
          </ol>
        </>
      )}
    </ChartCard>
  );
}

export function PottyInsight({
  buckets,
  loading,
}: {
  buckets: PottyBucket[];
  loading: boolean;
}) {
  const compact = useCompactChart();
  const { locale, number, t } = useChartLocale();
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        timeZone: "UTC",
      }),
    [locale],
  );
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const data = [...buckets]
    .sort((left, right) => left.hour - right.hour)
    .map((bucket) => ({
      ...bucket,
      label: timeFormatter.format(Date.UTC(2000, 0, 1, bucket.hour)),
    }));
  const chartData = compact
    ? Array.from({ length: 12 }, (_, index) => {
        const hour = index * 2;
        const pair = data.filter(
          (bucket) => bucket.hour >= hour && bucket.hour < hour + 2,
        );
        return pair.reduce(
          (sum, bucket) => ({
            hour,
            label: timeFormatter.format(Date.UTC(2000, 0, 1, hour)),
            peeInside: sum.peeInside + bucket.peeInside,
            peeOutside: sum.peeOutside + bucket.peeOutside,
            poop: sum.poop + bucket.poop,
          }),
          {
            hour,
            label: timeFormatter.format(Date.UTC(2000, 0, 1, hour)),
            peeInside: 0,
            peeOutside: 0,
            poop: 0,
          },
        );
      })
    : data;
  const plottedData = chartData.map((bucket) => ({
    ...bucket,
    poopMarker: bucket.poop || null,
  }));
  const totals = data.reduce(
    (sum, bucket) => ({
      inside: sum.inside + bucket.peeInside,
      outside: sum.outside + bucket.peeOutside,
      poop: sum.poop + bucket.poop,
    }),
    { inside: 0, outside: 0, poop: 0 },
  );
  const peeTotal = totals.inside + totals.outside;
  const hasEvents = peeTotal + totals.poop > 0;
  const successRate = percentFormatter.format(
    peeTotal ? totals.outside / peeTotal : 0,
  );

  return (
    <ChartCard
      title={t("charts.potty.title")}
      description={t("charts.potty.description")}
      empty={t("charts.potty.empty")}
      loading={loading}
      meta={t("charts.potty.meta")}
    >
      {hasEvents && (
        <>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border text-center">
            <div className="bg-muted px-3 py-3">
              <dt className="text-xs font-medium text-muted-foreground">
                {t("charts.potty.inside")}
              </dt>
              <dd className="mt-1 text-lg font-bold">
                {number(totals.inside)}
              </dd>
            </div>
            <div className="bg-muted px-3 py-3">
              <dt className="text-xs font-medium text-muted-foreground">
                {t("charts.potty.outside")}
              </dt>
              <dd className="mt-1 text-lg font-bold">
                {number(totals.outside)}
              </dd>
            </div>
            <div className="bg-muted px-3 py-3">
              <dt className="text-xs font-medium text-muted-foreground">
                {t("charts.potty.successRate")}
              </dt>
              <dd className="mt-1 text-lg font-bold">{successRate}</dd>
            </div>
          </dl>
          <div
            aria-hidden="true"
            className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground sm:text-sm"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-chart-1" />
              {t("charts.potty.outside")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg className="size-3" viewBox="0 0 12 12">
                <rect width="12" height="12" rx="2" fill="var(--chart-3)" />
                <path
                  d="M-2 10 10-2M2 14 14 2"
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              </svg>
              {t("charts.potty.inside")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg className="size-3" viewBox="0 0 12 12">
                <path
                  d="m6 1 5 5-5 5-5-5Z"
                  fill="var(--chart-4)"
                  stroke="var(--foreground)"
                  strokeWidth="1.25"
                />
              </svg>
              {t("charts.potty.poop")}
            </span>
          </div>
          <div aria-hidden="true" className={chartClassName}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={plottedData}
                barCategoryGap="20%"
                margin={{ left: 0, right: 8, top: 20 }}
              >
                <defs>
                  <pattern
                    id="potty-inside-hatch"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                  >
                    <rect width="6" height="6" fill="var(--chart-3)" />
                    <path
                      d="M-1 5 5-1M1 7 7 1"
                      stroke="var(--card)"
                      strokeOpacity="0.72"
                    />
                  </pattern>
                </defs>
                <ChartGrid />
                <XAxis
                  {...axisProps}
                  dataKey="label"
                  interval={compact ? 1 : 3}
                />
                <YAxis
                  {...axisProps}
                  allowDecimals={false}
                  width={32}
                  tickFormatter={number}
                />
                <LocalizedTooltip locale={locale} />
                <Bar
                  barSize={compact ? 20 : 14}
                  dataKey="peeOutside"
                  name={t("charts.potty.outside")}
                  fill="var(--chart-1)"
                  isAnimationActive={false}
                  stackId="pee"
                />
                <Bar
                  barSize={compact ? 20 : 14}
                  dataKey="peeInside"
                  name={t("charts.potty.inside")}
                  fill="url(#potty-inside-hatch)"
                  isAnimationActive={false}
                  stackId="pee"
                />
                <Scatter
                  dataKey="poopMarker"
                  fill="var(--chart-4)"
                  legendType="diamond"
                  name={t("charts.potty.poop")}
                  shape="diamond"
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 max-h-52 overflow-auto border-t border-border">
            <table className="w-full min-w-64 text-left text-sm">
              <caption className="sr-only">{t("charts.potty.caption")}</caption>
              <thead className="sticky top-0 bg-card text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3 py-2" scope="col">
                    {t("charts.potty.hour")}
                  </th>
                  <th className="px-3 py-2" scope="col">
                    {t("charts.potty.inside")}
                  </th>
                  <th className="px-3 py-2" scope="col">
                    {t("charts.potty.outside")}
                  </th>
                  <th className="px-3 py-2" scope="col">
                    {t("charts.potty.poop")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map(({ hour, label, peeInside, peeOutside, poop }) => (
                  <tr key={hour}>
                    <th className="px-3 py-2 font-medium" scope="row">
                      {label}
                    </th>
                    <td className="px-3 py-2">{number(peeInside)}</td>
                    <td className="px-3 py-2">{number(peeOutside)}</td>
                    <td className="px-3 py-2">{number(poop)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ChartCard>
  );
}

export function WalkInsight({
  intervals,
  loading,
  timezone,
}: {
  intervals: WalkInterval[];
  loading: boolean;
  timezone: string;
}) {
  const { hoursText, locale, number, t } = useChartLocale();
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZone: timezone,
      }),
    [locale, timezone],
  );
  const data = [...intervals]
    .sort((left, right) => left.toWalkAt - right.toWalkAt)
    .map((interval) => ({
      ...interval,
      intervalHours: hours(interval.intervalMs),
      label: formatter.format(interval.toWalkAt),
      mealMarker: interval.mealAts.length
        ? hours(interval.intervalMs)
        : undefined,
    }));

  return (
    <ChartCard
      title={t("charts.walk.title")}
      description={t("charts.walk.description")}
      empty={t("charts.walk.empty")}
      loading={loading}
      meta={t("charts.walk.meta")}
    >
      {data.length > 0 && (
        <>
          <div aria-hidden="true" className={chartClassName}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ left: 0, right: 16, top: 20 }}
              >
                <ChartGrid />
                <XAxis {...axisProps} dataKey="label" minTickGap={24} />
                <YAxis
                  {...axisProps}
                  unit={t("charts.common.hoursShort")}
                  width={42}
                  tickFormatter={number}
                />
                <LocalizedTooltip locale={locale} />
                <ChartLegend />
                <Bar
                  dataKey="intervalHours"
                  name={t("charts.walk.series")}
                  fill="var(--chart-3)"
                  isAnimationActive={false}
                />
                <Line
                  dataKey="mealMarker"
                  name={t("charts.walk.mealMarker")}
                  stroke="transparent"
                  dot={{ fill: "var(--chart-5)", r: 6, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ol aria-label={t("charts.walk.data")} className={listClassName}>
            {data.map(({ intervalHours, mealAts, toWalkAt, label }) => (
              <li key={toWalkAt} className="py-2">
                {t("charts.walk.interval", {
                  date: label,
                  hours: hoursText(intervalHours),
                })}
                {mealAts.length ? (
                  <span>
                    {t("charts.walk.meal", {
                      dates: mealAts
                        .map((at) => formatter.format(at))
                        .join(", "),
                    })}
                  </span>
                ) : (
                  <span>{t("charts.walk.noMeal")}</span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </ChartCard>
  );
}

export function SleepInsight({
  loading,
  totals,
}: {
  loading: boolean;
  totals: SleepTotal[];
}) {
  const { hoursText, locale, number, t } = useChartLocale();
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    [locale],
  );
  const data = [...totals]
    .sort((left, right) => compareDate(left.date, right.date))
    .map((total) => ({
      ...total,
      label: formatter.format(new Date(`${total.date}T12:00:00Z`)),
      sleepHours: hours(total.sleepMs),
    }));
  const hasSleep = data.some(({ sleepMs }) => sleepMs > 0);

  return (
    <ChartCard
      title={t("charts.sleep.title")}
      description={t("charts.sleep.description")}
      empty={t("charts.sleep.empty")}
      loading={loading}
      meta={t("charts.sleep.meta")}
    >
      {hasSleep && (
        <>
          <div aria-hidden="true" className={chartClassName}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: 0, right: 10, top: 20 }}>
                <ChartGrid />
                <XAxis {...axisProps} dataKey="label" minTickGap={22} />
                <YAxis
                  {...axisProps}
                  unit={t("charts.common.hoursShort")}
                  width={42}
                  tickFormatter={number}
                />
                <LocalizedTooltip locale={locale} />
                <Bar
                  dataKey="sleepHours"
                  name={t("charts.sleep.series")}
                  fill="var(--chart-4)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol aria-label={t("charts.sleep.data")} className={listClassName}>
            {data.map(({ date, label, sleepHours }) => (
              <li key={date} className="flex justify-between gap-3 py-2">
                <span>{label}</span>
                <strong>{hoursText(sleepHours)}</strong>
              </li>
            ))}
          </ol>
        </>
      )}
    </ChartCard>
  );
}

export function RatingInsight({
  loading,
  ratings,
}: {
  loading: boolean;
  ratings: DayRating[];
}) {
  const { locale, number, t } = useChartLocale();
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    [locale],
  );
  const data = [...ratings]
    .sort((left, right) => compareDate(left.date, right.date))
    .map((rating) => ({
      ...rating,
      label: formatter.format(new Date(`${rating.date}T12:00:00Z`)),
    }));

  return (
    <ChartCard
      title={t("charts.rating.title")}
      description={t("charts.rating.description")}
      empty={t("charts.rating.empty")}
      loading={loading}
      meta={t("charts.rating.meta")}
    >
      {data.length > 0 && (
        <>
          <div aria-hidden="true" className={chartClassName}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ left: 0, right: 18, top: 20 }}>
                <ChartGrid />
                <XAxis {...axisProps} dataKey="label" minTickGap={24} />
                <YAxis
                  {...axisProps}
                  allowDecimals={false}
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  width={28}
                  tickFormatter={number}
                />
                <LocalizedTooltip locale={locale} />
                <Line
                  dataKey="rating"
                  name={t("charts.rating.series")}
                  stroke="var(--chart-5)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ol aria-label={t("charts.rating.data")} className={listClassName}>
            {data.map(({ date, label, rating }) => (
              <li key={date} className="flex justify-between gap-3 py-2">
                <span>{label}</span>
                <strong>
                  {t("charts.common.rating", { value: number(rating) })}
                </strong>
              </li>
            ))}
          </ol>
        </>
      )}
    </ChartCard>
  );
}
