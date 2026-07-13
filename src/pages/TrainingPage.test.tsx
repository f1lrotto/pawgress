import {
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
import TrainingPage from "./TrainingPage";

const convex = vi.hoisted(() => ({
  archive: vi.fn(),
  create: vi.fn(),
  detail: undefined as unknown,
  list: undefined as unknown,
  logSession: vi.fn(),
  queryCalls: [] as Array<{ args: unknown; name: string }>,
  update: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "training:create") return convex.create;
    if (name === "training:logSession") return convex.logSession;
    if (name === "training:setArchived") return convex.archive;
    return convex.update;
  },
  useQuery: (reference: unknown, args: unknown) => {
    const name = getFunctionName(reference as never);
    convex.queryCalls.push({ args, name });
    return name === "training:list" ? convex.list : convex.detail;
  },
}));

const dogId = "dog-id" as Id<"dogs">;
const commandId = "command-id" as Id<"trainingCommands">;
const otherCommandId = "other-id" as Id<"trainingCommands">;
const scrollIntoView = vi.fn();
const dog = {
  _id: dogId,
  birthday: "2024-01-15",
  name: "Milo",
  timezone: "UTC",
};
const command = (overrides: Record<string, unknown> = {}) => ({
  _creationTime: 1,
  _id: commandId,
  description: "Come back on cue.",
  dogId,
  howToTrain: "Start indoors with a long line.",
  isArchived: false,
  name: "Recall",
  status: "learning",
  ...overrides,
});
const session = (overrides: Record<string, unknown> = {}) => ({
  _creationTime: 2,
  _id: "session-id",
  at: Date.parse("2026-07-09T10:00:00Z"),
  commandId,
  dogId,
  notes: "Garden practice",
  rating: 4,
  ...overrides,
});
const selectCommand = (overrides: Record<string, unknown> = {}) => {
  const value = command(overrides);
  convex.list = [value];
  convex.detail = { command: value, sessions: [] };
};
const renderAt = (path = "/training") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TrainingPage dog={dog} />
    </MemoryRouter>,
  );

afterEach(cleanup);

beforeEach(async () => {
  await setLocale("en");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  scrollIntoView.mockReset();
  convex.archive.mockReset().mockResolvedValue(null);
  convex.create.mockReset().mockResolvedValue(commandId);
  convex.detail = undefined;
  convex.list = undefined;
  convex.logSession.mockReset().mockResolvedValue("session-id");
  convex.queryCalls = [];
  convex.update.mockReset().mockResolvedValue(null);
  vi.restoreAllMocks();
});

describe("TrainingPage", () => {
  it("queries the bounded command index and shows explicit loading and empty states", () => {
    const view = renderAt();

    const loadingStatus = screen.getByRole("status");
    expect(loadingStatus).toHaveTextContent("Opening the training ledger");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(loadingStatus).toHaveClass("sr-only");
    expect(loadingStatus.nextElementSibling).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(convex.queryCalls).toContainEqual({
      name: "training:list",
      args: { dogId, includeArchived: true, limit: 100 },
    });
    expect(convex.queryCalls).toContainEqual({
      name: "training:get",
      args: "skip",
    });

    convex.list = [];
    view.rerender(
      <MemoryRouter initialEntries={["/training"]}>
        <TrainingPage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByText("No commands yet")).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Create command" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Command name")).toHaveClass("field-control");
    expect(screen.getByRole("button", { name: "Add command" })).toHaveClass(
      "rounded-md",
    );
  });

  it("validates and creates a trimmed command, then selects its URL", async () => {
    convex.list = [];
    const view = renderAt();
    const form = screen.getByRole("form", { name: "Create command" });

    fireEvent.submit(form);
    expect(screen.getByLabelText("Command name")).toHaveFocus();
    expect(screen.getByText("Enter a command name.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Command name"), {
      target: { value: "  Place  " },
    });
    fireEvent.change(screen.getByLabelText("Command description"), {
      target: { value: "  Settle on the mat.  " },
    });
    fireEvent.change(screen.getByLabelText("How to train"), {
      target: { value: "  Reward calm stays.  " },
    });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(convex.create).toHaveBeenCalledWith({
        dogId,
        name: "Place",
        description: "Settle on the mat.",
        howToTrain: "Reward calm stays.",
      }),
    );
    const created = command({ name: "Place" });
    convex.list = [created];
    convex.detail = { command: created, sessions: [] };
    view.rerender(
      <MemoryRouter initialEntries={["/training"]}>
        <TrainingPage dog={dog} />
      </MemoryRouter>,
    );
    expect(convex.queryCalls).toContainEqual({
      name: "training:get",
      args: { dogId, commandId, sessionLimit: 100 },
    });
  });

  it("links selection to the detail anchor, loads bounded detail, and reveals it", async () => {
    selectCommand();
    renderAt();
    const link = screen.getByRole("link", {
      name: "Open Recall · Learning",
    });
    expect(link).toHaveAttribute(
      "href",
      `/training?command=${commandId}#command-detail`,
    );

    fireEvent.click(link);

    await waitFor(() =>
      expect(convex.queryCalls).toContainEqual({
        name: "training:get",
        args: { dogId, commandId, sessionLimit: 100 },
      }),
    );
    expect(screen.getByRole("heading", { name: "Recall" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Come back on cue.")).toBeInTheDocument();
    const detail = document.getElementById("command-detail");
    expect(detail).toHaveAttribute("tabindex", "-1");
    expect(detail).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("keeps long command names readable in touch-sized linked rows", () => {
    const longName = "Reliable recall around every distracting Bratislava dog";
    selectCommand({ name: longName });
    renderAt();

    const link = screen.getByRole("link", {
      name: `Open ${longName} · Learning`,
    });
    expect(link).toHaveAttribute(
      "href",
      `/training?command=${commandId}#command-detail`,
    );
    expect(link).toHaveClass("min-h-11");
    expect(within(link).getByText(longName)).toHaveClass(
      "[overflow-wrap:anywhere]",
    );
    expect(within(link).getByText(longName)).not.toHaveClass("truncate");
  });

  it("wraps a long selected command name in the restrained detail panel", () => {
    const longName = "Reliable recall around every distracting Bratislava dog";
    selectCommand({ name: longName });
    renderAt(`/training?command=${commandId}`);

    expect(screen.getByRole("heading", { name: longName })).toHaveClass(
      "[overflow-wrap:anywhere]",
    );
    expect(document.getElementById("command-detail")).toHaveClass("rounded-xl");
  });

  it("shows loading for a valid selected command", () => {
    convex.list = [command()];
    renderAt(`/training?command=${commandId}`);
    expect(screen.getByRole("status")).toHaveTextContent("Opening Recall");
    expect(convex.queryCalls).toContainEqual({
      name: "training:get",
      args: { dogId, commandId, sessionLimit: 100 },
    });
  });

  it("keeps empty detail compact on mobile with height reserved for desktop", () => {
    convex.list = [];
    renderAt();

    const empty = screen.getByRole("heading", {
      name: "Choose a command",
    }).parentElement?.parentElement;
    expect(empty).toHaveClass("py-12", "lg:min-h-80");
    expect(empty).not.toHaveClass("min-h-[28rem]");
    expect(document.getElementById("command-detail")).not.toHaveClass(
      "min-h-[34rem]",
    );
  });

  it.each([otherCommandId, "not-a-convex-id"])(
    "shows not found and skips detail for stale or malformed command %s",
    (value) => {
      convex.list = [command()];
      convex.detail = undefined;
      renderAt(`/training?command=${value}`);
      expect(screen.getByText("Command not found")).toBeInTheDocument();
      expect(convex.queryCalls.at(-1)).toEqual({
        name: "training:get",
        args: "skip",
      });
    },
  );

  it("edits the command notes and supports every status payload", async () => {
    selectCommand();
    renderAt(`/training?command=${commandId}`);

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  Fast return.  " },
    });
    fireEvent.change(screen.getByLabelText("Training plan"), {
      target: { value: "  Add park distractions.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save command" }));
    await waitFor(() =>
      expect(convex.update).toHaveBeenCalledWith({
        dogId,
        commandId,
        description: "Fast return.",
        howToTrain: "Add park distractions.",
      }),
    );

    for (const [label, status] of [
      ["Learning", "learning"],
      ["Solid", "solid"],
      ["Mastered", "mastered"],
    ] as const) {
      fireEvent.click(
        screen.getByRole("button", { name: `Set status ${label}` }),
      );
      await waitFor(() =>
        expect(convex.update).toHaveBeenCalledWith({
          dogId,
          commandId,
          status,
        }),
      );
    }
  });

  it("logs now or a dog-timezone backdate and renders newest sessions first", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:34:56Z"));
    const value = command();
    convex.list = [value];
    convex.detail = {
      command: value,
      sessions: [
        session({
          _id: "new",
          at: Date.parse("2026-07-10T11:00:00Z"),
          notes: "New",
          rating: 5,
        }),
        session({
          _id: "old",
          at: Date.parse("2026-07-08T11:00:00Z"),
          notes: "Old",
          rating: 2,
        }),
      ],
    };
    renderAt(`/training?command=${commandId}`);
    const history = screen.getByRole("list", { name: "Training sessions" });
    expect(
      within(history)
        .getAllByText(/New|Old/)
        .map(({ textContent }) => textContent),
    ).toEqual(["New", "Old"]);

    fireEvent.click(screen.getByRole("radio", { name: "Positive" }));
    fireEvent.change(screen.getByLabelText("Session notes"), {
      target: { value: "  Great focus.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log session" }));
    await waitFor(() =>
      expect(convex.logSession).toHaveBeenCalledWith({
        dogId,
        commandId,
        at: Date.parse("2026-07-10T12:34:56Z"),
        rating: 5,
        notes: "Great focus.",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Choose another time" }),
    );
    fireEvent.change(screen.getByLabelText("Session date and time"), {
      target: { value: "2026-07-09T09:15" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Neutral" }));
    fireEvent.click(screen.getByRole("button", { name: "Log session" }));
    await waitFor(() =>
      expect(convex.logSession).toHaveBeenCalledWith({
        dogId,
        commandId,
        at: Date.parse("2026-07-09T09:15:00Z"),
        rating: 3,
      }),
    );
  });

  it("maps every legacy rating to a semantic history label", () => {
    const value = command();
    convex.list = [value];
    convex.detail = {
      command: value,
      sessions: [1, 2, 3, 4, 5].map((rating) =>
        session({
          _id: `session-${rating}`,
          at: Date.parse(`2026-07-0${rating}T10:00:00Z`),
          notes: undefined,
          rating,
        }),
      ),
    };
    renderAt(`/training?command=${commandId}`);

    const history = screen.getByRole("list", { name: "Training sessions" });
    expect(within(history).getAllByLabelText("Negative rating")).toHaveLength(
      2,
    );
    expect(within(history).getAllByLabelText("Neutral rating")).toHaveLength(1);
    expect(within(history).getAllByLabelText("Positive rating")).toHaveLength(
      2,
    );
    expect(history).not.toHaveTextContent("/5");
  });

  it("keeps long multiline session notes readable in divided history", () => {
    const notes = `First line\n${"focused".repeat(60)}`;
    const value = command();
    convex.list = [value];
    convex.detail = {
      command: value,
      sessions: [session({ notes, rating: 4 })],
    };
    renderAt(`/training?command=${commandId}`);

    const history = screen.getByRole("list", { name: "Training sessions" });
    expect(history).toHaveClass("divide-y");
    const note = within(history).getByText(/First line/);
    expect(note.textContent).toBe(notes);
    expect(note).toHaveClass("whitespace-pre-wrap", "[overflow-wrap:anywhere]");
    expect(screen.getByLabelText("Positive rating")).toHaveTextContent(
      "Positive",
    );
    expect(screen.getByLabelText("Positive rating")).not.toHaveClass(
      "rounded-full",
    );
  });

  it("does not carry a session draft between commands", async () => {
    const recall = command();
    const stay = command({ _id: otherCommandId, name: "Stay" });
    convex.list = [recall, stay];
    convex.detail = { command: recall, sessions: [] };
    renderAt(`/training?command=${commandId}`);

    fireEvent.click(screen.getByRole("radio", { name: "Positive" }));
    fireEvent.change(screen.getByLabelText("Session notes"), {
      target: { value: "Recall draft" },
    });
    convex.detail = { command: stay, sessions: [] };
    fireEvent.click(screen.getByRole("link", { name: "Open Stay · Learning" }));

    await waitFor(() =>
      expect(convex.queryCalls).toContainEqual({
        name: "training:get",
        args: { dogId, commandId: otherCommandId, sessionLimit: 100 },
      }),
    );
    expect(screen.getByRole("group", { name: "Session rating" })).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    for (const rating of screen.getAllByRole("radio")) {
      expect(rating).not.toBeChecked();
    }
    expect(screen.getByLabelText("Session notes")).toHaveValue("");
  });

  it("confirms archive, keeps history readable, and restores the command", async () => {
    selectCommand();
    const view = renderAt(`/training?command=${commandId}`);

    const archiveButton = screen.getByRole("button", {
      name: "Archive command",
    });
    expect(archiveButton).toHaveAttribute("aria-expanded", "false");
    expect(archiveButton).toHaveAttribute(
      "aria-controls",
      "archive-confirmation",
    );
    fireEvent.click(archiveButton);
    expect(archiveButton).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("archive-confirmation")).toBeInTheDocument();
    expect(screen.getByText("Archive Recall?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await waitFor(() =>
      expect(convex.archive).toHaveBeenCalledWith({
        dogId,
        commandId,
        isArchived: true,
      }),
    );

    const archived = command({ isArchived: true });
    convex.list = [archived];
    convex.detail = { command: archived, sessions: [session()] };
    view.rerender(
      <MemoryRouter initialEntries={[`/training?command=${commandId}`]}>
        <TrainingPage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Archived · history only")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Recall · Archived" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Negative" })).toBeDisabled();
    expect(screen.getByText("Garden practice")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore command" }));
    await waitFor(() =>
      expect(convex.archive).toHaveBeenCalledWith({
        dogId,
        commandId,
        isArchived: false,
      }),
    );
  });

  it("validates all field bounds before mutations", () => {
    selectCommand();
    renderAt(`/training?command=${commandId}`);

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "x".repeat(1_001) },
    });
    fireEvent.change(screen.getByLabelText("Training plan"), {
      target: { value: "x".repeat(2_001) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save command" }));
    expect(
      screen.getByText("Use 1000 characters or fewer."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Use 2000 characters or fewer."),
    ).toBeInTheDocument();
    expect(convex.update).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Session notes"), {
      target: { value: "x".repeat(501) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log session" }));
    expect(
      screen.getByText("Choose Negative, Neutral, or Positive."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Use 500 characters or fewer."),
    ).toBeInTheDocument();
    expect(convex.logSession).not.toHaveBeenCalled();
  });

  it("renders long working notes with shared edit controls", () => {
    const name = "N".repeat(64);
    const description = `First line\n${"d".repeat(989)}`;
    const howToTrain = `Start calmly\n${"p".repeat(1_987)}`;
    selectCommand({ description, howToTrain, name });
    renderAt(`/training?command=${commandId}`);

    for (const [label, value] of [
      ["Name", name],
      ["Description", description],
      ["Training plan", howToTrain],
    ]) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveValue(value);
      expect(field).toHaveClass("field-control");
    }
    expect(screen.getByRole("button", { name: "Save command" })).toHaveClass(
      "rounded-md",
    );
  });

  it("maps backend failures and uses one synchronous lock across operations", async () => {
    selectCommand();
    let finish!: () => void;
    convex.create.mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve(commandId))),
    );
    renderAt(`/training?command=${commandId}`);
    fireEvent.change(screen.getByLabelText("Command name"), {
      target: { value: "Place" },
    });
    const createForm = screen.getByRole("form", { name: "Create command" });
    fireEvent.submit(createForm);
    fireEvent.submit(createForm);
    fireEvent.click(screen.getByRole("button", { name: "Set status Solid" }));
    expect(convex.create).toHaveBeenCalledTimes(1);
    expect(convex.update).not.toHaveBeenCalled();
    expect(createForm).toHaveAttribute("aria-busy", "true");

    finish();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Command created",
    );

    convex.create.mockRejectedValueOnce(new Error("DUPLICATE_COMMAND"));
    fireEvent.change(screen.getByLabelText("Command name"), {
      target: { value: "Place" },
    });
    fireEvent.submit(createForm);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An active command already uses that name.",
    );
  });

  it("replaces pristine fields from reactive query updates", () => {
    selectCommand();
    const view = renderAt(`/training?command=${commandId}`);
    expect(screen.getByDisplayValue("Come back on cue.")).toBeInTheDocument();

    const changed = command({
      description: "Reliable around dogs.",
      status: "solid",
    });
    convex.list = [changed];
    convex.detail = { command: changed, sessions: [] };
    view.rerender(
      <MemoryRouter initialEntries={[`/training?command=${commandId}`]}>
        <TrainingPage dog={dog} />
      </MemoryRouter>,
    );
    expect(
      screen.getByDisplayValue("Reliable around dogs."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set status Solid" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Save command" })).toBeDisabled();
  });

  it("preserves a dirty edit across same-command updates, then releases it after save", async () => {
    selectCommand();
    const view = renderAt(`/training?command=${commandId}`);
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Unsaved handler note" },
    });

    const changed = command({
      description: "Server update",
      howToTrain: "Remote long-line plan",
      name: "Recall here",
      status: "solid",
    });
    convex.list = [changed];
    convex.detail = { command: changed, sessions: [] };
    view.rerender(
      <MemoryRouter initialEntries={[`/training?command=${commandId}`]}>
        <TrainingPage dog={dog} />
      </MemoryRouter>,
    );
    expect(
      screen.getByDisplayValue("Unsaved handler note"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Recall here")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Remote long-line plan"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set status Solid" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Save command" }));
    await waitFor(() =>
      expect(convex.update).toHaveBeenCalledWith({
        dogId,
        commandId,
        description: "Unsaved handler note",
      }),
    );
    const saved = command({ description: "Saved by server", status: "solid" });
    convex.list = [saved];
    convex.detail = { command: saved, sessions: [] };
    view.rerender(
      <MemoryRouter initialEntries={[`/training?command=${commandId}`]}>
        <TrainingPage dog={dog} />
      </MemoryRouter>,
    );
    expect(screen.getByDisplayValue("Saved by server")).toBeInTheDocument();
  });

  it("renders Slovak status ARIA and a localized validation date", async () => {
    await setLocale("sk");
    const value = command({ status: "solid" });
    convex.list = [value];
    convex.detail = {
      command: value,
      sessions: [session({ rating: 4 })],
    };
    renderAt(`/training?command=${commandId}`);

    const selectedStatus = screen.getByRole("button", {
      name: "Nastaviť stav Spoľahlivý",
    });
    expect(selectedStatus).toHaveAttribute("aria-pressed", "true");
    expect(selectedStatus).toHaveClass("whitespace-normal", "rounded-md");
    expect(
      screen.getByRole("link", {
        name: "Otvoriť povel Recall · Spoľahlivý",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Hodnotenie: Pozitívne")).toHaveTextContent(
      "Pozitívne",
    );
    expect(screen.getByRole("heading", { name: "Recall" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Vybrať iný čas" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pozitívne" }));
    fireEvent.change(screen.getByLabelText("Dátum a čas tréningu"), {
      target: { value: "2024-01-14T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Zaznamenať tréning" }));

    expect(
      screen.getByText("Vyberte dátum 15. 1. 2024 alebo neskorší."),
    ).toBeVisible();
  });
});
