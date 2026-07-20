import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { setLocale } from "@/i18n";
import TimelinePage from "./TimelinePage";

const convex = vi.hoisted(() => ({
  activityTypes: [] as unknown[] | undefined,
  eventLoadMore: vi.fn(),
  eventResults: [] as unknown[],
  eventStatus: "Exhausted" as
    "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted",
  paginatedCalls: [] as Array<{
    args: unknown;
    name: string;
    options: unknown;
  }>,
  queryCalls: [] as Array<{ args: unknown; name: string }>,
  trainingLoadMore: vi.fn(),
  trainingResults: [] as unknown[],
  trainingStatus: "Exhausted" as
    "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted",
  update: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => convex.update,
  usePaginatedQuery: (reference: unknown, args: unknown, options: unknown) => {
    const name = getFunctionName(reference as never);
    const isTraining = name === "training:listTimeline";
    convex.paginatedCalls.push({ args, name, options });
    return {
      loadMore: isTraining ? convex.trainingLoadMore : convex.eventLoadMore,
      results: isTraining ? convex.trainingResults : convex.eventResults,
      status: isTraining ? convex.trainingStatus : convex.eventStatus,
    };
  },
  useQuery: (reference: unknown, args: unknown) => {
    convex.queryCalls.push({
      args,
      name: getFunctionName(reference as never),
    });
    return convex.activityTypes;
  },
}));

const dogId = "dog-id" as Id<"dogs">;
const userId = "user-id" as Id<"users">;
const activityTypeId = "activity-id" as Id<"activityTypes">;
const dog = {
  _id: dogId,
  birthday: "2024-01-15",
  name: "Milo",
  timezone: "UTC",
};
const event = (overrides: Record<string, unknown> = {}) => ({
  _creationTime: 1,
  _id: "event-id" as Id<"events">,
  at: Date.parse("2026-07-10T10:00:00Z"),
  dogId,
  kind: "pee",
  userId,
  ...overrides,
});
const trainingSession = (overrides: Record<string, unknown> = {}) => ({
  _creationTime: 1,
  _id: "session-id" as Id<"trainingSessions">,
  at: Date.parse("2026-07-10T11:00:00Z"),
  commandId: "command-id" as Id<"trainingCommands">,
  commandName: "Sit",
  dogId,
  rating: 4,
  ...overrides,
});
const renderPage = (value = dog) =>
  render(
    <MemoryRouter initialEntries={["/timeline"]}>
      <TimelinePage dog={value} />
    </MemoryRouter>,
  );
const lastPaginatedCall = (name: string) =>
  convex.paginatedCalls.filter((call) => call.name === name).at(-1);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await setLocale("en");
  convex.activityTypes = [];
  convex.eventLoadMore.mockReset();
  convex.eventResults = [];
  convex.eventStatus = "Exhausted";
  convex.paginatedCalls = [];
  convex.queryCalls = [];
  convex.trainingLoadMore.mockReset();
  convex.trainingResults = [];
  convex.trainingStatus = "Exhausted";
  convex.update.mockReset();
});

describe("TimelinePage", () => {
  it("uses the shared app frame without a date picker", () => {
    renderPage();

    const main = screen.getByRole("main");
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Day by day.",
    });

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(main).toHaveAttribute("id", "main-content");
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(heading).toHaveClass(
      "text-[1.75rem]",
      "font-bold",
      "leading-[2.125rem]",
    );
    expect(heading).not.toHaveClass("font-display");
    expect(screen.queryByLabelText("Timeline date")).not.toBeInTheDocument();
    expect(screen.getByText("Days follow UTC.")).toBeVisible();
  });

  it("contains long dog names and timezone help in the page header", () => {
    const longName = "Bernard the Very Enthusiastic Garden Explorer".repeat(3);
    const longTimezone = "America/Argentina/ComodRivadavia".repeat(3);
    renderPage({ ...dog, name: longName, timezone: longTimezone });

    expect(screen.getByText(`Days follow ${longTimezone}.`)).toHaveClass(
      "break-words",
      "[overflow-wrap:anywhere]",
    );
    expect(
      screen.getByText(new RegExp(`Scroll through ${longName}`)),
    ).toHaveClass("break-words", "[overflow-wrap:anywhere]");
  });

  it("queries continuous event and training histories", () => {
    renderPage({ ...dog, timezone: "Europe/Bratislava" });

    expect(lastPaginatedCall("timeline:list")).toEqual({
      name: "timeline:list",
      args: { dogId },
      options: { initialNumItems: 30 },
    });
    expect(lastPaginatedCall("training:listTimeline")).toEqual({
      name: "training:listTimeline",
      args: { dogId },
      options: { initialNumItems: 30 },
    });
    expect(convex.queryCalls.at(-1)).toEqual({
      name: "activityTypes:list",
      args: { dogId, includeArchived: true, limit: 100 },
    });
  });

  it("skips history queries for an invalid timezone", () => {
    renderPage({ ...dog, timezone: "Mars/Olympus" });

    expect(lastPaginatedCall("timeline:list")?.args).toBe("skip");
    expect(lastPaginatedCall("training:listTimeline")?.args).toBe("skip");
    expect(convex.queryCalls.at(-1)?.args).toBe("skip");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't read this timeline",
    );
  });

  it("resets the relevant paginated streams when filters change", () => {
    renderPage();

    fireEvent.click(screen.getByRole("checkbox", { name: "Pee" }));
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();
    expect(lastPaginatedCall("timeline:list")?.args).toEqual({
      dogId,
      kinds: ["pee"],
    });
    expect(lastPaginatedCall("training:listTimeline")?.args).toBe("skip");

    fireEvent.click(screen.getByRole("checkbox", { name: "Meal" }));
    expect(lastPaginatedCall("timeline:list")?.args).toEqual({
      dogId,
      kinds: ["pee", "meal"],
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Pee" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Training" }));
    expect(lastPaginatedCall("timeline:list")?.args).toEqual({
      dogId,
      kinds: ["meal"],
    });
    expect(lastPaginatedCall("training:listTimeline")?.args).toEqual({ dogId });

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("checkbox", { name: "Meal" })).not.toBeChecked();
    expect(lastPaginatedCall("timeline:list")?.args).toEqual({ dogId });
    expect(lastPaginatedCall("training:listTimeline")?.args).toEqual({ dogId });
  });

  it("uses visible native checkboxes with direct keyboard focus styles", () => {
    renderPage();
    const filters = screen.getAllByRole("checkbox");

    expect(filters.map((filter) => filter.getAttribute("value"))).toEqual([
      "pee",
      "poop",
      "meal",
      "water",
      "treat",
      "wake",
      "sleep",
      "walk",
      "play",
      "note",
      "training",
    ]);
    for (const filter of filters) {
      filter.focus();
      expect(filter).toHaveFocus();
      expect(filter).not.toHaveClass("sr-only");
      expect(filter).toHaveClass(
        "accent-primary",
        "focus-visible:outline-2",
        "focus-visible:outline-offset-2",
        "focus-visible:outline-ring",
      );
      expect(filter.parentElement).toHaveClass("min-h-11", "rounded-md");
    }
  });

  it("uses shared activity visuals in filters and stream rows", () => {
    convex.eventResults = [event({ kind: "meal" })];
    renderPage();

    const filter = screen
      .getByRole("checkbox", { name: "Meal" })
      .closest("label");
    const row = screen.getByRole("listitem");
    const heading = within(row).getByRole("heading", { name: "Meal" });
    const surface = heading.closest('[data-activity-kind="meal"]');
    const marker = row.querySelector('[data-marker-shape="moment"]');

    expect(filter).toHaveAttribute("data-activity-kind", "meal");
    expect(within(filter!).getByText("◒")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(row).toHaveAttribute("data-activity-kind", "meal");
    expect(surface).toHaveClass("bg-[var(--activity-surface)]");
    expect(marker).toHaveAttribute("data-activity-kind", "meal");
    expect(within(heading).getByText("◒")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("distinguishes moment and duration markers without relying on color", () => {
    convex.eventResults = [
      event({
        _id: "meal-id",
        at: Date.parse("2026-07-10T12:00:00Z"),
        kind: "meal",
      }),
      event({
        _id: "sleep-id",
        at: Date.parse("2026-07-10T11:00:00Z"),
        kind: "sleep",
      }),
      event({
        _id: "ended-pee-id",
        endedAt: Date.parse("2026-07-10T10:05:00Z"),
      }),
    ];
    renderPage();

    const rowFor = (name: string) =>
      screen.getByRole("heading", { name }).closest("li")!;

    expect(
      rowFor("Meal").querySelector('[data-marker-shape="moment"]'),
    ).toBeInTheDocument();
    expect(
      rowFor("Fell asleep").querySelector('[data-marker-shape="duration"]'),
    ).toBeInTheDocument();
    expect(
      rowFor("Pee").querySelector('[data-marker-shape="duration"]'),
    ).toBeInTheDocument();
  });

  it("summarizes completed rest, walks, and grouped daily activity", () => {
    convex.eventResults = [
      event({
        _id: "unpaired-sleep-id",
        at: Date.parse("2026-07-10T12:00:00Z"),
        endedAt: Date.parse("2026-07-10T13:00:00Z"),
        kind: "sleep",
      }),
      event({
        _id: "walk-id",
        at: Date.parse("2026-07-10T10:00:00Z"),
        endedAt: Date.parse("2026-07-10T10:30:00Z"),
        kind: "walk",
      }),
      event({
        _id: "wake-id",
        at: Date.parse("2026-07-10T08:00:00Z"),
        kind: "wake",
      }),
      event({
        _id: "sleep-id",
        at: Date.parse("2026-07-10T06:00:00Z"),
        kind: "sleep",
      }),
    ];
    convex.trainingResults = [
      trainingSession({ notes: "Morning practice." }),
      trainingSession({
        _id: "stay-session",
        commandId: "stay-id",
        commandName: "Stay",
        notes: "Morning practice.",
      }),
    ];
    renderPage();

    expect(document.querySelector("[data-day-summary]")).toHaveTextContent(
      "2h rest · 30m walk · 5 activities",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("shows first-page, empty, loading-more, fallback, and exhausted states", () => {
    convex.eventStatus = "LoadingFirstPage";
    convex.trainingStatus = "LoadingFirstPage";
    const view = renderPage();
    const timeline = screen.getByRole("region", { name: "Timeline" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening the timeline",
    );
    expect(timeline).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll(".animate-pulse")).toHaveLength(3);

    convex.eventStatus = "Exhausted";
    convex.trainingStatus = "Exhausted";
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByText("No entries yet.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Log an activity" }),
    ).toHaveAttribute("href", "/");
    expect(timeline).toHaveAttribute("aria-busy", "false");

    fireEvent.click(screen.getByRole("checkbox", { name: "Pee" }));
    expect(screen.getByText("No entries match these filters.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    convex.eventResults = [event()];
    convex.eventStatus = "CanLoadMore";
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={dog} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load older entries" }));
    expect(convex.eventLoadMore).toHaveBeenCalledWith(30);

    convex.eventStatus = "LoadingMore";
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={dog} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Loading older entries" }),
    ).toBeDisabled();
    expect(timeline).toHaveAttribute("aria-busy", "true");

    convex.eventStatus = "Exhausted";
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByText("You’ve reached the first entry.")).toBeVisible();
  });

  it("loads both histories automatically before the sentinel enters view", () => {
    let intersect = () => {};
    const observe = vi.fn();
    class IntersectionObserverMock {
      disconnect = vi.fn();
      observe = observe;

      constructor(callback: IntersectionObserverCallback) {
        intersect = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          );
      }
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    convex.eventResults = [
      event({ _id: "new-event", at: Date.parse("2026-07-10T12:00:00Z") }),
      event({ _id: "old-event", at: Date.parse("2026-07-10T10:00:00Z") }),
    ];
    convex.trainingResults = [
      trainingSession({ at: Date.parse("2026-07-10T11:00:00Z") }),
      trainingSession({
        _id: "old-session",
        at: Date.parse("2026-07-10T09:00:00Z"),
      }),
    ];
    convex.eventStatus = "CanLoadMore";
    convex.trainingStatus = "CanLoadMore";
    renderPage();

    expect(observe).toHaveBeenCalled();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    act(intersect);
    expect(convex.eventLoadMore).toHaveBeenCalledWith(30);
    expect(convex.trainingLoadMore).toHaveBeenCalledWith(30);
  });

  it("keeps entries around midnight adjacent under sticky day dividers", () => {
    convex.eventResults = [
      event({
        _id: "after-midnight",
        at: Date.parse("2026-07-10T00:15:00Z"),
        kind: "wake",
      }),
      event({
        _id: "before-midnight",
        at: Date.parse("2026-07-09T23:45:00Z"),
        kind: "sleep",
      }),
    ];
    renderPage();

    const days = screen.getAllByRole("heading", { level: 3 });
    expect(days.map(({ textContent }) => textContent)).toEqual([
      "Friday, July 10, 2026",
      "Thursday, July 9, 2026",
    ]);
    expect(days[0]?.parentElement).toHaveClass(
      "sticky",
      "top-0",
      "bg-secondary",
    );
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("00:15")).toBeVisible();
    expect(within(rows[1]).getByText("23:45")).toBeVisible();
  });

  it("renders complete read-only row metadata and archived Play names", () => {
    const activityName = Array(4)
      .fill("Old garden game with an exceptionally long activity name")
      .join(" ");
    convex.activityTypes = [
      {
        _creationTime: 1,
        _id: activityTypeId,
        dogId,
        emoji: "🌿",
        isArchived: true,
        name: activityName,
      },
    ];
    convex.eventResults = [
      event({
        _id: "play-id",
        activityTypeId,
        endedAt: Date.parse("2026-07-10T10:05:00Z"),
        kind: "play",
        note: "A very long field note ".repeat(20),
      }),
      event({
        _id: "meal-id",
        amount: 120,
        at: Date.parse("2026-07-10T09:00:00Z"),
        kind: "meal",
      }),
      event({
        _id: "pee-id",
        at: Date.parse("2026-07-10T08:00:00Z"),
        note: "Near the pond",
        walkId: "walk-id" as Id<"events">,
      }),
      event({
        _id: "unknown-play-id",
        activityTypeId: "missing-id" as Id<"activityTypes">,
        at: Date.parse("2026-07-10T07:00:00Z"),
        kind: "play",
      }),
    ];
    renderPage();

    const rows = screen.getAllByRole("listitem");
    const activityHeading = within(rows[0]).getByRole("heading", {
      name: `🌿 ${activityName}`,
    });
    expect(rows).toHaveLength(4);
    expect(activityHeading).toHaveClass(
      "break-words",
      "[overflow-wrap:anywhere]",
    );
    expect(within(rows[0]).getByText("Duration: 5m")).toBeVisible();
    expect(within(rows[1]).getByText("Amount: 120")).toBeVisible();
    expect(within(rows[2]).getByText("Near the pond")).toBeVisible();
    expect(within(rows[2]).getByText("During walk")).toHaveAttribute(
      "title",
      "Linked walk walk-id",
    );
    expect(within(rows[3]).getByText("Play")).toBeVisible();
  });

  it("groups training sessions in chronology and filters to training", () => {
    convex.eventResults = [
      event({ at: Date.parse("2026-07-10T10:00:00Z"), kind: "meal" }),
    ];
    convex.trainingResults = [
      trainingSession({
        _id: "sit-session",
        commandId: "sit-id",
        commandName: "Sit",
        notes: "Mixed practice.",
        rating: 2,
      }),
      trainingSession({
        _id: "stay-session",
        commandId: "stay-id",
        commandName: "Stay",
        notes: "Mixed practice.",
      }),
      trainingSession({
        _id: "recall-session",
        at: Date.parse("2026-07-10T09:00:00Z"),
        commandId: "recall-id",
        commandName: "Recall",
        notes: "Great focus outside.",
      }),
    ];
    renderPage();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Sit")).toBeVisible();
    expect(within(rows[0]).getByText("Stay")).toBeVisible();
    expect(within(rows[0]).getByText("Negative")).toBeVisible();
    expect(within(rows[0]).getByText("Positive")).toBeVisible();
    expect(
      within(rows[0]).getByRole("link", { name: "View training" }),
    ).toHaveAttribute("href", "/training");
    expect(
      within(rows[2]).getByRole("link", { name: "View command" }),
    ).toHaveAttribute("href", "/training?command=recall-id#command-detail");

    fireEvent.click(screen.getByRole("checkbox", { name: "Training" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(lastPaginatedCall("timeline:list")?.args).toBe("skip");
    expect(lastPaginatedCall("training:listTimeline")?.args).toEqual({ dogId });
  });

  it("edits a timeline entry with the shared event editor", async () => {
    convex.eventResults = [event({ note: "Before" })];
    convex.update.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Edit Pee at 10:00" }));
    const editor = screen.getByRole("form", { name: "Edit Pee event" });
    fireEvent.change(within(editor).getByLabelText(/Note/), {
      target: { value: "After" },
    });
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(convex.update).toHaveBeenCalledWith({
        dogId,
        eventId: "event-id",
        note: "After",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Pee updated.");
  });

  it("does not block timeline rows while activity names load", () => {
    convex.activityTypes = undefined;
    convex.eventResults = [event({ kind: "play", activityTypeId })];
    renderPage();

    expect(screen.getByRole("listitem")).toHaveTextContent("Play");
  });

  it("renders Slovak filters, metadata, and day dividers", async () => {
    await setLocale("sk");
    convex.eventResults = [
      event({
        amount: 12.5,
        endedAt: Date.parse("2026-07-10T10:05:00Z"),
        peePlace: "outside",
        walkId: "walk-id" as Id<"events">,
      }),
    ];
    renderPage();

    expect(screen.getByRole("checkbox", { name: "Cikanie" })).toBeVisible();
    const row = screen.getByRole("listitem");
    expect(within(row).getByRole("heading", { name: "Cikanie" })).toBeVisible();
    expect(within(row).getByText("Vonku")).toBeVisible();
    expect(within(row).getByText("Trvanie: 5 min")).toBeVisible();
    expect(within(row).getByText("Množstvo: 12,5")).toBeVisible();
    expect(within(row).getByText("Počas prechádzky")).toHaveAttribute(
      "title",
      "Prepojená prechádzka walk-id",
    );
    expect(screen.getByText("piatok 10. júla 2026")).toBeVisible();
    expect(document.querySelector("[data-day-summary]")).toHaveTextContent(
      "1 aktivita",
    );
  });
});
