import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLocale } from "@/i18n";
import DayOverview, { type DayOverviewItem } from "./DayOverview";

const startAt = Date.parse("2026-07-20T00:00:00Z");
const endAt = Date.parse("2026-07-21T00:00:00Z");
const now = Date.parse("2026-07-20T18:20:00Z");
const item = (
  id: string,
  kind: DayOverviewItem["kind"],
  at: string,
  overrides: Partial<DayOverviewItem> = {},
): DayOverviewItem => ({
  id,
  kind,
  at: Date.parse(at),
  label: kind,
  ...overrides,
});
const renderOverview = (items: DayOverviewItem[] | undefined) =>
  render(
    <MemoryRouter>
      <DayOverview
        items={items}
        startAt={startAt}
        endAt={endAt}
        now={now}
        timezone="UTC"
      />
    </MemoryRouter>,
  );

afterEach(cleanup);

beforeEach(async () => {
  await setLocale("en");
});

describe("DayOverview", () => {
  it("preserves useful loading and empty states", () => {
    const view = renderOverview(undefined);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening today’s activity overview",
    );
    view.rerender(
      <MemoryRouter>
        <DayOverview
          items={[]}
          startAt={startAt}
          endAt={endAt}
          now={now}
          timezone="UTC"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No activities yet today/)).toBeVisible();
  });

  it("reconstructs overnight rest and clusters a dense morning", () => {
    const items = [
      item("sleep-before", "sleep", "2026-07-19T23:00:00Z", {
        label: "Fell asleep",
      }),
      item("wake", "wake", "2026-07-20T07:08:00Z", {
        label: "Woke up",
      }),
      item("pee", "pee", "2026-07-20T07:14:00Z", { label: "Pee" }),
      item("meal", "meal", "2026-07-20T07:32:00Z", { label: "Meal" }),
      item("training", "training", "2026-07-20T08:05:00Z", {
        detail: "Sit, Stay",
        label: "Training",
      }),
      item("walk", "walk", "2026-07-20T11:16:00Z", {
        endedAt: Date.parse("2026-07-20T11:58:00Z"),
        label: "Walk",
      }),
      item("water", "water", "2026-07-20T12:08:00Z", {
        label: "Drank water",
      }),
    ];
    const { container } = renderOverview(items);

    expect(
      screen.getByRole("group", {
        name: "Activity overview from midnight to now",
      }),
    ).toBeVisible();
    expect(
      container.querySelector('[data-activity-kind="sleep"][title]'),
    ).toHaveAttribute("aria-label", expect.stringContaining("00:00–07:08"));
    expect(
      container.querySelector('[data-activity-kind="walk"][title]'),
    ).toHaveAttribute("aria-label", expect.stringContaining("11:16–11:58"));
    expect(
      container.querySelector('[data-activity-kind="wake"]'),
    ).not.toBeInTheDocument();
    const cluster = screen.getByRole("button", {
      name: /Pee, Meal, Training/,
    });
    expect(cluster).toHaveAccessibleName(/Pee, Meal, Training/);
    expect(cluster).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(cluster);
    expect(cluster).toHaveAttribute("aria-expanded", "true");
    expect(within(cluster).getByRole("tooltip")).toHaveClass("opacity-100");
    fireEvent.pointerDown(document.body);
    expect(cluster).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(cluster);
    fireEvent.scroll(container.querySelector("[data-day-scroll]")!);
    expect(cluster).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("[data-now-marker]"))?.toHaveTextContent(
      "Now",
    );
    expect(container.querySelector("[data-day-future]")).toHaveStyle({
      left: "76.38888888888889%",
    });
    expect(container.querySelectorAll("[data-hour-guide]")).toHaveLength(23);
    expect(container.querySelectorAll("[data-hour-label]")).toHaveLength(13);
    expect(container.querySelector('[data-hour-label="6"]')).toHaveStyle({
      left: "25%",
    });
    expect(container.querySelector('[data-hour-label="18"]')).toHaveStyle({
      left: "75%",
    });
    expect(
      screen.getByText(/7h 8m rest · 42m walking · 6 activities/),
    ).toBeVisible();
  });

  it("uses a five-hour mobile canvas with four hours before now", () => {
    const items = [
      item("meal", "meal", "2026-07-20T07:32:00Z", { label: "Meal" }),
      item("training", "training", "2026-07-20T08:05:00Z", {
        label: "Training",
      }),
      item("water", "water", "2026-07-20T12:08:00Z", {
        label: "Drank water",
      }),
      item("play", "play", "2026-07-20T14:22:00Z", {
        label: "Enrichment",
      }),
    ];
    const view = renderOverview(items);
    const scroller =
      view.container.querySelector<HTMLElement>("[data-day-scroll]")!;
    const canvas = view.container.querySelector("[data-day-canvas]");

    expect(scroller).toHaveClass("overflow-x-auto");
    expect(canvas).toHaveClass("w-[480%]", "sm:w-full");
    expect(
      screen.getByText("Five-hour view · Tap a dot · Swipe to explore ↔"),
    ).toBeVisible();
    expect(
      screen.getByRole("region", {
        name: "Scrollable 24-hour activity overview",
      }),
    ).toHaveAttribute("tabindex", "0");

    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 1_440 },
    });
    const laterNow = now + 60_000;
    view.rerender(
      <MemoryRouter>
        <DayOverview
          items={items}
          startAt={startAt}
          endAt={endAt}
          now={laterNow}
          timezone="UTC"
        />
      </MemoryRouter>,
    );
    expect(scroller.scrollLeft).toBeCloseTo(
      ((laterNow - startAt) / (endAt - startAt)) * 1_440 - 240,
    );
  });

  it("renders the localized Slovak overview vocabulary", async () => {
    await setLocale("sk");
    renderOverview([
      item("meal", "meal", "2026-07-20T07:32:00Z", { label: "Jedlo" }),
    ]);

    expect(
      screen.getByRole("heading", { name: "Doterajší priebeh dňa" }),
    ).toBeVisible();
    expect(screen.getByText("Spánok a zdriemnutia")).toBeVisible();
    expect(screen.getAllByText(/1 aktivita/)).toHaveLength(2);
  });
});
