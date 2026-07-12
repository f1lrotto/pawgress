import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { setLocale } from "@/i18n";
import InsightsPage from "./InsightsPage";

const convex = vi.hoisted(() => ({
  error: null as Error | null,
  metrics: undefined as unknown,
  potty: undefined as unknown,
  queryCalls: [] as Array<{ args: unknown; name: string }>,
  ratings: undefined as unknown,
  sleep: undefined as unknown,
  walks: undefined as unknown,
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: unknown, args: unknown) => {
    const name = getFunctionName(reference as never);
    convex.queryCalls.push({ args, name });
    if (convex.error) throw convex.error;
    if (args === "skip") return undefined;
    if (name === "insights:pottyByHour") return convex.potty;
    if (name === "insights:walkIntervals") return convex.walks;
    if (name === "insights:sleepByDay") return convex.sleep;
    if (name === "insights:dayRatings") return convex.ratings;
    return convex.metrics;
  },
}));

vi.mock("@/components/BodyMetricsPanel", () => ({
  default: ({ dog }: { dog: { name: string } }) => (
    <section aria-label="Body measurements">
      {dog.name} body measurements
    </section>
  ),
}));

vi.mock("recharts", () => {
  const Container = ({
    children,
    data,
  }: {
    children?: React.ReactNode;
    data?: unknown;
  }) => (
    <div
      data-chart-data={data ? JSON.stringify(data) : undefined}
      data-testid="chart-canvas"
    >
      {children}
    </div>
  );
  const Mark = ({ name }: { name?: string }) =>
    name ? <span data-testid="chart-series">{name}</span> : null;
  const Tooltip = ({
    formatter,
  }: {
    formatter?: (value: number) => unknown;
  }) => (
    <span data-testid="tooltip-value">{String(formatter?.(1.5) ?? "")}</span>
  );
  return {
    Bar: Mark,
    BarChart: Container,
    CartesianGrid: Mark,
    ComposedChart: Container,
    Legend: Mark,
    Line: Mark,
    LineChart: Container,
    ResponsiveContainer: Container,
    Scatter: Mark,
    Tooltip,
    XAxis: Mark,
    YAxis: Mark,
  };
});

const dog = {
  _id: "dog-id" as Id<"dogs">,
  birthday: "2024-01-15",
  name: "Zoe",
  timezone: "Europe/Bratislava",
};
const renderPage = (value = dog) =>
  render(
    <MemoryRouter initialEntries={["/insights"]}>
      <InsightsPage dog={value} />
    </MemoryRouter>,
  );
const query = (name: string) =>
  convex.queryCalls.find((call) => call.name === name);
const emptyResults = () => {
  convex.metrics = [];
  convex.potty = [];
  convex.ratings = [];
  convex.sleep = [];
  convex.walks = [];
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await setLocale("en");
  vi.useRealTimers();
  vi.restoreAllMocks();
  convex.error = null;
  convex.metrics = undefined;
  convex.potty = undefined;
  convex.queryCalls = [];
  convex.ratings = undefined;
  convex.sleep = undefined;
  convex.walks = undefined;
});

describe("InsightsPage", () => {
  it("queries the last 30 dog-local days with a DST-safe contract", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-03-30T12:00:00Z"));
    emptyResults();

    renderPage();

    const range = {
      dogId: dog._id,
      startAt: Date.parse("2026-02-28T23:00:00Z"),
      endAt: Date.parse("2026-03-30T22:00:00Z"),
    };
    expect(query("insights:pottyByHour")?.args).toEqual(range);
    expect(query("insights:walkIntervals")?.args).toEqual(range);
    expect(query("insights:dayRatings")?.args).toEqual({
      dogId: dog._id,
      startDate: "2026-03-01",
      endDate: "2026-03-30",
    });
    expect(query("bodyMetrics:listRecent")?.args).toEqual({
      dogId: dog._id,
      limit: 500,
    });

    const sleepArgs = query("insights:sleepByDay")?.args as {
      days: Array<{ date: string; startAt: number; endAt: number }>;
      dogId: Id<"dogs">;
    };
    expect(sleepArgs.dogId).toBe(dog._id);
    expect(sleepArgs.days).toHaveLength(30);
    expect(sleepArgs.days[0].date).toBe("2026-03-01");
    expect(sleepArgs.days.at(-1)?.date).toBe("2026-03-30");
    expect(
      sleepArgs.days.find(({ date }) => date === "2026-03-29")!.endAt -
        sleepArgs.days.find(({ date }) => date === "2026-03-29")!.startAt,
    ).toBe(23 * 60 * 60 * 1_000);
  });

  it("rolls the query window over after 30 seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-10T23:59:45Z");
    emptyResults();
    renderPage({ ...dog, timezone: "UTC" });
    expect(query("insights:dayRatings")?.args).toMatchObject({
      startDate: "2026-06-11",
      endDate: "2026-07-10",
    });

    convex.queryCalls = [];
    act(() => vi.advanceTimersByTime(30_000));

    expect(query("insights:dayRatings")?.args).toMatchObject({
      startDate: "2026-06-12",
      endDate: "2026-07-11",
    });
  });

  it("shows explicit loading and empty states", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:00:00Z"));
    const { rerender } = renderPage();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.getAllByRole("status", { name: /loading/i })).toHaveLength(5);

    emptyResults();
    rerender(
      <MemoryRouter initialEntries={["/insights"]}>
        <InsightsPage dog={dog} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        "No weights yet. Add a weight in body measurements to start this chart.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No potty breaks were logged in the last 30 days. Log them to see when they usually happen.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Log at least two completed walks to compare the time between them.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No sleep totals yet. Log sleep and wake times to see daily sleep patterns.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No daily ratings yet. Add ratings in Agenda to see how they change over time.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Body measurements" }),
    ).toBeInTheDocument();
  });

  it("wraps a long dog name in the page title", () => {
    const longName = "Z".repeat(300);
    emptyResults();

    renderPage({ ...dog, name: longName });

    expect(
      screen.getByRole("heading", { name: `Insights for ${longName}` }),
    ).toHaveClass("min-w-0", "break-words", "[overflow-wrap:anywhere]");
  });

  it("pairs every chart with ordered text data and meal markers", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:00:00Z"));
    convex.metrics = [
      {
        _creationTime: 3,
        _id: "metric-new",
        at: Date.parse("2026-07-10T08:00:00Z"),
        dogId: dog._id,
        weightKg: 5.2,
      },
      {
        _creationTime: 2,
        _id: "metric-other",
        at: Date.parse("2026-07-09T08:00:00Z"),
        chestCm: 32,
        dogId: dog._id,
      },
      {
        _creationTime: 1,
        _id: "metric-old",
        at: Date.parse("2026-07-08T08:00:00Z"),
        dogId: dog._id,
        weightKg: 4.8,
      },
    ];
    convex.potty = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      peeInside: hour === 2 ? 1 : 0,
      peeOutside: hour === 2 ? 2 : 0,
      poop: hour === 2 ? 1 : 0,
    }));
    convex.walks = [
      {
        fromWalkAt: Date.parse("2026-07-08T08:00:00Z"),
        fromWalkEndedAt: Date.parse("2026-07-08T08:30:00Z"),
        intervalMs: 24 * 60 * 60 * 1_000,
        mealAts: [Date.parse("2026-07-08T17:00:00Z")],
        toWalkAt: Date.parse("2026-07-09T08:30:00Z"),
      },
      {
        fromWalkAt: Date.parse("2026-07-09T08:30:00Z"),
        fromWalkEndedAt: Date.parse("2026-07-09T09:00:00Z"),
        intervalMs: 23 * 60 * 60 * 1_000,
        mealAts: [],
        toWalkAt: Date.parse("2026-07-10T08:00:00Z"),
      },
    ];
    convex.sleep = [
      { date: "2026-07-10", sleepMs: 8 * 60 * 60 * 1_000 },
      { date: "2026-07-08", sleepMs: 7.5 * 60 * 60 * 1_000 },
    ];
    convex.ratings = [
      { date: "2026-07-10", rating: 5 },
      { date: "2026-07-08", rating: 3 },
    ];

    renderPage();

    const weight = screen.getByRole("region", { name: "Weight trail" });
    expect(weight).toHaveTextContent("Recent measurements · kg");
    const weightRows = within(weight).getAllByRole("listitem");
    expect(weightRows[0]).toHaveTextContent("4.8 kg");
    expect(weightRows[1]).toHaveTextContent("5.2 kg");
    expect(weight).toHaveTextContent("Latest weight: 5.2 kg");

    const potty = screen.getByRole("region", { name: "Potty clock" });
    expect(potty).toHaveTextContent("Last 30 local days · events");
    expect(
      within(potty).getByRole("row", { name: /02:00 1 2 1/ }),
    ).toBeInTheDocument();

    const walks = screen.getByRole("region", { name: "Walk rhythm" });
    expect(walks).toHaveTextContent("Meal marker:");
    expect(walks).toHaveTextContent("No meal between walks");

    const sleep = screen.getByRole("region", { name: "Sleep ledger" });
    const sleepRows = within(sleep).getAllByRole("listitem");
    expect(sleepRows[0]).toHaveTextContent("Jul 8");
    expect(sleepRows[1]).toHaveTextContent("Jul 10");

    const ratings = screen.getByRole("region", { name: "Day ratings" });
    const ratingRows = within(ratings).getAllByRole("listitem");
    expect(ratingRows[0]).toHaveTextContent("Jul 8");
    expect(ratingRows[1]).toHaveTextContent("Jul 10");
    expect(screen.getAllByTestId("chart-canvas").length).toBeGreaterThanOrEqual(
      5,
    );
  });

  it("combines adjacent hours only in the compact visual chart", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    );
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:00:00Z"));
    emptyResults();
    convex.potty = [
      { hour: 2, peeInside: 1, peeOutside: 2, poop: 1 },
      { hour: 3, peeInside: 2, peeOutside: 1, poop: 0 },
    ];

    renderPage();

    const pottyChart = screen
      .getAllByTestId("chart-canvas")
      .find((element) => element.dataset.chartData?.includes("peeInside"));
    const chartData = JSON.parse(
      pottyChart?.dataset.chartData ?? "[]",
    ) as Array<{
      hour: number;
      peeInside: number;
      peeOutside: number;
      poop: number;
      poopMarker: number | null;
    }>;
    expect(chartData).toHaveLength(12);
    expect(chartData[1]).toMatchObject({
      hour: 2,
      peeInside: 3,
      peeOutside: 3,
      poop: 1,
      poopMarker: 1,
    });

    const table = screen.getByRole("table", {
      name: "Potty events by dog-local hour",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(
      within(table).getByRole("row", { name: /02:00 1 2 1/ }),
    ).toBeVisible();
    expect(
      within(table).getByRole("row", { name: /03:00 2 1 0/ }),
    ).toBeVisible();
  });

  it("focuses a safe error surface and retries inside the app shell", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    convex.error = new Error("offline");

    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Insights are unavailable");
    expect(alert).toHaveAttribute("tabindex", "-1");
    expect(alert).toHaveFocus();
    expect(screen.getByRole("navigation")).toBeVisible();

    convex.error = null;
    emptyResults();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      screen.getByRole("heading", { name: "Insights for Zoe" }),
    ).toBeVisible();
  });

  it("skips queries and explains an invalid dog timezone", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:00:00Z"));

    renderPage({ ...dog, timezone: "Mars/Olympus" });

    expect(screen.getByRole("alert")).toHaveTextContent("timezone");
    expect(convex.queryCalls).toHaveLength(5);
    expect(convex.queryCalls.every(({ args }) => args === "skip")).toBe(true);
  });

  it("renders Slovak chart, table, series, date, and decimal text", async () => {
    await setLocale("sk");
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:00:00Z"));
    convex.metrics = [
      {
        _creationTime: 1,
        _id: "metric",
        at: Date.parse("2026-07-10T08:00:00Z"),
        dogId: dog._id,
        weightKg: 5.2,
      },
    ];
    convex.potty = [{ hour: 2, peeInside: 1, peeOutside: 2, poop: 1 }];
    convex.walks = [];
    convex.sleep = [{ date: "2026-07-08", sleepMs: 7.5 * 60 * 60 * 1_000 }];
    convex.ratings = [{ date: "2026-07-08", rating: 4 }];

    renderPage();

    expect(
      screen.getByRole("heading", { name: "Prehľady pre Zoe" }),
    ).toBeVisible();
    const weight = screen.getByRole("region", { name: "Vývoj hmotnosti" });
    expect(weight).toHaveTextContent("Posledné merania · kg");
    expect(weight).toHaveTextContent("Najnovšia hmotnosť: 5,2 kg");
    expect(
      within(weight).getByRole("list", { name: "História hmotnosti" }),
    ).toBeVisible();
    expect(
      screen.getByRole("table", {
        name: "Cikanie a kakanie podľa miestnej hodiny psa",
      }),
    ).toHaveTextContent("02:00");
    expect(screen.getAllByTestId("chart-series")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ textContent: "Hmotnosť" }),
        expect.objectContaining({ textContent: "Nehody dnu" }),
        expect.objectContaining({ textContent: "Cikanie vonku" }),
        expect.objectContaining({ textContent: "Kakanie" }),
        expect.objectContaining({ textContent: "Hodiny spánku" }),
        expect.objectContaining({ textContent: "Hodnotenie dňa" }),
      ]),
    );
    expect(screen.getAllByTestId("tooltip-value")[0]).toHaveTextContent("1,5");
    expect(screen.getAllByText("8. 7.")).toHaveLength(2);
  });
});
