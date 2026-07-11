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
import AgendaPage from "./AgendaPage";

const convex = vi.hoisted(() => ({
  addGoal: vi.fn(),
  days: {} as Record<string, unknown>,
  queryCalls: [] as Array<{ args: unknown; name: string }>,
  removeGoal: vi.fn(),
  setDiary: vi.fn(),
  setGoalDone: vi.fn(),
  setRating: vi.fn(),
  setWin: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => {
    const name = getFunctionName(reference as never).split(":")[1];
    return convex[name as keyof typeof convex];
  },
  useQuery: (reference: unknown, args: unknown) => {
    const name = getFunctionName(reference as never);
    convex.queryCalls.push({ name, args });
    if (args === "skip") return undefined;
    return convex.days[(args as { date: string }).date];
  },
}));

const dogId = "dog-id" as Id<"dogs">;
const dog = {
  _id: dogId,
  birthday: "2024-01-15",
  name: "Milo",
  timezone: "UTC",
};
const today = "2026-07-10";
const yesterday = "2026-07-09";
const goal = (id: number, text: string, done = false) => ({ id, text, done });
const day = (date: string, overrides: Record<string, unknown> = {}) => ({
  _id: `${date}-id`,
  _creationTime: 1,
  dogId,
  date,
  nextGoalId: 3,
  enrichmentGoals: [],
  trainingGoals: [],
  ...overrides,
});
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/agenda"]}>
      <AgendaPage dog={dog} />
    </MemoryRouter>,
  );

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await setLocale("en");
});

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:00:00.000Z"));
  convex.addGoal.mockReset();
  convex.addGoal.mockResolvedValue(1);
  convex.days = { [today]: null, [yesterday]: null };
  convex.queryCalls = [];
  convex.removeGoal.mockReset();
  convex.removeGoal.mockResolvedValue(null);
  convex.setDiary.mockReset();
  convex.setDiary.mockResolvedValue(null);
  convex.setGoalDone.mockReset();
  convex.setGoalDone.mockResolvedValue(null);
  convex.setRating.mockReset();
  convex.setRating.mockResolvedValue(null);
  convex.setWin.mockReset();
  convex.setWin.mockResolvedValue(null);
});

describe("AgendaPage", () => {
  it("uses the shared application shell and compact product heading", () => {
    renderPage();

    const skipLink = screen.getByRole("link", {
      name: "Skip to main content",
    });
    const mains = screen.getAllByRole("main");
    const headings = screen.getAllByRole("heading", { level: 1 });

    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute("id", "main-content");
    expect(headings).toHaveLength(1);
    expect(headings[0].className).not.toContain("font-display");
    expect(headings[0].className).not.toContain("clamp");
  });

  it("renders Slovak copy, ARIA labels, validation, and dates", async () => {
    await setLocale("sk");
    convex.days[today] = day(today, {
      enrichmentGoals: [goal(7, "Garden sniff")],
    });

    renderPage();

    expect(screen.getByRole("heading", { name: "Dnešný plán" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Denný plán na dnes" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Nový cieľ obohatenia")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Odstrániť cieľ Garden sniff" }),
    ).toBeVisible();
    expect(screen.getByText("Garden sniff")).toBeVisible();
    expect(screen.getAllByText("10. 7. 2026").length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Pridať cieľ obohatenia" }),
    );
    expect(screen.getByText("Stručne opíšte tento cieľ.")).toBeVisible();
  });

  it("labels each goal area and associates its input with its counter", () => {
    renderPage();

    const enrichment = screen.getByRole("region", {
      name: "Enrichment goals",
    });
    const training = screen.getByRole("region", { name: "Training goals" });
    const enrichmentInput = within(enrichment).getByLabelText(
      "New enrichment goal",
    );
    const trainingInput = within(training).getByLabelText("New training goal");

    expect(enrichmentInput).toHaveAttribute(
      "aria-describedby",
      "enrichment-goal-count",
    );
    expect(trainingInput).toHaveAttribute(
      "aria-describedby",
      "training-goal-count",
    );
    expect(
      within(enrichment).getByRole("button", {
        name: "Add enrichment goal",
      }),
    ).toBeVisible();
    expect(
      within(training).getByRole("button", { name: "Add training goal" }),
    ).toBeVisible();
  });

  it("keeps reflection forms distinctly named and fields described", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Reflection", level: 3 }),
    ).toBeVisible();
    expect(screen.getByRole("form", { name: "Save win" })).toBeVisible();
    expect(screen.getByRole("form", { name: "Save rating" })).toBeVisible();
    expect(screen.getByRole("form", { name: "Save diary" })).toBeVisible();
    expect(screen.getByLabelText("Today’s win")).toHaveAttribute(
      "aria-describedby",
      "agenda-win-count",
    );
    expect(screen.getByLabelText("Day rating")).toHaveAttribute(
      "aria-describedby",
      "agenda-rating-help",
    );
    expect(screen.getByLabelText("Agenda diary")).toHaveAttribute(
      "aria-describedby",
      "agenda-diary-count",
    );
  });

  it("queries today and yesterday exactly and rolls drafts at dog midnight", () => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-10T23:59:45.000Z");
    convex.days["2026-07-11"] = null;
    const { rerender } = renderPage();

    expect(convex.queryCalls).toEqual([
      { name: "agenda:get", args: { dogId, date: today } },
      { name: "agenda:get", args: { dogId, date: yesterday } },
    ]);
    fireEvent.change(screen.getByLabelText("New enrichment goal"), {
      target: { value: "Sniff the garden" },
    });

    act(() => vi.advanceTimersByTime(30_000));
    rerender(
      <MemoryRouter initialEntries={["/agenda"]}>
        <AgendaPage dog={dog} />
      </MemoryRouter>,
    );

    expect(convex.queryCalls).toEqual(
      expect.arrayContaining([
        { name: "agenda:get", args: { dogId, date: "2026-07-11" } },
        { name: "agenda:get", args: { dogId, date: today } },
      ]),
    );
    expect(screen.getByLabelText("New enrichment goal")).toHaveValue("");
  });

  it("shows explicit invalid-zone, loading, and empty states", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <AgendaPage dog={{ ...dog, timezone: "Mars/Olympus" }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "couldn't read Milo's timezone",
    );

    convex.days = {};
    rerender(
      <MemoryRouter initialEntries={["/agenda"]}>
        <AgendaPage dog={dog} />
      </MemoryRouter>,
    );
    const todayRegion = screen.getByRole("region", {
      name: "Today’s agenda",
    });
    const yesterdayRegion = screen.getByRole("region", {
      name: "Yesterday’s agenda",
    });
    expect(screen.getByText("Opening today’s agenda…")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByText("Opening yesterday’s notes…")).toHaveAttribute(
      "role",
      "status",
    );
    expect(within(todayRegion).getAllByRole("status")).toHaveLength(1);
    expect(within(yesterdayRegion).getAllByRole("status")).toHaveLength(1);
    expect(todayRegion.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(
      yesterdayRegion.querySelector('[aria-hidden="true"]'),
    ).not.toBeNull();

    convex.days = { [today]: null, [yesterday]: null };
    rerender(
      <MemoryRouter initialEntries={["/agenda"]}>
        <AgendaPage dog={dog} />
      </MemoryRouter>,
    );
    const emptyGoalGuidance = screen.getAllByText(
      "No goals yet. Add one below to plan a focused activity for today.",
    );
    expect(emptyGoalGuidance).toHaveLength(2);
    emptyGoalGuidance.forEach((guidance) => {
      expect(guidance).not.toHaveClass("border");
      expect(guidance).not.toHaveClass("border-dashed");
      expect(guidance).not.toHaveClass("rounded-xl");
    });
    expect(screen.getByText("Nothing was recorded yesterday.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("adds normalized enrichment and training goals with validation and cap", async () => {
    renderPage();
    const enrichment = screen.getByLabelText("New enrichment goal");
    fireEvent.change(enrichment, { target: { value: "  Garden sniff  " } });
    fireEvent.click(
      screen.getByRole("button", { name: "Add enrichment goal" }),
    );
    await waitFor(() =>
      expect(convex.addGoal).toHaveBeenCalledWith({
        dogId,
        date: today,
        category: "enrichment",
        text: "Garden sniff",
      }),
    );
    expect(enrichment).toHaveValue("");

    fireEvent.change(screen.getByLabelText("New training goal"), {
      target: { value: "Settle on mat" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add training goal" }));
    await waitFor(() =>
      expect(convex.addGoal).toHaveBeenLastCalledWith({
        dogId,
        date: today,
        category: "training",
        text: "Settle on mat",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add enrichment goal" }),
    );
    expect(enrichment).toHaveFocus();
    expect(
      screen.getByText("Give this goal a short description."),
    ).toBeVisible();
    fireEvent.change(enrichment, { target: { value: "x".repeat(161) } });
    fireEvent.click(
      screen.getByRole("button", { name: "Add enrichment goal" }),
    );
    expect(screen.getByText("Use 160 characters or fewer.")).toBeVisible();

    convex.addGoal.mockRejectedValueOnce(new Error("AGENDA_GOAL_LIMIT"));
    fireEvent.change(enrichment, { target: { value: "One more" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Add enrichment goal" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "20 enrichment goals",
    );
    expect(enrichment).toHaveFocus();
  });

  it("disables adding when a category already has twenty goals", () => {
    convex.days[today] = day(today, {
      enrichmentGoals: Array.from({ length: 20 }, (_, index) =>
        goal(index + 1, `Goal ${index + 1}`),
      ),
    });
    renderPage();
    expect(screen.getByLabelText("New enrichment goal")).toBeDisabled();
    expect(screen.getByText("Daily limit reached · 20/20")).toBeVisible();
  });

  it("toggles and removes exact stable goals and maps remote removal", async () => {
    convex.days[today] = day(today, {
      enrichmentGoals: [goal(7, "Find treats")],
    });
    renderPage();
    const checkbox = screen.getByRole("checkbox", { name: "Find treats" });
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(convex.setGoalDone).toHaveBeenCalledWith({
        dogId,
        date: today,
        category: "enrichment",
        goalId: 7,
        done: true,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Find treats" }));
    await waitFor(() =>
      expect(convex.removeGoal).toHaveBeenCalledWith({
        dogId,
        date: today,
        category: "enrichment",
        goalId: 7,
      }),
    );

    convex.setGoalDone.mockRejectedValueOnce(
      new Error("AGENDA_GOAL_NOT_FOUND"),
    );
    fireEvent.click(checkbox);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "changed on another device",
    );
  });

  it("uses one synchronous lock across duplicate and mixed mutations", async () => {
    let finish!: () => void;
    convex.addGoal.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(1);
        }),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText("New enrichment goal"), {
      target: { value: "Sniff" },
    });
    const add = screen.getByRole("button", { name: "Add enrichment goal" });
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.change(screen.getByLabelText("Day rating"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rating" }));

    expect(convex.addGoal).toHaveBeenCalledTimes(1);
    expect(convex.setRating).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Today’s agenda" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("New training goal")).toBeDisabled();
    await act(async () => finish());
    await waitFor(() => expect(add).toBeEnabled());
  });

  it("follows reactive reflection values while pristine and preserves touched drafts", () => {
    convex.days[today] = day(today, {
      win: "Calm greeting",
      rating: 3,
      diary: "A steady morning.",
    });
    const { rerender } = renderPage();
    expect(screen.getByLabelText("Today’s win")).toHaveValue("Calm greeting");
    expect(screen.getByLabelText("Day rating")).toHaveValue(3);
    expect(screen.getByLabelText("Agenda diary")).toHaveValue(
      "A steady morning.",
    );

    convex.days[today] = day(today, {
      win: "Remote win",
      rating: 4,
      diary: "Remote diary.",
    });
    rerender(
      <MemoryRouter initialEntries={["/agenda"]}>
        <AgendaPage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Today’s win")).toHaveValue("Remote win");
    fireEvent.change(screen.getByLabelText("Today’s win"), {
      target: { value: "Local draft" },
    });
    convex.days[today] = day(today, { win: "Another remote win", rating: 5 });
    rerender(
      <MemoryRouter initialEntries={["/agenda"]}>
        <AgendaPage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Today’s win")).toHaveValue("Local draft");
    expect(screen.getByLabelText("Day rating")).toHaveValue(5);
  });

  it("sets and clears reflection fields with bounds and preserved failures", async () => {
    convex.setWin.mockRejectedValueOnce(new Error("network"));
    renderPage();
    const win = screen.getByLabelText("Today’s win");
    fireEvent.change(win, { target: { value: "  Brave at the gate  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save win" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn't save today’s win",
    );
    expect(win).toHaveValue("  Brave at the gate  ");

    fireEvent.click(screen.getByRole("button", { name: "Save win" }));
    await waitFor(() =>
      expect(convex.setWin).toHaveBeenLastCalledWith({
        dogId,
        date: today,
        win: "Brave at the gate",
      }),
    );
    fireEvent.change(win, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save win" }));
    await waitFor(() =>
      expect(convex.setWin).toHaveBeenLastCalledWith({
        dogId,
        date: today,
        win: null,
      }),
    );

    const rating = screen.getByLabelText("Day rating");
    fireEvent.change(rating, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rating" }));
    expect(
      screen.getByText("Choose a whole-number rating from 1 to 5."),
    ).toBeVisible();
    expect(rating).toHaveFocus();
    fireEvent.change(rating, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rating" }));
    await waitFor(() =>
      expect(convex.setRating).toHaveBeenCalledWith({
        dogId,
        date: today,
        rating: 5,
      }),
    );
    fireEvent.change(rating, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rating" }));
    await waitFor(() =>
      expect(convex.setRating).toHaveBeenLastCalledWith({
        dogId,
        date: today,
        rating: null,
      }),
    );

    const diary = screen.getByLabelText("Agenda diary");
    fireEvent.change(diary, { target: { value: "x".repeat(4_001) } });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));
    expect(screen.getByText("Use 4,000 characters or fewer.")).toBeVisible();
    expect(diary).toHaveFocus();
    fireEvent.change(diary, { target: { value: "  Good recovery.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));
    await waitFor(() =>
      expect(convex.setDiary).toHaveBeenCalledWith({
        dogId,
        date: today,
        diary: "Good recovery.",
      }),
    );
  });

  it("renders yesterday as complete read-only history", () => {
    convex.days[yesterday] = day(yesterday, {
      enrichmentGoals: [goal(1, "Snuffle mat", true)],
      trainingGoals: [goal(2, "Recall", false)],
      win: "Quiet cafe visit",
      rating: 4,
      diary: "Settled under the table.",
    });
    renderPage();
    const history = screen.getByRole("region", { name: "Yesterday’s agenda" });
    const completeGoal = within(history).getByText("Snuffle mat");
    const completeRow = completeGoal.closest("li");
    const openGoal = within(history).getByText("Recall");
    const openRow = openGoal.closest("li");

    expect(completeGoal).toBeVisible();
    expect(completeRow).not.toBeNull();
    expect(
      completeRow?.querySelector('[aria-hidden="true"]'),
    ).toHaveTextContent("✅");
    expect(within(completeRow!).getByText("Complete")).toHaveClass("sr-only");
    expect(openRow).not.toBeNull();
    expect(openRow?.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "⭕",
    );
    expect(within(openRow!).getByText("Open")).toHaveClass("sr-only");
    expect(within(history).getByText("Quiet cafe visit")).toBeVisible();
    expect(within(history).getByText("4/5")).toBeVisible();
    expect(within(history).getByText("Settled under the table.")).toBeVisible();
    expect(within(history).queryByRole("button")).toBeNull();
    expect(within(history).queryByRole("checkbox")).toBeNull();
    expect(within(history).queryByRole("form")).toBeNull();
  });

  it("wraps backend-maximum unbroken yesterday history", () => {
    const goalText = "g".repeat(160);
    const win = "w".repeat(500);
    const diary = "d".repeat(4_000);
    convex.days[yesterday] = day(yesterday, {
      enrichmentGoals: [goal(1, goalText, true)],
      win,
      diary,
    });
    renderPage();
    const history = screen.getByRole("region", { name: "Yesterday’s agenda" });

    expect(history).toHaveClass("min-w-0");
    expect(within(history).getByText(goalText)).toBeVisible();
    expect(within(history).getByText(goalText)).toHaveClass(
      "min-w-0",
      "[overflow-wrap:anywhere]",
    );
    expect(within(history).getByText(win)).toBeVisible();
    expect(within(history).getByText(win)).toHaveClass(
      "min-w-0",
      "break-words",
    );
    expect(within(history).getByText(diary)).toBeVisible();
    expect(within(history).getByText(diary)).toHaveClass(
      "min-w-0",
      "break-words",
    );
    expect(within(history).queryByRole("button")).toBeNull();
    expect(within(history).queryByRole("checkbox")).toBeNull();
    expect(within(history).queryByRole("form")).toBeNull();
  });

  it("wraps long current data and Slovak agenda actions", async () => {
    await setLocale("sk");
    const dogName = "P".repeat(64);
    const goalText = "g".repeat(160);
    convex.days[today] = day(today, {
      enrichmentGoals: [goal(1, goalText)],
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <AgendaPage dog={{ ...dog, name: dogName }} />
      </MemoryRouter>,
    );

    const description = screen.getByText(
      (_, element) =>
        element?.tagName === "P" &&
        Boolean(element.textContent?.includes(dogName)) &&
        Boolean(element.textContent?.includes("Naplánujte a zaznamenajte")),
    );
    const currentGoal = screen.getByText(goalText);
    const addButton = screen.getByRole("button", {
      name: "Pridať cieľ obohatenia",
    });

    expect(description).toHaveClass("min-w-0", "[overflow-wrap:anywhere]");
    expect(currentGoal.closest("li")).toHaveClass("min-w-0");
    expect(currentGoal).toHaveClass("min-w-0", "[overflow-wrap:anywhere]");
    expect(addButton).toHaveClass("min-h-11", "whitespace-normal");
  });

  it("maps read-only backend races and exposes status accessibly", async () => {
    convex.setWin.mockRejectedValueOnce(new Error("AGENDA_READ_ONLY"));
    renderPage();
    fireEvent.change(screen.getByLabelText("Today’s win"), {
      target: { value: "Late save" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save win" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This agenda day is now read-only",
    );

    fireEvent.change(screen.getByLabelText("New training goal"), {
      target: { value: "Recall" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add training goal" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Training goal added",
    );
  });
});
