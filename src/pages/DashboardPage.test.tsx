import {
  act,
  cleanup,
  fireEvent,
  render as testingLibraryRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { setLocale } from "@/i18n";
import DashboardPage from "./DashboardPage";

const convex = vi.hoisted(() => ({
  activeWalk: null as unknown,
  activityTypes: [] as unknown[] | undefined,
  agenda: null as unknown,
  diaryUpdate: vi.fn(),
  latest: {
    meal: null,
    pee: null,
    poop: null,
    sleep: null,
    treat: null,
    wake: null,
    walk: null,
  } as Record<string, unknown> | undefined,
  log: vi.fn(),
  pottyLog: vi.fn(),
  queryCalls: [] as Array<{ name: string; args: unknown }>,
  recent: [] as unknown[] | undefined,
  remove: vi.fn(),
  routines: [] as unknown[] | undefined,
  trainingCommands: [] as unknown[] | undefined,
  trainingLog: vi.fn(),
  update: vi.fn(),
  walkEnd: vi.fn(),
  walkStart: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "events:logQuick") return convex.log;
    if (name === "walks:logPotty") return convex.pottyLog;
    if (name === "walks:updateDiary") return convex.diaryUpdate;
    if (name === "walks:start") return convex.walkStart;
    if (name === "walks:end") return convex.walkEnd;
    if (name === "training:logSessions") return convex.trainingLog;
    return name === "events:update" ? convex.update : convex.remove;
  },
  useQuery: (reference: unknown, args: unknown) => {
    const name = getFunctionName(reference as never);
    convex.queryCalls.push({ name, args });
    if (name === "events:listRecent") return convex.recent;
    if (name === "activityTypes:list") return convex.activityTypes;
    if (name === "agenda:get") return convex.agenda;
    if (name === "events:latestByKind") return convex.latest;
    if (name === "walks:active") return convex.activeWalk;
    if (name === "training:list") return convex.trainingCommands;
    return convex.routines;
  },
}));

const dogId = "dog-id" as Id<"dogs">;
const tugId = "tug-id" as Id<"activityTypes">;
const archivedTypeId = "archived-type-id" as Id<"activityTypes">;
const dog = {
  _id: dogId,
  birthday: "2024-01-15",
  name: "Milo",
  timezone: "UTC",
};
const render = (ui: ReactNode) =>
  testingLibraryRender(ui, { wrapper: MemoryRouter });
const getSummaryItem = (label: string) =>
  screen.getByText(label, { selector: "dt" }).parentElement!;
const mealEvent = (overrides: Record<string, unknown> = {}) => ({
  _creationTime: Date.parse("2026-07-09T07:30:00Z"),
  _id: "meal-id",
  amount: 120,
  at: Date.parse("2026-07-09T07:30:00Z"),
  dogId,
  kind: "meal",
  note: "Ate everything",
  userId: "user-id",
  ...overrides,
});
const playEvent = (overrides: Record<string, unknown> = {}) => ({
  _creationTime: Date.parse("2026-07-09T08:00:00Z"),
  _id: "play-id",
  activityTypeId: tugId,
  at: Date.parse("2026-07-09T08:00:00Z"),
  dogId,
  kind: "play",
  userId: "user-id",
  ...overrides,
});
const activityType = (overrides: Record<string, unknown> = {}) => ({
  _creationTime: 1,
  _id: tugId,
  dogId,
  emoji: "🪢",
  isArchived: false,
  name: "Tug",
  ...overrides,
});
const walkEvent = (overrides: Record<string, unknown> = {}) => ({
  _creationTime: Date.parse("2026-07-09T09:00:00Z"),
  _id: "walk-id",
  at: Date.parse("2026-07-09T09:00:00Z"),
  dogId,
  kind: "walk",
  userId: "user-id",
  ...overrides,
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await setLocale("en");
});

beforeEach(() => {
  convex.activeWalk = null;
  convex.activityTypes = [];
  convex.agenda = null;
  convex.diaryUpdate.mockReset();
  convex.diaryUpdate.mockResolvedValue(null);
  convex.latest = {
    meal: null,
    pee: null,
    poop: null,
    sleep: null,
    treat: null,
    wake: null,
    walk: null,
  };
  convex.log.mockReset();
  convex.log.mockResolvedValue("event-id");
  convex.pottyLog.mockReset();
  convex.pottyLog.mockResolvedValue("potty-id");
  convex.queryCalls = [];
  convex.recent = [];
  convex.remove.mockReset();
  convex.remove.mockResolvedValue(null);
  convex.routines = [];
  convex.trainingCommands = [];
  convex.trainingLog.mockReset();
  convex.trainingLog.mockResolvedValue(["session-id"]);
  convex.update.mockReset();
  convex.update.mockResolvedValue(null);
  convex.walkEnd.mockReset();
  convex.walkEnd.mockResolvedValue(Date.now());
  convex.walkStart.mockReset();
  convex.walkStart.mockResolvedValue("walk-id");
});

describe("DashboardPage quick logging", () => {
  it("logs selected training commands with a quick assessment", async () => {
    vi.spyOn(Date, "now").mockReturnValue(123_456);
    convex.trainingCommands = [
      { _id: "sit-id", name: "Sit" },
      { _id: "stay-id", name: "Stay" },
    ];
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
    render(<DashboardPage dog={dog} />);

    fireEvent.click(screen.getByRole("button", { name: "Log training" }));
    const dialog = screen.getByRole("dialog", { name: "Log training" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sit" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Stay" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Thumbs up" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save training" }),
    );

    await waitFor(() =>
      expect(convex.trainingLog).toHaveBeenCalledWith({
        dogId,
        commandIds: ["sit-id", "stay-id"],
        at: 123_456,
        rating: 5,
      }),
    );
    expect(dialog).not.toHaveAttribute("open");
  });

  it("links to training setup when there are no active commands", () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log training" }));
    expect(
      screen.getByRole("link", { name: "Set up training commands" }),
    ).toHaveAttribute("href", "/training");
  });

  it("connects every quick action to its state description", () => {
    render(<DashboardPage dog={dog} />);
    const quickLog = screen
      .getByRole("heading", { level: 2, name: "Log an activity" })
      .closest("section")!;
    const actionGroup = within(quickLog).getByRole("group", {
      name: "Log an activity",
    });

    ["Pee", "Poop", "Meal", "Treat", "Woke up", "Fell asleep"].forEach(
      (label) => {
        const button = within(actionGroup).getByRole("button", {
          name: `Log ${label}`,
        });
        const descriptionId = button.getAttribute("aria-describedby");

        expect(descriptionId).toBeTruthy();
        expect(quickLog.querySelector(`[id="${descriptionId}"]`)).toBeVisible();
      },
    );
  });

  it("renders Slovak copy, ARIA labels, durations, and amounts", async () => {
    await setLocale("sk");
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-09T12:00:00Z"));
    convex.latest = {
      meal: mealEvent({ at: Date.parse("2026-07-09T09:47:00Z") }),
      pee: null,
      poop: null,
      sleep: null,
      treat: null,
      wake: null,
      walk: null,
    };
    convex.recent = [mealEvent({ amount: 1_234.5 })];

    render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));

    expect(
      screen.getByRole("heading", { level: 1, name: "Ahoj, Milo." }),
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Zaznamenať udalosť Cikanie" }),
    ).toBeVisible();
    expect(
      within(getSummaryItem("Od posledného jedla")).getByText("2 h 13 min"),
    ).toBeVisible();
    expect(screen.getByText("Ate everything")).toBeVisible();
    expect(screen.getByText(/Množstvo:/)).toHaveTextContent(
      "Množstvo: 1 234,5",
    );
  });

  it.each([
    ["Pee", "pee"],
    ["Poop", "poop"],
    ["Meal", "meal"],
    ["Treat", "treat"],
    ["Woke up", "wake"],
    ["Fell asleep", "sleep"],
  ] as const)(
    "logs %s with dog attribution and the current time",
    async (label, kind) => {
      vi.spyOn(Date, "now").mockReturnValue(123_456);
      render(<DashboardPage dog={dog} />);

      fireEvent.click(screen.getByRole("button", { name: `Log ${label}` }));

      await waitFor(() =>
        expect(convex.log).toHaveBeenCalledWith({
          at: 123_456,
          dogId,
          kind,
          ...(kind === "pee" ? { peePlace: "outside" } : {}),
        }),
      );
      expect(convex.queryCalls).toEqual(
        expect.arrayContaining([
          { name: "events:listRecent", args: { dogId, limit: 8 } },
          {
            name: "activityTypes:list",
            args: { dogId, includeArchived: true, limit: 100 },
          },
          { name: "events:latestByKind", args: { dogId } },
          { name: "walks:active", args: { dogId } },
          { name: "routines:list", args: { dogId } },
        ]),
      );
    },
  );

  it("logs quick activities at a selected earlier time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    render(<DashboardPage dog={dog} />);

    fireEvent.click(screen.getByRole("button", { name: "Earlier" }));
    fireEvent.click(screen.getByRole("button", { name: "30 min ago" }));
    fireEvent.click(screen.getByRole("button", { name: "Log Meal" }));

    await waitFor(() =>
      expect(convex.log).toHaveBeenCalledWith({
        at: Date.parse("2026-07-09T11:30:00Z"),
        dogId,
        kind: "meal",
      }),
    );
    expect(screen.getByText("Activity time · 11:30 AM")).toBeVisible();
  });

  it("uses the selected earlier time for training logs", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.trainingCommands = [{ _id: "sit-id", name: "Sit" }];
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
    render(<DashboardPage dog={dog} />);

    fireEvent.click(screen.getByRole("button", { name: "Earlier" }));
    fireEvent.click(screen.getByRole("button", { name: "Log training" }));
    const dialog = screen.getByRole("dialog", { name: "Log training" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sit" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Neutral" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save training" }),
    );

    await waitFor(() =>
      expect(convex.trainingLog).toHaveBeenCalledWith({
        at: Date.parse("2026-07-09T11:45:00Z"),
        commandIds: ["sit-id"],
        dogId,
        rating: 3,
      }),
    );
  });

  it("locks all quick actions and prevents duplicate submissions", async () => {
    let finish!: () => void;
    convex.log.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("event-id");
        }),
    );
    render(<DashboardPage dog={dog} />);
    const meal = screen.getByRole("button", { name: "Log Meal" });

    fireEvent.click(meal);
    fireEvent.click(meal);

    expect(
      await screen.findByRole("button", { name: "Log Meal" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start walk" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Log with details" }),
    ).toBeDisabled();
    expect(convex.log).toHaveBeenCalledTimes(1);

    finish();
    await screen.findByRole("status");
  });

  it("shows a clear error and unlocks actions after failure", async () => {
    convex.log.mockRejectedValue(new Error("network"));
    render(<DashboardPage dog={dog} />);

    fireEvent.click(screen.getByRole("button", { name: "Log Poop" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't log “Poop”. Try again.",
    );
    expect(screen.getByRole("button", { name: "Log Poop" })).toBeEnabled();
  });

  it("undoes the most recently created event", async () => {
    convex.log.mockResolvedValue("new-event-id");
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Pee" }));
    await screen.findByText("Pee logged for Milo.");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(convex.remove).toHaveBeenCalledWith({
        dogId,
        eventId: "new-event-id",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Last log removed.",
    );
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
  });

  it("locks every logging control and ignores duplicate undo clicks", async () => {
    let finish!: () => void;
    convex.remove.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(null);
        }),
    );
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Pee" }));
    await screen.findByText("Pee logged for Milo.");

    const undo = screen.getByRole("button", { name: "Undo" });
    fireEvent.click(undo);
    fireEvent.click(undo);

    expect(
      await screen.findByRole("button", { name: "Undoing…" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Log with details" }),
    ).toBeDisabled();
    expect(convex.remove).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Last log removed.",
    );
  });

  it("locks undo while a later quick log is pending", async () => {
    let finish!: () => void;
    convex.log.mockResolvedValueOnce("first-id").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("second-id");
        }),
    );
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Pee" }));
    await screen.findByText("Pee logged for Milo.");

    fireEvent.click(screen.getByRole("button", { name: "Log Meal" }));

    expect(await screen.findByRole("button", { name: "Undo" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Log with details" }),
    ).toBeDisabled();
    finish();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(convex.remove).toHaveBeenCalledWith({
        dogId,
        eventId: "second-id",
      }),
    );
  });
});

describe("DashboardPage sleep controls", () => {
  it("disables rest actions while their latest state is loading", () => {
    convex.latest = undefined;
    render(<DashboardPage dog={dog} />);

    const wake = screen.getByRole("button", { name: "Log Woke up" });
    const sleep = screen.getByRole("button", { name: "Log Fell asleep" });
    expect(wake).toBeDisabled();
    expect(sleep).toBeDisabled();
    expect(wake).toHaveTextContent("Checking rest state");
    expect(sleep).toHaveTextContent("Checking rest state");
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeEnabled();
  });

  it("enables either initial rest transition when no state exists", () => {
    render(<DashboardPage dog={dog} />);

    expect(screen.getByRole("button", { name: "Log Woke up" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Log Fell asleep" }),
    ).toBeEnabled();
  });

  it.each([
    ["awake", { at: 200 }, { at: 100 }, true, false],
    ["asleep", { at: 100 }, { at: 200 }, false, true],
  ] as const)(
    "only enables the next transition while %s",
    (_, wakeEvent, sleepEvent, wakeDisabled, sleepDisabled) => {
      convex.latest = {
        meal: null,
        pee: null,
        poop: null,
        sleep: sleepEvent,
        treat: null,
        wake: wakeEvent,
      };
      render(<DashboardPage dog={dog} />);

      expect(
        screen.getByRole("button", { name: "Log Woke up" }),
      ).toHaveProperty("disabled", wakeDisabled);
      expect(
        screen.getByRole("button", { name: "Log Fell asleep" }),
      ).toHaveProperty("disabled", sleepDisabled);
    },
  );

  it("submits the valid transition once and shares the pending lock", async () => {
    let finish!: () => void;
    vi.spyOn(Date, "now").mockReturnValue(321_000);
    convex.latest!.wake = { at: 200 };
    convex.log.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("sleep-id");
        }),
    );
    render(<DashboardPage dog={dog} />);
    const sleep = screen.getByRole("button", { name: "Log Fell asleep" });

    fireEvent.click(sleep);
    fireEvent.click(sleep);

    await waitFor(() =>
      expect(convex.log).toHaveBeenCalledWith({
        at: 321_000,
        dogId,
        kind: "sleep",
      }),
    );
    expect(convex.log).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Log Woke up" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Log Fell asleep" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeDisabled();

    finish();
    await waitFor(() => expect(sleep).toBeEnabled());
  });

  it("maps a concurrent transition conflict and unlocks the next action", async () => {
    convex.latest!.wake = { at: 200 };
    convex.log.mockRejectedValue(new Error("INVALID_REST_TRANSITION"));
    render(<DashboardPage dog={dog} />);

    fireEvent.click(screen.getByRole("button", { name: "Log Fell asleep" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The sleep state changed on another device. Try again.",
    );
    expect(
      screen.getByRole("button", { name: "Log Fell asleep" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Log Woke up" })).toBeDisabled();
  });

  it("maps a backdated sequence conflict to the datetime field", async () => {
    convex.log.mockRejectedValue(new Error("INVALID_REST_TRANSITION"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "sleep" },
    });
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-08T22:30" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "Settled after dinner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    expect(
      await screen.findByText(
        "That time conflicts with the existing sleep sequence.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("When did it happen?")).toHaveValue(
      "2026-07-08T22:30",
    );
    expect(screen.getByLabelText(/^Note\b/)).toHaveValue(
      "Settled after dinner",
    );
    expect(screen.getByLabelText("When did it happen?")).toHaveAttribute(
      "aria-describedby",
      "backdate-timezone backdate-at-error",
    );
  });

  it("derives the timer from the latest transition without live ticking announcements", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-09T12:00:00Z");
    vi.setSystemTime(now);
    convex.latest!.wake = { at: now - 40 * 60_000 };
    const { rerender } = render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));
    const timer = getSummaryItem("Current rest state");

    expect(within(timer).getByText("40m")).toBeInTheDocument();
    expect(within(timer).getByText("Awake")).toBeInTheDocument();
    expect(timer).not.toHaveAttribute("aria-live");
    expect(timer.querySelector("[aria-live]")).toBeNull();

    convex.latest = {
      ...convex.latest!,
      sleep: { at: now - 10 * 60_000 },
    };
    rerender(<DashboardPage dog={dog} />);
    expect(within(timer).getByText("10m")).toBeInTheDocument();
    expect(within(timer).getByText("Asleep")).toBeInTheDocument();
  });
});

describe("DashboardPage walk controls", () => {
  it("shows truthful loading and empty states", async () => {
    convex.activeWalk = undefined;
    convex.latest = undefined;
    const { rerender } = render(<DashboardPage dog={dog} />);

    expect(
      screen.getByRole("button", { name: "Checking walk…" }),
    ).toBeDisabled();
    expect(
      within(screen.getByRole("region", { name: "Right now" })).getByRole(
        "status",
      ),
    ).toHaveTextContent("Syncing…");

    convex.activeWalk = null;
    convex.latest = {
      meal: null,
      pee: null,
      poop: null,
      sleep: null,
      treat: null,
      wake: null,
      walk: null,
    };
    rerender(<DashboardPage dog={dog} />);
    expect(screen.getByRole("button", { name: "Start walk" })).toBeEnabled();
    expect(
      await within(getSummaryItem("Since last walk")).findByText("No walk yet"),
    ).toBeInTheDocument();
  });

  it("starts once, shares the pending lock, and clears an older undo", async () => {
    let finish!: () => void;
    vi.spyOn(Date, "now").mockReturnValue(456_000);
    convex.walkStart.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("walk-id");
        }),
    );
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Pee" }));
    await screen.findByText("Pee logged for Milo.");
    const start = screen.getByRole("button", { name: "Start walk" });

    fireEvent.click(start);
    fireEvent.click(start);

    await waitFor(() =>
      expect(convex.walkStart).toHaveBeenCalledWith({
        at: 456_000,
        dogId,
      }),
    );
    expect(convex.walkStart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Log with details" }),
    ).toBeDisabled();

    finish();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Walk started for Milo.",
    );
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("maps a concurrent start and unlocks after failure", async () => {
    convex.walkStart.mockRejectedValue(new Error("WALK_ALREADY_ACTIVE"));
    render(<DashboardPage dog={dog} />);

    fireEvent.click(screen.getByRole("button", { name: "Start walk" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A walk was already started on another device. Syncing now.",
    );
    expect(screen.getByRole("button", { name: "Start walk" })).toBeEnabled();
  });

  it("defaults backdated start and end to the dog's local minute", () => {
    const now = Date.parse("2026-07-09T00:05:42Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const localDog = { ...dog, timezone: "Asia/Tokyo" };
    const { rerender } = render(<DashboardPage dog={localDog} />);

    fireEvent.click(screen.getByRole("button", { name: "Start another time" }));
    expect(screen.getByLabelText("Walk start time")).toHaveValue(
      "2026-07-09T09:05",
    );
    expect(screen.getByText("Timezone: Asia/Tokyo")).toBeInTheDocument();

    const walk = walkEvent({ at: now - 60 * 60_000 });
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    rerender(<DashboardPage dog={localDog} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose end time" }));
    expect(screen.getByLabelText("Walk end time")).toHaveValue(
      "2026-07-09T09:05",
    );
    expect(screen.getByText("Timezone: Asia/Tokyo")).toBeInTheDocument();
  });

  it("submits a dog-local backdated start and collapses after success", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    render(<DashboardPage dog={{ ...dog, timezone: "Asia/Tokyo" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Start another time" }));
    fireEvent.change(screen.getByLabelText("Walk start time"), {
      target: { value: "2026-07-09T09:15" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Start walk at this time" }),
    );

    await waitFor(() =>
      expect(convex.walkStart).toHaveBeenCalledWith({
        at: Date.parse("2026-07-09T00:15:00Z"),
        dogId,
      }),
    );
    expect(
      screen.queryByRole("form", { name: "Backdated walk start" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Walk started for Milo.",
    );
  });

  it("validates empty, birthday, and future walk start times", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Start another time" }));
    const at = screen.getByLabelText("Walk start time");
    const submit = screen.getByRole("button", {
      name: "Start walk at this time",
    });

    fireEvent.change(at, { target: { value: "" } });
    fireEvent.click(submit);
    expect(
      screen.getByText("Choose a valid date and time."),
    ).toBeInTheDocument();

    fireEvent.change(at, { target: { value: "2024-01-14T23:59" } });
    fireEvent.click(submit);
    expect(
      screen.getByText("Choose a date on or after 2024-01-15."),
    ).toBeInTheDocument();

    fireEvent.change(at, { target: { value: "2026-07-09T12:06" } });
    fireEvent.click(submit);
    expect(
      screen.getByText("Choose a time no more than 5 minutes in the future."),
    ).toBeInTheDocument();
    expect(at).toHaveAttribute(
      "aria-describedby",
      "walk-start-at-timezone walk-start-at-error",
    );
    expect(convex.walkStart).not.toHaveBeenCalled();
  });

  it("locks cross-operation clicks during a backdated start", async () => {
    let finish!: () => void;
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.walkStart.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("walk-id");
        }),
    );
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Start another time" }));
    const submit = screen.getByRole("button", {
      name: "Start walk at this time",
    });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(
      await screen.findByRole("button", { name: "Starting…" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Walk start time")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start walk" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Log with details" }),
    ).toBeDisabled();
    expect(convex.walkStart).toHaveBeenCalledTimes(1);
    expect(convex.log).not.toHaveBeenCalled();

    finish();
    await waitFor(() =>
      expect(
        screen.queryByRole("form", { name: "Backdated walk start" }),
      ).not.toBeInTheDocument(),
    );
  });

  it.each([
    [
      "INVALID_TIMESTAMP",
      "That date and time is outside the allowed range. Choose another time.",
    ],
    [
      "INVALID_WALK_INTERVAL",
      "That start time overlaps the most recent walk. Choose a later time.",
    ],
  ])(
    "maps %s to the start field and retains its value",
    async (code, message) => {
      convex.walkStart.mockRejectedValue(new Error(code));
      render(<DashboardPage dog={dog} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Start another time" }),
      );
      fireEvent.change(screen.getByLabelText("Walk start time"), {
        target: { value: "2026-07-08T20:15" },
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Start walk at this time" }),
      );

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByLabelText("Walk start time")).toHaveValue(
        "2026-07-08T20:15",
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("shows the dog-local start and advances the active duration", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-09T10:01:30Z");
    const walk = walkEvent({ at: now - 90_000 });
    vi.setSystemTime(now);
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));
    const active = screen.getByRole("region", { name: "Walk in progress" });

    expect(
      within(active).getByText(
        new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: dog.timezone,
        }).format(walk.at),
      ),
    ).toBeInTheDocument();
    expect(within(active).getByText("1m")).toBeInTheDocument();
    expect(
      within(getSummaryItem("Current walk")).getByText("1m"),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(30_000));
    expect(within(active).getByText("2m")).toBeInTheDocument();
    expect(
      within(getSummaryItem("Current walk")).getByText("2m"),
    ).toBeInTheDocument();
  });

  it("ends the exact walk once and uses the authoritative completion", async () => {
    let finish!: () => void;
    const at = Date.parse("2026-07-09T09:00:00Z");
    const requestedAt = at + 10 * 60_000;
    const completedAt = at + 5 * 60_000;
    const walk = walkEvent({ at });
    vi.spyOn(Date, "now").mockReturnValue(requestedAt);
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    convex.walkEnd.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(completedAt);
        }),
    );
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Pee" }));
    await screen.findByText("Pee logged for Milo.");
    const end = screen.getByRole("button", { name: "End walk" });

    fireEvent.click(end);
    fireEvent.click(end);

    await waitFor(() =>
      expect(convex.walkEnd).toHaveBeenCalledWith({
        dogId,
        endedAt: requestedAt,
        walkId: "walk-id",
      }),
    );
    expect(convex.walkEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Ending…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

    finish();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Walk ended after 5m.",
    );
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("submits a backdated end and uses the authoritative completion", async () => {
    const at = Date.parse("2026-07-09T00:00:00Z");
    const walk = walkEvent({ at });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T03:00:00Z"));
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    convex.walkEnd.mockResolvedValue(at + 60 * 60_000);
    render(<DashboardPage dog={{ ...dog, timezone: "Asia/Tokyo" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose end time" }));
    fireEvent.change(screen.getByLabelText("Walk end time"), {
      target: { value: "2026-07-09T10:30" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "End walk at this time" }),
    );

    await waitFor(() =>
      expect(convex.walkEnd).toHaveBeenCalledWith({
        dogId,
        endedAt: Date.parse("2026-07-09T01:30:00Z"),
        walkId: "walk-id",
      }),
    );
    expect(
      screen.queryByRole("form", { name: "Backdated walk end" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Walk ended after 1h.",
    );
  });

  it("validates an end before the walk start", () => {
    const at = Date.parse("2026-07-09T10:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    const walk = walkEvent({ at });
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose end time" }));
    fireEvent.change(screen.getByLabelText("Walk end time"), {
      target: { value: "2026-07-09T09:59" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "End walk at this time" }),
    );

    expect(
      screen.getByText("Choose an end time on or after the walk started."),
    ).toBeInTheDocument();
    expect(convex.walkEnd).not.toHaveBeenCalled();
  });

  it("maps a backend duration rejection and retains the end value", async () => {
    const at = Date.parse("2026-07-09T10:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    const walk = walkEvent({ at });
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    convex.walkEnd.mockRejectedValue(new Error("INVALID_WALK_DURATION"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose end time" }));
    fireEvent.change(screen.getByLabelText("Walk end time"), {
      target: { value: "2026-07-09T11:00" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "End walk at this time" }),
    );

    expect(
      await screen.findByText(
        "Choose an end time on or after the walk started.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Walk end time")).toHaveValue(
      "2026-07-09T11:00",
    );
  });

  it("retains an end value after an unclassified failure", async () => {
    const walk = walkEvent({ at: Date.parse("2026-07-09T10:00:00Z") });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    convex.walkEnd.mockRejectedValue(new Error("network"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose end time" }));
    fireEvent.change(screen.getByLabelText("Walk end time"), {
      target: { value: "2026-07-09T11:00" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "End walk at this time" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't end the walk. Try again.",
    );
    expect(screen.getByLabelText("Walk end time")).toHaveValue(
      "2026-07-09T11:00",
    );
    expect(
      screen.getByRole("button", { name: "End walk at this time" }),
    ).toBeEnabled();
  });

  it("measures a completed walk timer from endedAt", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-09T12:00:00Z");
    vi.setSystemTime(now);
    convex.latest!.walk = walkEvent({
      at: now - 2 * 60 * 60_000,
      endedAt: now - 30 * 60_000,
    });
    render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));

    expect(
      within(getSummaryItem("Since last walk")).getByText("30m"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Current walk")).not.toBeInTheDocument();
  });
});

describe("DashboardPage walk potty attachment", () => {
  it("disables quick potty actions while the active walk query loads", () => {
    convex.activeWalk = undefined;
    render(<DashboardPage dog={dog} />);

    const pee = screen.getByRole("button", { name: "Log Pee" });
    const poop = screen.getByRole("button", { name: "Log Poop" });
    expect(pee).toBeDisabled();
    expect(poop).toBeDisabled();
    expect(pee).toHaveTextContent("Checking walk…");
    expect(poop).toHaveTextContent("Checking walk…");
    expect(screen.getByRole("button", { name: "Log Meal" })).toBeEnabled();
  });

  it("routes active quick potty to the walk and keeps Undo deterministic", async () => {
    const at = Date.parse("2026-07-09T12:00:00Z");
    const walk = walkEvent({ at: at - 30 * 60_000 });
    vi.spyOn(Date, "now").mockReturnValue(at);
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    render(<DashboardPage dog={dog} />);
    const pee = screen.getByRole("button", { name: "Log Pee" });

    expect(pee).toHaveTextContent("During walk");
    expect(pee).toHaveAttribute("aria-describedby", "quick-state-pee");
    fireEvent.click(pee);

    await waitFor(() =>
      expect(convex.pottyLog).toHaveBeenCalledWith({
        at,
        dogId,
        kind: "pee",
        peePlace: "outside",
        walkId: "walk-id",
      }),
    );
    expect(convex.log).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(convex.remove).toHaveBeenCalledWith({
        dogId,
        eventId: "potty-id",
      }),
    );
  });

  it("keeps standalone potty and non-potty events on logQuick", async () => {
    vi.spyOn(Date, "now").mockReturnValue(123_000);
    const { rerender } = render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Pee" }));
    await waitFor(() =>
      expect(convex.log).toHaveBeenCalledWith({
        at: 123_000,
        dogId,
        kind: "pee",
        peePlace: "outside",
      }),
    );
    expect(convex.pottyLog).not.toHaveBeenCalled();

    convex.log.mockClear();
    const walk = walkEvent({ at: 100_000 });
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    rerender(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Meal" }));
    await waitFor(() =>
      expect(convex.log).toHaveBeenCalledWith({
        at: 123_000,
        dogId,
        kind: "meal",
      }),
    );
    expect(convex.pottyLog).not.toHaveBeenCalled();
  });

  it("logs an inside accident without attaching it to an active walk", async () => {
    convex.activeWalk = walkEvent();
    render(<DashboardPage dog={dog} />);

    fireEvent.click(screen.getByRole("button", { name: "Log pee · Inside" }));

    await waitFor(() =>
      expect(convex.log).toHaveBeenCalledWith({
        at: expect.any(Number),
        dogId,
        kind: "pee",
        peePlace: "inside",
      }),
    );
    expect(convex.pottyLog).not.toHaveBeenCalled();
  });

  it("shares the operation lock for active quick potty", async () => {
    let finish!: () => void;
    const walk = walkEvent();
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    convex.pottyLog.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("potty-id");
        }),
    );
    render(<DashboardPage dog={dog} />);
    const pee = screen.getByRole("button", { name: "Log Pee" });

    fireEvent.click(pee);
    fireEvent.click(pee);

    expect(
      await screen.findByRole("button", { name: "Log Pee" }),
    ).toBeDisabled();
    expect(pee).toHaveTextContent("During walk · Logging…");
    expect(screen.getByRole("button", { name: "End walk" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Log with details" }),
    ).toBeDisabled();
    expect(convex.pottyLog).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(pee).toBeEnabled());
  });

  it("attaches a checked backdated potty to the active walk", async () => {
    const walk = walkEvent({ at: Date.parse("2026-07-09T10:00:00Z") });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-09T11:00" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "  By the oak tree  " },
    });

    expect(screen.getByLabelText("Attach to active walk")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    await waitFor(() =>
      expect(convex.pottyLog).toHaveBeenCalledWith({
        at: Date.parse("2026-07-09T11:00:00Z"),
        dogId,
        kind: "pee",
        peePlace: "outside",
        note: "By the oak tree",
        walkId: "walk-id",
      }),
    );
    expect(convex.log).not.toHaveBeenCalled();
  });

  it("honors an unchecked attachment as a standalone event", async () => {
    const walk = walkEvent({ at: Date.parse("2026-07-09T10:00:00Z") });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-09T11:00" },
    });
    fireEvent.click(screen.getByLabelText("Attach to active walk"));
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    await waitFor(() =>
      expect(convex.log).toHaveBeenCalledWith({
        at: Date.parse("2026-07-09T11:00:00Z"),
        dogId,
        kind: "pee",
        peePlace: "outside",
      }),
    );
    expect(convex.pottyLog).not.toHaveBeenCalled();
  });

  it("disables and unchecks attachment before the walk start", async () => {
    const walk = walkEvent({ at: Date.parse("2026-07-09T10:00:00Z") });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-09T09:00" },
    });
    const attachment = screen.getByLabelText("Attach to active walk");

    expect(attachment).not.toBeChecked();
    expect(attachment).toBeDisabled();
    expect(
      screen.getByText(
        "This time is before the active walk started, so it will be saved as a standalone log.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    await waitFor(() =>
      expect(convex.log).toHaveBeenCalledWith({
        at: Date.parse("2026-07-09T09:00:00Z"),
        dogId,
        kind: "pee",
        peePlace: "outside",
      }),
    );
    expect(convex.pottyLog).not.toHaveBeenCalled();
  });

  it("retains a checked backdated log after an end/log race", async () => {
    const walk = walkEvent({ at: Date.parse("2026-07-09T10:00:00Z") });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    convex.pottyLog.mockRejectedValue(new Error("WALK_NOT_ACTIVE"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-09T11:00" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "Garden corner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That walk is no longer active. Try again to save this as a standalone log.",
    );
    expect(screen.getByLabelText("When did it happen?")).toHaveValue(
      "2026-07-09T11:00",
    );
    expect(screen.getByLabelText(/^Note\b/)).toHaveValue("Garden corner");
    expect(screen.getByLabelText("Attach to active walk")).toBeChecked();
    expect(screen.getByRole("button", { name: "Log event" })).toBeEnabled();
  });

  it("maps an invalid linked timestamp to the datetime field", async () => {
    const walk = walkEvent({ at: Date.parse("2026-07-09T10:00:00Z") });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    convex.pottyLog.mockRejectedValue(new Error("INVALID_WALK_TIMESTAMP"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-09T11:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    expect(
      await screen.findByText(
        "Choose a time on or after the active walk started.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("When did it happen?")).toHaveAttribute(
      "aria-describedby",
      "backdate-timezone backdate-at-error",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks linked recent potty as during the walk", () => {
    convex.recent = [
      mealEvent({
        _id: "pee-id",
        amount: undefined,
        kind: "pee",
        walkId: "walk-id",
      }),
    ];
    render(<DashboardPage dog={dog} />);

    const recent = screen
      .getByRole("heading", { name: "Recent activity" })
      .closest("section")!;
    expect(within(recent).getByText("During walk")).toBeInTheDocument();
  });
});

describe("DashboardPage active walk diary", () => {
  const useActiveWalk = (overrides: Record<string, unknown> = {}) => {
    const walk = walkEvent(overrides);
    convex.activeWalk = walk;
    convex.latest!.walk = walk;
    return walk;
  };
  const getDiary = () => screen.getByRole("textbox", { name: /Walk diary/ });

  it("adds a trimmed diary without ending the walk or changing its timer", async () => {
    useActiveWalk();
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add walk diary" }));
    const diary = getDiary();

    expect(diary).toHaveValue("");
    expect(screen.getByText("Optional · 0/500 characters")).toBeInTheDocument();
    fireEvent.change(diary, { target: { value: "  Loud bicycle  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));

    await waitFor(() =>
      expect(convex.diaryUpdate).toHaveBeenCalledWith({
        dogId,
        note: "Loud bicycle",
        walkId: "walk-id",
      }),
    );
    expect(await screen.findByText("Walk diary saved.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(
      screen.queryByRole("form", { name: "Walk diary" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Current walk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End walk" })).toBeEnabled();
    expect(convex.walkEnd).not.toHaveBeenCalled();
  });

  it("edits an existing diary and prefills its content", async () => {
    useActiveWalk({ note: "Old note" });
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit walk diary" }));
    const diary = getDiary();

    expect(diary).toHaveValue("Old note");
    fireEvent.change(diary, { target: { value: "Met three children" } });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));

    await waitFor(() =>
      expect(convex.diaryUpdate).toHaveBeenCalledWith({
        dogId,
        note: "Met three children",
        walkId: "walk-id",
      }),
    );
  });

  it("clears a diary with a normalized null payload", async () => {
    useActiveWalk({ note: "Existing diary" });
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit walk diary" }));
    fireEvent.change(getDiary(), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));

    await waitFor(() =>
      expect(convex.diaryUpdate).toHaveBeenCalledWith({
        dogId,
        note: null,
        walkId: "walk-id",
      }),
    );
  });

  it("accepts 500 characters and rejects 501 accessibly", async () => {
    useActiveWalk();
    const { rerender } = render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add walk diary" }));
    fireEvent.change(getDiary(), {
      target: { value: "x".repeat(500) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));
    await waitFor(() =>
      expect(convex.diaryUpdate).toHaveBeenCalledWith({
        dogId,
        note: "x".repeat(500),
        walkId: "walk-id",
      }),
    );

    convex.diaryUpdate.mockClear();
    rerender(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add walk diary" }));
    const diary = getDiary();
    fireEvent.change(diary, { target: { value: "x".repeat(501) } });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));

    expect(
      screen.getByText("Use 500 characters or fewer."),
    ).toBeInTheDocument();
    expect(diary).toHaveAttribute(
      "aria-describedby",
      "walk-diary-help walk-diary-error",
    );
    expect(diary).toHaveFocus();
    expect(convex.diaryUpdate).not.toHaveBeenCalled();
  });

  it("shares the operation lock and prevents duplicate diary saves", async () => {
    let finish!: () => void;
    useActiveWalk();
    convex.diaryUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(null);
        }),
    );
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add walk diary" }));
    fireEvent.change(getDiary(), {
      target: { value: "Squirrels everywhere" },
    });
    const save = screen.getByRole("button", { name: "Save diary" });

    fireEvent.click(save);
    fireEvent.click(save);

    expect(
      await screen.findByRole("button", { name: "Saving…" }),
    ).toBeDisabled();
    expect(getDiary()).toBeDisabled();
    expect(screen.getByRole("button", { name: "End walk" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Log with details" }),
    ).toBeDisabled();
    expect(convex.diaryUpdate).toHaveBeenCalledTimes(1);
    expect(convex.walkEnd).not.toHaveBeenCalled();

    finish();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Walk diary saved.",
    );
  });

  it("cancels local diary edits and restores the saved note", () => {
    useActiveWalk({ note: "Saved note" });
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit walk diary" }));
    fireEvent.change(getDiary(), {
      target: { value: "Unsaved change" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("form", { name: "Walk diary" }),
    ).not.toBeInTheDocument();
    expect(convex.diaryUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit walk diary" }));
    expect(getDiary()).toHaveValue("Saved note");
  });

  it("retains diary content after a backend failure", async () => {
    useActiveWalk();
    convex.diaryUpdate.mockRejectedValue(new Error("network"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add walk diary" }));
    fireEvent.change(getDiary(), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save the walk diary. Nothing was lost—try again.",
    );
    expect(getDiary()).toHaveValue("Keep this draft");
    expect(screen.getByRole("button", { name: "Save diary" })).toBeEnabled();
    expect(convex.walkEnd).not.toHaveBeenCalled();
  });

  it("maps INVALID_NOTE to the diary field", async () => {
    useActiveWalk();
    convex.diaryUpdate.mockRejectedValue(new Error("INVALID_NOTE"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add walk diary" }));
    const diary = getDiary();
    fireEvent.change(diary, { target: { value: "Backend rejected note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));

    expect(
      await screen.findByText("Use 500 characters or fewer."),
    ).toBeInTheDocument();
    expect(diary).toHaveAttribute(
      "aria-describedby",
      "walk-diary-help walk-diary-error",
    );
    expect(diary).toHaveValue("Backend rejected note");
    await waitFor(() => expect(diary).toHaveFocus());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("DashboardPage active walk identity scoping", () => {
  it("discards an end-time draft when walk A is replaced by walk B", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    const walkA = walkEvent({
      _id: "walk-a",
      at: Date.parse("2026-07-09T09:00:00Z"),
    });
    const walkB = walkEvent({
      _id: "walk-b",
      at: Date.parse("2026-07-09T10:30:00Z"),
    });
    convex.activeWalk = walkA;
    convex.latest!.walk = walkA;
    convex.walkEnd.mockResolvedValue(Date.parse("2026-07-09T11:30:00Z"));
    const { rerender } = render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose end time" }));
    fireEvent.change(screen.getByLabelText("Walk end time"), {
      target: { value: "2026-07-09T10:00" },
    });

    convex.activeWalk = walkB;
    convex.latest!.walk = walkB;
    rerender(<DashboardPage dog={dog} />);

    expect(
      screen.queryByRole("form", { name: "Backdated walk end" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose end time" }));
    expect(screen.getByLabelText("Walk end time")).toHaveValue(
      "2026-07-09T12:00",
    );
    fireEvent.change(screen.getByLabelText("Walk end time"), {
      target: { value: "2026-07-09T11:30" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "End walk at this time" }),
    );

    await waitFor(() =>
      expect(convex.walkEnd).toHaveBeenCalledWith({
        dogId,
        endedAt: Date.parse("2026-07-09T11:30:00Z"),
        walkId: "walk-b",
      }),
    );
    expect(convex.walkEnd).toHaveBeenCalledTimes(1);
  });

  it("discards walk A's diary draft before editing walk B", async () => {
    const walkA = walkEvent({ _id: "walk-a", note: "A saved note" });
    const walkB = walkEvent({ _id: "walk-b", note: "B saved note" });
    convex.activeWalk = walkA;
    convex.latest!.walk = walkA;
    const { rerender } = render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit walk diary" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Walk diary/ }), {
      target: { value: "Draft meant only for A" },
    });

    convex.activeWalk = walkB;
    convex.latest!.walk = walkB;
    rerender(<DashboardPage dog={dog} />);

    expect(
      screen.queryByRole("form", { name: "Walk diary" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit walk diary" }));
    const diary = screen.getByRole("textbox", { name: /Walk diary/ });
    expect(diary).toHaveValue("B saved note");
    fireEvent.change(diary, { target: { value: "B's new note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save diary" }));

    await waitFor(() =>
      expect(convex.diaryUpdate).toHaveBeenCalledWith({
        dogId,
        note: "B's new note",
        walkId: "walk-b",
      }),
    );
    expect(convex.diaryUpdate).toHaveBeenCalledTimes(1);
  });

  it("resets backdated potty attachment before targeting walk B", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    const walkA = walkEvent({
      _id: "walk-a",
      at: Date.parse("2026-07-09T09:00:00Z"),
    });
    const walkB = walkEvent({
      _id: "walk-b",
      at: Date.parse("2026-07-09T11:00:00Z"),
    });
    convex.activeWalk = walkA;
    convex.latest!.walk = walkA;
    const { rerender } = render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-09T10:00" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "Draft meant only for A" },
    });

    convex.activeWalk = walkB;
    convex.latest!.walk = walkB;
    rerender(<DashboardPage dog={dog} />);

    expect(
      screen.queryByRole("form", { name: "Backdated event" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    expect(screen.getByLabelText("When did it happen?")).toHaveValue(
      "2026-07-09T12:00",
    );
    expect(screen.getByLabelText(/^Note\b/)).toHaveValue("");
    expect(screen.getByLabelText("Attach to active walk")).toBeChecked();
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-09T11:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    await waitFor(() =>
      expect(convex.pottyLog).toHaveBeenCalledWith({
        at: Date.parse("2026-07-09T11:30:00Z"),
        dogId,
        kind: "pee",
        peePlace: "outside",
        walkId: "walk-b",
      }),
    );
    expect(convex.pottyLog).toHaveBeenCalledTimes(1);
  });
});

describe("DashboardPage recent walks", () => {
  it("renders an active walk with its live duration", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-09T10:00:00Z");
    vi.setSystemTime(now);
    convex.recent = [walkEvent({ at: now - 15 * 60_000 })];
    render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));
    const recent = screen
      .getByRole("heading", { name: "Recent activity" })
      .closest("section")!;

    expect(within(recent).getByText("In progress")).toBeInTheDocument();
    expect(within(recent).getByText(/15m/)).toBeInTheDocument();
  });

  it("renders completed local times, duration, and walk diary", () => {
    const at = Date.parse("2026-07-09T09:00:00Z");
    const endedAt = at + 30 * 60_000;
    convex.recent = [
      walkEvent({ at, endedAt, note: "Played beside the stream" }),
    ];
    render(<DashboardPage dog={dog} />);
    const recent = screen
      .getByRole("heading", { name: "Recent activity" })
      .closest("section")!;
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: dog.timezone,
    });

    expect(within(recent).getByText("Completed")).toBeInTheDocument();
    expect(within(recent).getByText(formatter.format(at))).toBeInTheDocument();
    expect(
      within(recent).getByText(formatter.format(endedAt)),
    ).toBeInTheDocument();
    expect(within(recent).getByText(/30m/)).toBeInTheDocument();
    expect(within(recent).getByText("Walk diary")).toBeInTheDocument();
    expect(
      within(recent).getByText("Played beside the stream"),
    ).toBeInTheDocument();
  });

  it("edits only dirty walk start, end, and diary fields", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.recent = [
      walkEvent({
        endedAt: Date.parse("2026-07-09T10:00:00Z"),
        note: "Old diary",
      }),
    ];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Walk/ }));

    fireEvent.change(screen.getByLabelText("Walk start"), {
      target: { value: "2026-07-09T08:00" },
    });
    fireEvent.change(screen.getByLabelText("Walk end"), {
      target: { value: "2026-07-09T09:30" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Walk diary/ }), {
      target: { value: "  New diary  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(convex.update).toHaveBeenCalledWith({
        at: Date.parse("2026-07-09T08:00:00Z"),
        dogId,
        endedAt: Date.parse("2026-07-09T09:30:00Z"),
        eventId: "walk-id",
        note: "New diary",
      }),
    );
  });

  it("omits unchanged walk timestamps with seconds and milliseconds", async () => {
    convex.recent = [
      walkEvent({
        at: Date.parse("2026-07-09T07:30:45.678Z"),
        endedAt: Date.parse("2026-07-09T08:10:55.111Z"),
        note: "Before",
      }),
    ];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Walk/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Walk diary/ }), {
      target: { value: "After" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(convex.update).toHaveBeenCalledWith({
        dogId,
        eventId: "walk-id",
        note: "After",
      }),
    );
  });

  it("shows walk end only for completed walks", () => {
    convex.recent = [walkEvent()];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Walk/ }));

    expect(screen.getByLabelText("Walk start")).toBeInTheDocument();
    expect(screen.queryByLabelText("Walk end")).not.toBeInTheDocument();
    expect(screen.getByText("Timezone: UTC")).toBeInTheDocument();
  });

  it("validates that walk start is on or before its end", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.recent = [
      walkEvent({ endedAt: Date.parse("2026-07-09T10:00:00Z") }),
    ];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Walk/ }));
    fireEvent.change(screen.getByLabelText("Walk start"), {
      target: { value: "2026-07-09T11:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      screen.getByText("Choose a start time on or before the walk ended."),
    ).toBeInTheDocument();
    expect(convex.update).not.toHaveBeenCalled();
  });

  it.each([
    [
      "INVALID_WALK_INTERVAL",
      "Choose times where the walk start is on or before its end.",
    ],
    [
      "INVALID_WALK_TIMESTAMP",
      "That time would leave an attached potty log outside the walk. Choose another time.",
    ],
  ])(
    "maps %s to the dirty walk field and retains values",
    async (code, message) => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
      convex.update.mockRejectedValue(new Error(code));
      convex.recent = [
        walkEvent({ endedAt: Date.parse("2026-07-09T10:00:00Z") }),
      ];
      render(<DashboardPage dog={dog} />);
      fireEvent.click(screen.getByRole("button", { name: /Edit Walk/ }));
      fireEvent.change(screen.getByLabelText("Walk end"), {
        target: { value: "2026-07-09T10:30" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByLabelText("Walk end")).toHaveValue("2026-07-09T10:30");
      expect(screen.getByLabelText("Walk end")).toHaveAttribute(
        "aria-describedby",
        "edit-ended-at-timezone-walk-id edit-ended-at-error-walk-id",
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("warns that deleting a walk keeps attached potty logs", () => {
    convex.recent = [walkEvent()];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Delete Walk/ }));

    expect(screen.getByText("Delete the “Walk” log?")).toBeInTheDocument();
    expect(
      screen.getByText("Attached potty logs will remain as standalone logs."),
    ).toBeInTheDocument();
  });

  it("removes the walk badge after a reactive potty detach", () => {
    convex.recent = [
      mealEvent({
        _id: "pee-id",
        amount: undefined,
        kind: "pee",
        walkId: "walk-id",
      }),
    ];
    const { rerender } = render(<DashboardPage dog={dog} />);
    expect(screen.getByText("During walk")).toBeInTheDocument();

    convex.recent = [
      mealEvent({
        _id: "pee-id",
        amount: undefined,
        kind: "pee",
        walkId: undefined,
      }),
    ];
    rerender(<DashboardPage dog={dog} />);
    expect(screen.queryByText("During walk")).not.toBeInTheDocument();
  });
});

describe("DashboardPage backdating", () => {
  it("defaults to the current minute in the dog's timezone", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T00:05:42Z"));
    render(<DashboardPage dog={{ ...dog, timezone: "Asia/Tokyo" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));

    expect(screen.getByLabelText("When did it happen?")).toHaveValue(
      "2026-07-09T09:05",
    );
    expect(screen.getByText("Timezone: Asia/Tokyo")).toBeInTheDocument();
  });

  it("submits a normalized backdated payload", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "meal" },
    });
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-09T08:15" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "  Late breakfast  " },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "125.5" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    await waitFor(() =>
      expect(convex.log).toHaveBeenCalledWith({
        amount: 125.5,
        at: Date.parse("2026-07-09T08:15:00Z"),
        dogId,
        kind: "meal",
        note: "Late breakfast",
      }),
    );
    expect(
      screen.queryByRole("form", { name: "Backdated event" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Meal logged for Milo.",
    );
  });

  it("shows amount only for meals and treats", () => {
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    const kind = screen.getByLabelText("What happened?");

    expect(screen.queryByLabelText(/Amount/)).not.toBeInTheDocument();
    fireEvent.change(kind, { target: { value: "treat" } });
    expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
    fireEvent.change(kind, { target: { value: "pee" } });
    expect(screen.queryByLabelText(/Amount/)).not.toBeInTheDocument();
  });

  it("validates timestamp, note length, and amount bounds", () => {
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "treat" },
    });
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "x".repeat(501) },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    expect(
      screen.getByText("Choose a valid date and time."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Use 500 characters or fewer."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter an amount greater than zero and no more than 10000.",
      ),
    ).toBeInTheDocument();
    expect(convex.log).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "10001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    expect(
      screen.getByText(
        "Enter an amount greater than zero and no more than 10000.",
      ),
    ).toBeInTheDocument();
  });

  it("locks duplicate submissions and collapses after success", async () => {
    let finish!: () => void;
    convex.log.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("backdated-id");
        }),
    );
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    const submit = screen.getByRole("button", { name: "Log event" });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(
      await screen.findByRole("button", { name: "Logging…" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("What happened?")).toBeDisabled();
    expect(convex.log).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Pee logged for Milo.",
    );
    expect(
      screen.queryByRole("form", { name: "Backdated event" }),
    ).not.toBeInTheDocument();
  });

  it("preserves every form value after a backend failure", async () => {
    convex.log.mockRejectedValue(new Error("network"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.change(screen.getByLabelText("When did it happen?"), {
      target: { value: "2026-07-08T22:30" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "Garden before bed" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save this log. Nothing was lost—try again.",
    );
    expect(screen.getByLabelText("When did it happen?")).toHaveValue(
      "2026-07-08T22:30",
    );
    expect(screen.getByLabelText(/^Note\b/)).toHaveValue("Garden before bed");
    expect(screen.getByRole("button", { name: "Log event" })).toBeEnabled();
  });

  it("validates backdated events against the birthday and future limit", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    const at = screen.getByLabelText("When did it happen?");

    fireEvent.change(at, { target: { value: "2024-01-14T23:59" } });
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    expect(
      screen.getByText("Choose a date on or after 2024-01-15."),
    ).toBeInTheDocument();
    expect(at).toHaveAttribute(
      "aria-describedby",
      "backdate-timezone backdate-at-error",
    );

    fireEvent.change(at, { target: { value: "2026-07-09T12:06" } });
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    expect(
      screen.getByText("Choose a time no more than 5 minutes in the future."),
    ).toBeInTheDocument();
    expect(convex.log).not.toHaveBeenCalled();
  });

  it("maps a backend timestamp rejection to the date field", async () => {
    convex.log.mockRejectedValue(new Error("INVALID_TIMESTAMP"));
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    expect(
      await screen.findByText(
        "That date and time is outside the allowed range. Choose another time.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("When did it happen?")).toHaveAttribute(
      "aria-describedby",
      "backdate-timezone backdate-at-error",
    );
  });

  it("shares the operation lock and keeps undo tied to the newest log", async () => {
    let finish!: () => void;
    convex.log.mockResolvedValueOnce("quick-id").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("backdated-id");
        }),
    );
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Pee" }));
    await screen.findByText("Pee logged for Milo.");

    fireEvent.click(screen.getByRole("button", { name: "Log with details" }));
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    expect(await screen.findByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log Meal" })).toBeDisabled();
    finish();
    await screen.findByText("Pee logged for Milo.");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(convex.remove).toHaveBeenCalledWith({
        dogId,
        eventId: "backdated-id",
      }),
    );
  });
});

describe("DashboardPage recent event actions", () => {
  it("sends normalized edit fields and nulls to clear optional values", async () => {
    convex.recent = [mealEvent()];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Meal/ }));
    fireEvent.change(screen.getByLabelText("Date and time"), {
      target: { value: "2026-07-08T22:45" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(convex.update).toHaveBeenCalledWith({
        amount: null,
        at: Date.parse("2026-07-08T22:45:00Z"),
        dogId,
        eventId: "meal-id",
        note: null,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Meal updated.",
    );
    expect(
      screen.queryByRole("form", { name: "Edit Meal event" }),
    ).not.toBeInTheDocument();
  });

  it("cancels edits and restores the display row", () => {
    convex.recent = [mealEvent()];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Meal/ }));
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "Changed locally" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Ate everything")).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("Changed locally"),
    ).not.toBeInTheDocument();
    expect(convex.update).not.toHaveBeenCalled();
  });

  it.each([
    ["seconds and milliseconds", "UTC", "2026-07-09T07:30:45.678Z"],
    [
      "the second fall-back occurrence",
      "Europe/Bratislava",
      "2026-10-25T01:30:00.000Z",
    ],
  ])("omits unchanged at for %s", async (_, timezone, timestamp) => {
    convex.recent = [
      mealEvent({
        _id: "pee-id",
        amount: undefined,
        at: Date.parse(timestamp),
        kind: "pee",
        note: "Before",
      }),
    ];
    render(<DashboardPage dog={{ ...dog, timezone }} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Pee/ }));
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "After" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(convex.update).toHaveBeenCalledWith({
        dogId,
        eventId: "pee-id",
        note: "After",
      }),
    );
  });

  it("shows amount only when editing a meal or treat", () => {
    convex.recent = [mealEvent()];
    const { rerender } = render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Meal/ }));
    expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    convex.recent = [
      mealEvent({ _id: "pee-id", amount: undefined, kind: "pee" }),
    ];
    rerender(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Pee/ }));
    expect(screen.queryByLabelText(/Amount/)).not.toBeInTheDocument();
  });

  it("validates edits and retains values after a backend failure", async () => {
    convex.recent = [mealEvent()];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Meal/ }));
    fireEvent.change(screen.getByLabelText("Date and time"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "x".repeat(501) },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "10001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      screen.getByText("Choose a valid date and time."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Use 500 characters or fewer."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter an amount greater than zero and no more than 10000.",
      ),
    ).toBeInTheDocument();
    expect(convex.update).not.toHaveBeenCalled();

    convex.update.mockRejectedValue(new Error("network"));
    fireEvent.change(screen.getByLabelText("Date and time"), {
      target: { value: "2026-07-08T21:10" },
    });
    fireEvent.change(screen.getByLabelText(/^Note\b/), {
      target: { value: "  Kept note  " },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "85" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save these changes. Nothing was lost—try again.",
    );
    expect(screen.getByLabelText("Date and time")).toHaveValue(
      "2026-07-08T21:10",
    );
    expect(screen.getByLabelText(/^Note\b/)).toHaveValue("  Kept note  ");
    expect(screen.getByLabelText(/Amount/)).toHaveValue(85);
  });

  it("validates edit dates and describes every field error", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    convex.recent = [mealEvent()];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Meal/ }));
    const at = screen.getByLabelText("Date and time");
    const amount = screen.getByLabelText(/Amount/);
    const note = screen.getByLabelText(/^Note\b/);

    expect(screen.getByText("Timezone: UTC")).toBeInTheDocument();
    fireEvent.change(at, { target: { value: "2024-01-14T23:59" } });
    fireEvent.change(amount, { target: { value: "10001" } });
    fireEvent.change(note, { target: { value: "x".repeat(501) } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      screen.getByText("Choose a date on or after 2024-01-15."),
    ).toBeInTheDocument();
    expect(at).toHaveAttribute(
      "aria-describedby",
      "edit-timezone-meal-id edit-at-error-meal-id",
    );
    expect(amount).toHaveAttribute(
      "aria-describedby",
      "edit-amount-error-meal-id",
    );
    expect(note).toHaveAttribute("aria-describedby", "edit-note-error-meal-id");

    fireEvent.change(at, { target: { value: "2026-07-09T12:06" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      screen.getByText("Choose a time no more than 5 minutes in the future."),
    ).toBeInTheDocument();
    expect(convex.update).not.toHaveBeenCalled();
  });

  it("maps a backend edit timestamp rejection to the date field", async () => {
    convex.update.mockRejectedValue(new Error("INVALID_TIMESTAMP"));
    convex.recent = [mealEvent()];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Meal/ }));
    fireEvent.change(screen.getByLabelText("Date and time"), {
      target: { value: "2026-07-09T07:31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText(
        "That date and time is outside the allowed range. Choose another time.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date and time")).toHaveAttribute(
      "aria-describedby",
      "edit-timezone-meal-id edit-at-error-meal-id",
    );
  });

  it("disables other rows while one editor is open", () => {
    convex.recent = [
      mealEvent(),
      mealEvent({ _id: "pee-id", amount: undefined, kind: "pee" }),
    ];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Meal/ }));

    expect(screen.getByRole("button", { name: /Edit Pee/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Delete Pee/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: /Edit Pee/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Delete Pee/ })).toBeEnabled();
  });

  it("requires confirmation, supports cancel, and deletes once", async () => {
    let finish!: () => void;
    convex.remove.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(null);
        }),
    );
    convex.recent = [
      mealEvent(),
      mealEvent({ _id: "pee-id", amount: undefined, kind: "pee" }),
    ];
    render(<DashboardPage dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Delete Meal/ }));

    expect(screen.getByText("Delete the “Meal” log?")).toBeInTheDocument();
    expect(convex.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel delete Meal" }));
    expect(
      screen.queryByText("Delete the “Meal” log?"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete Meal/ }));
    const confirm = screen.getByRole("button", {
      name: "Confirm delete Meal",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(convex.remove).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Cancel delete Meal" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /Edit Pee/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Delete Pee/ })).toBeDisabled();
    finish();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Meal deleted.",
    );
    expect(
      screen.queryByText("Delete the “Meal” log?"),
    ).not.toBeInTheDocument();
  });
});

describe("DashboardPage activity", () => {
  it("uses the shared notebook header and queries the complete activity shelf", () => {
    render(<DashboardPage dog={dog} />);

    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByLabelText("Current dog: Milo")).toBeInTheDocument();
    expect(
      convex.queryCalls.filter(({ name }) => name === "activityTypes:list"),
    ).toEqual([
      {
        name: "activityTypes:list",
        args: { dogId, includeArchived: true, limit: 100 },
      },
    ]);
  });

  it("renders active and archived activity names with historical play details", () => {
    const at = Date.parse("2026-07-09T08:00:00Z");
    convex.activityTypes = [
      activityType(),
      activityType({
        _id: archivedTypeId,
        emoji: "🧺",
        isArchived: true,
        name: "Rainy-day box",
      }),
    ];
    convex.recent = [
      playEvent({
        at,
        endedAt: at + 15 * 60_000,
        note: "Good focus",
      }),
      playEvent({
        _id: "archived-play-id",
        activityTypeId: archivedTypeId,
        at: at - 60 * 60_000,
        note: "Still part of the history",
      }),
    ];

    render(<DashboardPage dog={dog} />);
    const recent = screen
      .getByRole("heading", { name: "Recent activity" })
      .closest("section")!;

    expect(within(recent).getByText("🪢 Tug")).toBeInTheDocument();
    expect(within(recent).getByText("🧺 Rainy-day box")).toBeInTheDocument();
    expect(within(recent).getByText("Good focus")).toBeInTheDocument();
    expect(
      within(recent).getByText("Still part of the history"),
    ).toBeInTheDocument();
    expect(within(recent).getByText("Duration: 15m")).toBeInTheDocument();
    fireEvent.click(
      within(recent).getByRole("button", { name: /Delete 🪢 Tug/ }),
    );
    expect(within(recent).getByText("Delete the “🪢 Tug” log?")).toBeVisible();
  });

  it("keeps recent activity in an ordered feed", () => {
    convex.recent = [
      mealEvent(),
      mealEvent({ _id: "pee-id", amount: undefined, kind: "pee" }),
    ];
    render(<DashboardPage dog={dog} />);
    const recent = screen
      .getByRole("heading", { name: "Recent activity" })
      .closest("section")!;
    const feed = within(recent).getByRole("list");
    const rows = within(feed).getAllByRole("listitem");

    expect(feed.tagName).toBe("OL");
    expect(within(rows[0]).getByText("Meal")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Pee")).toBeInTheDocument();
  });

  it("keeps an accessible Play fallback while types load or are missing", () => {
    convex.activityTypes = undefined;
    convex.recent = [playEvent({ note: "Rolling treat ball" })];
    const { rerender } = render(<DashboardPage dog={dog} />);

    expect(screen.getByRole("button", { name: /Edit Play on/ })).toBeEnabled();
    expect(screen.getByText("Rolling treat ball")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeEnabled();

    convex.activityTypes = [];
    rerender(<DashboardPage dog={dog} />);
    expect(screen.getByRole("button", { name: /Edit Play on/ })).toBeEnabled();
    expect(screen.getByText("Rolling treat ball")).toBeInTheDocument();
  });

  it("renders actual recent details and latest quick-log context", () => {
    const at = Date.UTC(2026, 6, 9, 7, 30);
    convex.latest!.pee = { at };
    convex.recent = [
      {
        _creationTime: at,
        _id: "meal-id",
        amount: 120,
        at,
        dogId,
        kind: "meal",
        note: "Ate everything",
        userId: "user-id",
      },
    ];
    render(<DashboardPage dog={dog} />);
    const recent = screen
      .getByRole("heading", { name: "Recent activity" })
      .closest("section")!;

    expect(within(recent).getByText("Meal")).toBeInTheDocument();
    expect(within(recent).getByText("Ate everything")).toBeInTheDocument();
    expect(within(recent).getByText("Amount: 120")).toBeInTheDocument();
    expect(recent.querySelector("time")).toHaveAttribute(
      "datetime",
      new Date(at).toISOString(),
    );
    expect(screen.getByRole("button", { name: "Log Pee" })).toHaveTextContent(
      "Last",
    );
    expect(screen.getByRole("button", { name: "Log Pee" })).toHaveAttribute(
      "aria-describedby",
      "quick-state-pee",
    );
  });

  it("announces recent activity loading politely", () => {
    convex.recent = undefined;
    render(<DashboardPage dog={dog} />);

    expect(screen.getByText("Loading recent activity…")).toHaveAttribute(
      "role",
      "status",
    );
  });
});

describe("DashboardPage timers", () => {
  it("derives event timers, the next meal, and current sleep state", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-09T12:00:00Z");
    vi.setSystemTime(now);
    convex.latest = {
      meal: { at: now - 90 * 60_000 },
      pee: { at: now - 20 * 60_000 },
      poop: null,
      sleep: { at: now - 2 * 60 * 60_000 },
      treat: null,
      wake: { at: now - 3 * 60 * 60_000 },
    };
    convex.routines = [{ label: "Dinner", timeOfDay: "13:30" }];

    render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));
    const summary = screen.getByRole("region", { name: "Right now" });

    expect(within(summary).getAllByRole("term")).toHaveLength(6);
    expect(within(summary).queryAllByRole("article")).toHaveLength(0);
    expect(
      within(getSummaryItem("Since last meal")).getByText("1h 30m"),
    ).toBeInTheDocument();
    expect(
      within(getSummaryItem("Next meal")).getByText("1h 30m"),
    ).toBeInTheDocument();
    expect(
      within(getSummaryItem("Next meal")).getByText("Dinner"),
    ).toBeInTheDocument();
    expect(
      within(getSummaryItem("Since last pee")).getByText("20m"),
    ).toBeInTheDocument();
    expect(
      within(getSummaryItem("Since last poop")).getByText("No log yet"),
    ).toBeInTheDocument();
    expect(
      within(getSummaryItem("Current rest state")).getByText("2h"),
    ).toBeInTheDocument();
    expect(
      within(getSummaryItem("Current rest state")).getByText("Asleep"),
    ).toBeInTheDocument();
  });

  it("distinguishes loading data from missing data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-09T12:00:00Z"));
    convex.latest = undefined;
    convex.routines = undefined;
    const { rerender } = render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));

    const summary = screen.getByRole("region", { name: "Right now" });
    expect(within(summary).getByRole("status")).toHaveTextContent("Syncing…");
    expect(within(summary).getAllByRole("term")).toHaveLength(6);

    convex.latest = {
      meal: null,
      pee: null,
      poop: null,
      sleep: null,
      treat: null,
      wake: null,
    };
    convex.routines = [];
    rerender(<DashboardPage dog={dog} />);

    expect(
      within(getSummaryItem("Since last meal")).getByText("No log yet"),
    ).toBeInTheDocument();
    expect(
      within(getSummaryItem("Next meal")).getByText("No meal scheduled"),
    ).toBeInTheDocument();
    expect(
      within(getSummaryItem("Current rest state")).getByText("No state yet"),
    ).toBeInTheDocument();
  });

  it("formats the local day and event clocks in the dog's timezone", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-09T02:00:00Z");
    const at = Date.parse("2026-07-09T01:30:00Z");
    const timezone = "America/New_York";
    vi.setSystemTime(now);
    convex.latest!.pee = { at };
    convex.recent = [
      {
        _creationTime: at,
        _id: "pee-id",
        at,
        dogId,
        kind: "pee",
        userId: "user-id",
      },
    ];

    render(<DashboardPage dog={{ ...dog, timezone }} />);
    act(() => vi.advanceTimersByTime(0));
    const expectedDay = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
      timeZone: timezone,
      weekday: "long",
    }).format(now);
    const expectedTime = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(at);
    const expectedDate = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      timeZone: timezone,
      year: "numeric",
    }).format(at);

    expect(screen.getByText(`${expectedDay} · today`)).toBeInTheDocument();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
    expect(screen.getByText(expectedTime)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log Pee" })).toHaveTextContent(
      `Last ${expectedTime}`,
    );
  });

  it("updates elapsed values on the shared 30-second tick", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-09T12:00:00Z");
    vi.setSystemTime(now);
    convex.latest!.pee = { at: now - 30_000 };
    render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));

    expect(
      within(getSummaryItem("Since last pee")).getByText("30s"),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(30_000));
    expect(
      within(getSummaryItem("Since last pee")).getByText("1m"),
    ).toBeInTheDocument();
  });
});

describe("DashboardPage agenda summary", () => {
  it("queries the dog-local day and rolls over on the shared 30-second tick", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-09T21:59:45Z"));
    render(<DashboardPage dog={{ ...dog, timezone: "Europe/Bratislava" }} />);

    expect(convex.queryCalls).toContainEqual({
      name: "agenda:get",
      args: "skip",
    });
    act(() => vi.advanceTimersByTime(0));
    expect(convex.queryCalls).toContainEqual({
      name: "agenda:get",
      args: { dogId, date: "2026-07-09" },
    });

    act(() => vi.advanceTimersByTime(30_000));
    expect(convex.queryCalls).toContainEqual({
      name: "agenda:get",
      args: { dogId, date: "2026-07-10" },
    });
  });

  it("keeps agenda loading local, then invites an empty day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-09T12:00:00Z"));
    convex.agenda = undefined;
    const { rerender } = render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));
    const summary = screen.getByRole("region", { name: "Today’s agenda" });

    expect(within(summary).getByRole("status")).toHaveTextContent(
      "Opening today’s agenda",
    );
    expect(
      within(getSummaryItem("Since last meal")).getByText("No log yet"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log Pee" })).toBeEnabled();

    convex.agenda = null;
    rerender(<DashboardPage dog={dog} />);
    expect(within(summary).getByText("Plan today’s small wins.")).toBeVisible();
    expect(
      within(summary).getByRole("link", { name: "Open agenda" }),
    ).toHaveAttribute("href", "/agenda");
    expect(
      screen.queryByText(
        "Milestone 9: Slovak localization and personal settings.",
      ),
    ).not.toBeInTheDocument();
  });

  it("renders reactive goal counts, win, and rating", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-09T12:00:00Z"));
    const win =
      "Stayed calm through a long greeting at the busy neighborhood cafe";
    convex.agenda = {
      _creationTime: 1,
      _id: "agenda-id",
      date: "2026-07-09",
      diary: "A focused day.",
      dogId,
      enrichmentGoals: [
        { id: 1, text: "Cafe", done: true },
        { id: 2, text: "Snuffle", done: false },
      ],
      nextGoalId: 4,
      rating: 4,
      trainingGoals: [{ id: 3, text: "Recall", done: true }],
      win,
    };
    const { rerender } = render(<DashboardPage dog={dog} />);
    act(() => vi.advanceTimersByTime(0));
    const summary = screen.getByRole("region", { name: "Today’s agenda" });

    expect(
      within(summary).getByText("Enrichment").parentElement,
    ).toHaveTextContent("1/2");
    expect(
      within(summary).getByText("Training").parentElement,
    ).toHaveTextContent("1/1");
    expect(within(summary).getByText(`Win · ${win}`)).toHaveClass(
      "break-words",
    );
    expect(within(summary).getByText("4/5")).toBeInTheDocument();

    convex.agenda = {
      ...(convex.agenda as Record<string, unknown>),
      enrichmentGoals: [
        { id: 1, text: "Cafe", done: true },
        { id: 2, text: "Snuffle", done: true },
      ],
      rating: 5,
    };
    rerender(<DashboardPage dog={dog} />);
    expect(
      within(summary).getByText("Enrichment").parentElement,
    ).toHaveTextContent("2/2");
    expect(within(summary).getByText("5/5")).toBeInTheDocument();
  });
});
