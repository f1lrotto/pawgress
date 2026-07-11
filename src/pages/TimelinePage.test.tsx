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
import TimelinePage from "./TimelinePage";

const convex = vi.hoisted(() => ({
  activityTypes: [] as unknown[] | undefined,
  loadMore: vi.fn(),
  paginatedCalls: [] as Array<{
    args: unknown;
    name: string;
    options: unknown;
  }>,
  queryCalls: [] as Array<{ args: unknown; name: string }>,
  results: [] as unknown[],
  status: "Exhausted" as
    "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted",
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: (reference: unknown, args: unknown, options: unknown) => {
    convex.paginatedCalls.push({
      args,
      name: getFunctionName(reference as never),
      options,
    });
    return {
      isLoading:
        convex.status === "LoadingFirstPage" || convex.status === "LoadingMore",
      loadMore: convex.loadMore,
      results: convex.results,
      status: convex.status,
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
const renderPage = (value = dog) =>
  render(
    <MemoryRouter initialEntries={["/timeline"]}>
      <TimelinePage dog={value} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(async () => {
  await setLocale("en");
  convex.activityTypes = [];
  convex.loadMore.mockReset();
  convex.paginatedCalls = [];
  convex.queryCalls = [];
  convex.results = [];
  convex.status = "Exhausted";
});

describe("TimelinePage", () => {
  it("uses the shared app frame and compact product header", () => {
    renderPage();

    const main = screen.getByRole("main");
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Day by day.",
    });
    const date = screen.getByLabelText("Timeline date");

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
    expect(
      screen.queryByText("Daily field record · newest first"),
    ).not.toBeInTheDocument();
    expect(date).toHaveClass("field-control");
    expect(date).toHaveAttribute("min", dog.birthday);
  });

  it("contains long dog names and timezone help in the page header", () => {
    const longName = "Bernard the Very Enthusiastic Garden Explorer".repeat(3);
    const longTimezone = "America/Argentina/ComodRivadavia".repeat(3);
    renderPage({ ...dog, name: longName, timezone: longTimezone });

    expect(screen.getByText(`Day boundary: ${longTimezone}`)).toHaveClass(
      "break-words",
      "[overflow-wrap:anywhere]",
    );
    expect(screen.getByText(new RegExp(`Read ${longName}`))).toHaveClass(
      "break-words",
      "[overflow-wrap:anywhere]",
    );
  });

  it("queries the exact dog-local DST day with Convex-managed pagination", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-03-29T12:00:00Z"));
    renderPage({ ...dog, timezone: "Europe/Bratislava" });

    expect(screen.getByLabelText("Timeline date")).toHaveValue("2026-03-29");
    expect(convex.paginatedCalls.at(-1)).toEqual({
      name: "timeline:listDay",
      args: {
        dogId,
        startAt: Date.parse("2026-03-28T23:00:00Z"),
        endAt: Date.parse("2026-03-29T22:00:00Z"),
      },
      options: { initialNumItems: 30 },
    });
    expect(convex.queryCalls).toEqual([
      {
        name: "activityTypes:list",
        args: { dogId, includeArchived: true, limit: 100 },
      },
    ]);
  });

  it("rolls a pristine local date on the 30-second tick and preserves edits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-09T21:59:45Z"));
    renderPage({ ...dog, timezone: "Europe/Bratislava" });
    const date = screen.getByLabelText("Timeline date");

    expect(date).toHaveValue("2026-07-09");
    act(() => vi.advanceTimersByTime(30_000));
    expect(date).toHaveValue("2026-07-10");
    expect(convex.paginatedCalls.at(-1)?.args).toEqual({
      dogId,
      startAt: Date.parse("2026-07-09T22:00:00Z"),
      endAt: Date.parse("2026-07-10T22:00:00Z"),
    });

    fireEvent.change(date, { target: { value: "2026-07-08" } });
    act(() => vi.advanceTimersByTime(24 * 60 * 60_000));
    expect(date).toHaveValue("2026-07-08");
  });

  it("syncs pristine timezone changes immediately and keeps dirty dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-10T00:30:00Z"));
    const view = renderPage();
    const date = screen.getByLabelText("Timeline date");

    expect(date).toHaveValue("2026-07-10");
    expect(vi.getTimerCount()).toBe(1);
    convex.paginatedCalls = [];
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={{ ...dog, timezone: "America/Los_Angeles" }} />
      </MemoryRouter>,
    );
    expect(date).toHaveValue("2026-07-09");
    expect(convex.paginatedCalls.at(-1)?.args).toEqual({
      dogId,
      startAt: Date.parse("2026-07-09T07:00:00Z"),
      endAt: Date.parse("2026-07-10T07:00:00Z"),
    });
    expect(vi.getTimerCount()).toBe(1);

    fireEvent.change(date, { target: { value: "2026-07-08" } });
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={{ ...dog, timezone: "Asia/Tokyo" }} />
      </MemoryRouter>,
    );
    expect(date).toHaveValue("2026-07-08");
    expect(convex.paginatedCalls.at(-1)?.args).toEqual({
      dogId,
      startAt: Date.parse("2026-07-07T15:00:00Z"),
      endAt: Date.parse("2026-07-08T15:00:00Z"),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("skips invalid day windows with an explicit alert", () => {
    renderPage({ ...dog, timezone: "Mars/Olympus" });

    expect(convex.paginatedCalls.at(-1)).toEqual({
      name: "timeline:listDay",
      args: "skip",
      options: { initialNumItems: 30 },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't read this timeline day",
    );
    expect(screen.getByRole("alert")).toHaveClass("rounded-md", "text-sm");
  });

  it("changes date and unique filters through query args that reset pagination", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-10T12:00:00Z"));
    renderPage();

    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pee" }));
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();
    expect(convex.paginatedCalls.at(-1)?.args).toEqual({
      dogId,
      startAt: Date.parse("2026-07-10T00:00:00Z"),
      endAt: Date.parse("2026-07-11T00:00:00Z"),
      kinds: ["pee"],
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Meal" }));
    expect(convex.paginatedCalls.at(-1)?.args).toEqual(
      expect.objectContaining({ kinds: ["pee", "meal"] }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Pee" }));
    expect(convex.paginatedCalls.at(-1)?.args).toEqual(
      expect.objectContaining({ kinds: ["meal"] }),
    );

    fireEvent.change(screen.getByLabelText("Timeline date"), {
      target: { value: "2026-10-25" },
    });
    expect(convex.paginatedCalls.at(-1)?.args).toEqual({
      dogId,
      startAt: Date.parse("2026-10-25T00:00:00Z"),
      endAt: Date.parse("2026-10-26T00:00:00Z"),
      kinds: ["meal"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("checkbox", { name: "Meal" })).not.toBeChecked();
    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).not.toBeInTheDocument();
    expect(convex.paginatedCalls.at(-1)?.args).toEqual({
      dogId,
      startAt: Date.parse("2026-10-25T00:00:00Z"),
      endAt: Date.parse("2026-10-26T00:00:00Z"),
    });
  });

  it("uses visible native checkboxes with direct keyboard focus styles", () => {
    renderPage();
    const filters = screen.getAllByRole("checkbox");

    expect(filters.map((filter) => filter.getAttribute("value"))).toEqual([
      "pee",
      "poop",
      "meal",
      "treat",
      "wake",
      "sleep",
      "walk",
      "play",
      "note",
    ]);
    for (const filter of filters) {
      filter.focus();
      expect(filter).toHaveFocus();
      expect(filter).toHaveAttribute("type", "checkbox");
      expect(filter).not.toHaveClass("sr-only");
      expect(filter).toHaveClass(
        "accent-primary",
        "focus-visible:outline-2",
        "focus-visible:outline-offset-2",
        "focus-visible:outline-ring",
      );
      expect(filter.parentElement).toHaveClass("min-h-11", "rounded-md");
    }

    fireEvent.click(filters[0]);
    expect(filters[0]).toBeChecked();
  });

  it("shows first-page, empty, loading-more, load-more, and exhausted states", () => {
    convex.status = "LoadingFirstPage";
    const view = renderPage();
    const region = screen.getByRole("region");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening this day’s field notes",
    );
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll(".animate-pulse")).toHaveLength(3);

    convex.status = "Exhausted";
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByText("No entries on this day.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Log an activity" }),
    ).toHaveAttribute("href", "/");
    expect(region).toHaveAttribute("aria-busy", "false");

    fireEvent.click(screen.getByRole("checkbox", { name: "Pee" }));
    expect(screen.getByText("No entries match these filters.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("No entries on this day.")).toBeVisible();

    convex.results = [event()];
    convex.status = "CanLoadMore";
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={dog} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load older entries" }));
    expect(convex.loadMore).toHaveBeenCalledWith(30);

    convex.status = "LoadingMore";
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={dog} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Loading older entries" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Loading older entries" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveAttribute("aria-busy", "true");

    convex.status = "Exhausted";
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <TimelinePage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByText("End of this day’s notes.")).toBeVisible();
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
    convex.results = [
      event({
        _id: "play-id",
        activityTypeId,
        at: Date.parse("2026-07-10T10:00:00Z"),
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
        kind: "pee",
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
    const ledgerHeading = screen.getByRole("heading", { level: 2 });
    expect(rows).toHaveLength(4);
    expect(activityHeading).toHaveClass(
      "break-words",
      "[overflow-wrap:anywhere]",
    );
    expect(activityHeading).not.toHaveClass("font-display", "truncate");
    expect(ledgerHeading).not.toHaveClass("font-display");
    expect(
      screen.getByRole("region", { name: ledgerHeading.textContent ?? "" }),
    ).toBeVisible();
    expect(within(rows[0]).getByText("10:00")).toHaveClass("tabular-nums");
    expect(within(rows[0]).getByText("Duration: 5m")).toBeVisible();
    expect(within(rows[0]).getByText(/A very long field note/)).toBeVisible();
    expect(within(rows[1]).getByText("Amount: 120")).toBeVisible();
    expect(within(rows[2]).getByText("Near the pond")).toBeVisible();
    expect(within(rows[2]).getByText("During walk")).toHaveAttribute(
      "title",
      "Linked walk walk-id",
    );
    expect(within(rows[3]).getByText("Play")).toBeVisible();
  });

  it("does not block timeline rows while activity names load", () => {
    convex.activityTypes = undefined;
    convex.results = [event({ kind: "play", activityTypeId })];
    renderPage();

    expect(screen.getByRole("listitem")).toHaveTextContent("Play");
  });

  it("renders Slovak filters, enum labels, metadata, and dates", async () => {
    await setLocale("sk");
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:00:00Z"));
    convex.results = [
      event({
        amount: 12.5,
        endedAt: Date.parse("2026-07-10T10:05:00Z"),
        kind: "pee",
        peePlace: "outside",
        walkId: "walk-id" as Id<"events">,
      }),
    ];
    renderPage();

    expect(screen.getByLabelText("Dátum časovej osi")).toHaveValue(
      "2026-07-10",
    );
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
    expect(screen.getByText("10. 7. 2026")).toBeVisible();
  });
});
