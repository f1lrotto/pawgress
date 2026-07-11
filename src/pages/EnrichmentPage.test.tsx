import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { setLocale } from "@/i18n";
import EnrichmentPage from "./EnrichmentPage";

const convex = vi.hoisted(() => ({
  activityTypes: [] as unknown[] | undefined,
  create: vi.fn(),
  logPlay: vi.fn(),
  queryCalls: [] as Array<{ args: unknown; name: string }>,
  setArchived: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "activityTypes:create") return convex.create;
    if (name === "activityTypes:logPlay") return convex.logPlay;
    return convex.setArchived;
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
const tugId = "tug-id" as Id<"activityTypes">;
const fetchId = "fetch-id" as Id<"activityTypes">;
const oldGameId = "old-game-id" as Id<"activityTypes">;
const dog = {
  _id: dogId,
  birthday: "2024-01-15",
  name: "Milo",
  timezone: "UTC",
};
const activity = (overrides: Record<string, unknown> = {}) => ({
  _creationTime: 1,
  _id: tugId,
  dogId,
  emoji: "🪢",
  isArchived: false,
  name: "Tug",
  ...overrides,
});
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/enrichment"]}>
      <EnrichmentPage dog={dog} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await setLocale("en");
  convex.activityTypes = [activity()];
  convex.create.mockReset();
  convex.create.mockResolvedValue("created-id");
  convex.logPlay.mockReset();
  convex.logPlay.mockResolvedValue("event-id");
  convex.queryCalls = [];
  convex.setArchived.mockReset();
  convex.setArchived.mockResolvedValue(null);
});

describe("EnrichmentPage", () => {
  it("queries the full shelf and distinguishes loading, empty, and all archived", () => {
    convex.activityTypes = undefined;
    const { rerender } = renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Enrichment" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("status")).toHaveTextContent("Loading activities");
    expect(screen.getByLabelText("Activity")).toBeDisabled();
    expect(screen.getByLabelText("Activity name")).toBeDisabled();
    expect(convex.queryCalls).toEqual([
      {
        name: "activityTypes:list",
        args: { dogId, includeArchived: true, limit: 100 },
      },
    ]);

    convex.activityTypes = [];
    rerender(
      <MemoryRouter initialEntries={["/enrichment"]}>
        <EnrichmentPage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByText("No activities yet.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Go to Add activity form" }),
    );
    expect(screen.getByLabelText("Activity name")).toHaveFocus();

    convex.activityTypes = [
      activity({ _id: oldGameId, isArchived: true, name: "Old game" }),
    ];
    rerender(
      <MemoryRouter initialEntries={["/enrichment"]}>
        <EnrichmentPage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Every activity is archived.")).toBeInTheDocument();
    expect(
      screen.getByText(/open the archived activities below/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /log old game now/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore Old game" }),
    ).toBeInTheDocument();
    const archiveSummary = screen
      .getByText("Archived activities (1)")
      .closest("summary");
    expect(archiveSummary).toHaveTextContent("▸");
    expect(
      archiveSummary?.querySelector("[aria-hidden='true']"),
    ).toHaveTextContent("▸");
  });

  it("renders constrained activity rows and creates a normalized Cafe visit", async () => {
    renderPage();

    const tugRow = screen.getByRole("listitem");
    expect(tugRow.querySelector("[aria-hidden='true']")).toHaveClass(
      "w-8",
      "min-w-0",
      "overflow-hidden",
    );
    const logNow = screen.getByRole("button", { name: "Log Tug now" });
    const archive = screen.getByRole("button", { name: "Archive Tug" });
    expect(logNow.parentElement).toHaveClass("grid", "grid-cols-2", "sm:flex");
    expect(logNow).toHaveClass("min-h-11", "whitespace-normal");
    expect(archive).toHaveClass("min-h-11", "whitespace-normal");
    fireEvent.change(screen.getByLabelText("Activity name"), {
      target: { value: "  Cafe visit  " },
    });
    fireEvent.change(screen.getByLabelText("Emoji (optional)"), {
      target: { value: "  ☕  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));

    await waitFor(() =>
      expect(convex.create).toHaveBeenCalledWith({
        dogId,
        name: "Cafe visit",
        emoji: "☕",
      }),
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Cafe visit added");
    expect(status).toHaveAttribute("aria-atomic", "true");
  });

  it("logs now and at a dog-local backdated time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Log Tug now" }));
    await waitFor(() =>
      expect(convex.logPlay).toHaveBeenCalledWith({
        dogId,
        activityTypeId: tugId,
        at: Date.parse("2026-07-09T12:00:00Z"),
      }),
    );

    fireEvent.change(screen.getByLabelText("Activity"), {
      target: { value: tugId },
    });
    fireEvent.change(screen.getByLabelText("When did play start?"), {
      target: { value: "2026-07-09T10:30" },
    });
    fireEvent.change(screen.getByLabelText("Play note (optional)"), {
      target: { value: "  Calm focus  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log this play" }));

    await waitFor(() =>
      expect(convex.logPlay).toHaveBeenLastCalledWith({
        dogId,
        activityTypeId: tugId,
        at: Date.parse("2026-07-09T10:30:00Z"),
        note: "Calm focus",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Tug logged for Milo");
  });

  it("validates creation and preserves fields for duplicate or limit failures", async () => {
    renderPage();
    const name = screen.getByLabelText("Activity name");
    const emoji = screen.getByLabelText("Emoji (optional)");

    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    expect(name).toHaveFocus();
    expect(screen.getByText("Give the activity a name.")).toBeInTheDocument();

    fireEvent.change(name, { target: { value: "x".repeat(65) } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    expect(name).toHaveFocus();
    expect(screen.getByText("Use 64 characters or fewer.")).toBeInTheDocument();

    fireEvent.change(name, { target: { value: "Cafe visit" } });
    fireEvent.change(emoji, { target: { value: "x".repeat(17) } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    expect(emoji).toHaveFocus();
    expect(screen.getByText("Use 16 characters or fewer.")).toBeInTheDocument();

    fireEvent.change(emoji, { target: { value: "☕" } });
    convex.create.mockRejectedValueOnce(new Error("DUPLICATE_ACTIVITY_TYPE"));
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    const duplicateAlert = await screen.findByRole("alert");
    expect(duplicateAlert).toHaveTextContent("already exists");
    expect(duplicateAlert).toHaveAttribute("aria-atomic", "true");
    expect(name).toHaveValue("Cafe visit");
    expect(emoji).toHaveValue("☕");

    convex.create.mockRejectedValueOnce(new Error("ACTIVITY_TYPE_LIMIT"));
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "100 activities",
    );
    expect(name).toHaveValue("Cafe visit");
  });

  it("confirms archive from reactive data and restores archived activities", async () => {
    let finishArchive!: () => void;
    convex.setArchived.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishArchive = () => resolve(null);
        }),
    );
    convex.activityTypes = [
      activity(),
      activity({ _id: oldGameId, isArchived: true, name: "Old game" }),
    ];
    const { rerender } = renderPage();

    const archive = screen.getByRole("button", { name: "Archive Tug" });
    fireEvent.click(archive);
    const confirmation = screen.getByRole("group", { name: "Archive Tug?" });
    expect(confirmation).toHaveAccessibleDescription(
      "Old logs will keep their activity name.",
    );
    const keep = screen.getByRole("button", { name: "Keep" });
    expect(keep).toHaveFocus();
    fireEvent.click(keep);
    await waitFor(() => expect(archive).toHaveFocus());

    fireEvent.click(archive);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm archive Tug" }),
    );
    expect(
      screen.getByRole("button", { name: "Confirm archive Tug" }),
    ).toHaveTextContent("Archiving…");
    await waitFor(() =>
      expect(convex.setArchived).toHaveBeenCalledWith({
        dogId,
        activityTypeId: tugId,
        isArchived: true,
      }),
    );
    await act(async () => finishArchive());
    expect(
      screen.getByRole("button", { name: "Log Tug now" }),
    ).toBeInTheDocument();

    convex.activityTypes = [
      activity({ isArchived: true }),
      activity({ _id: oldGameId, isArchived: true, name: "Old game" }),
    ];
    rerender(
      <MemoryRouter initialEntries={["/enrichment"]}>
        <EnrichmentPage dog={dog} />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: "Log Tug now" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore Old game" }));
    await waitFor(() =>
      expect(convex.setArchived).toHaveBeenLastCalledWith({
        dogId,
        activityTypeId: oldGameId,
        isArchived: false,
      }),
    );
  });

  it("maps archived races and mutation failures to accessible messages", async () => {
    convex.logPlay.mockRejectedValueOnce(new Error("ACTIVITY_TYPE_ARCHIVED"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Log Tug now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "archived on another device",
    );
    expect(
      screen.getByRole("button", { name: "Log Tug now" }),
    ).toBeInTheDocument();
  });

  it("validates backdated timestamps and notes with focus", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T12:00:00Z"));
    renderPage();
    fireEvent.change(screen.getByLabelText("Activity"), {
      target: { value: tugId },
    });

    fireEvent.click(screen.getByRole("button", { name: "Log this play" }));
    expect(screen.getByLabelText("When did play start?")).toHaveFocus();
    expect(
      screen.getByText("Choose a valid date and time."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("When did play start?"), {
      target: { value: "2026-07-09T12:06" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log this play" }));
    expect(screen.getByLabelText("When did play start?")).toHaveFocus();
    expect(
      screen.getByText("Choose a time no more than 5 minutes in the future."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("When did play start?"), {
      target: { value: "2026-07-09T10:30" },
    });
    fireEvent.change(screen.getByLabelText("Play note (optional)"), {
      target: { value: "x".repeat(501) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log this play" }));
    expect(screen.getByLabelText("Play note (optional)")).toHaveFocus();
    expect(
      screen.getByText("Use 500 characters or fewer."),
    ).toBeInTheDocument();
    expect(convex.logPlay).not.toHaveBeenCalled();
  });

  it("preserves a backdate draft when its activity is archived", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-09T14:00:00Z"));
    convex.activityTypes = [
      activity(),
      activity({ _id: fetchId, emoji: "🎾", name: "Fetch" }),
    ];
    const { rerender } = renderPage();

    fireEvent.change(screen.getByLabelText("Activity"), {
      target: { value: tugId },
    });
    fireEvent.change(screen.getByLabelText("When did play start?"), {
      target: { value: "2026-07-09T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Play note (optional)"), {
      target: { value: "Kept the rope low" },
    });

    convex.activityTypes = [
      activity({ isArchived: true }),
      activity({ _id: fetchId, emoji: "🎾", name: "Fetch" }),
    ];
    rerender(
      <MemoryRouter initialEntries={["/enrichment"]}>
        <EnrichmentPage dog={dog} />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Activity")).toHaveValue("");
    expect(screen.getByLabelText("When did play start?")).toHaveValue(
      "2026-07-09T12:00",
    );
    expect(screen.getByLabelText("Play note (optional)")).toHaveValue(
      "Kept the rope low",
    );

    fireEvent.click(screen.getByRole("button", { name: "Log this play" }));
    expect(screen.getByText("Choose an active activity.")).toBeInTheDocument();
    expect(screen.getByLabelText("Activity")).toHaveFocus();
    expect(convex.logPlay).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Activity"), {
      target: { value: fetchId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log this play" }));

    await waitFor(() =>
      expect(convex.logPlay).toHaveBeenCalledWith({
        dogId,
        activityTypeId: fetchId,
        at: Date.parse("2026-07-09T12:00:00Z"),
        note: "Kept the rope low",
      }),
    );
  });

  it("uses one immediate lock for repeated and mixed mutations", async () => {
    let finish!: () => void;
    convex.logPlay.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("event-id");
        }),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText("Activity name"), {
      target: { value: "Cafe visit" },
    });
    const log = screen.getByRole("button", { name: "Log Tug now" });

    fireEvent.click(log);
    fireEvent.click(log);
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));

    expect(convex.logPlay).toHaveBeenCalledTimes(1);
    expect(convex.create).not.toHaveBeenCalled();
    expect(log).toBeDisabled();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");

    await act(async () => finish());
    await waitFor(() => expect(log).toBeEnabled());
  });

  it("renders Slovak actions and status while preserving activity names", async () => {
    await setLocale("sk");
    renderPage();

    const log = screen.getByRole("button", {
      name: "Zaznamenať aktivitu Tug teraz",
    });
    expect(
      screen.getByRole("form", { name: "Vytvoriť vlastnú aktivitu" }),
    ).toBeVisible();
    fireEvent.click(log);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Milo: aktivita „Tug“ bola zaznamenaná.",
    );
    expect(screen.getByRole("heading", { name: "Tug" })).toBeVisible();
  });
});
