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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { setLocale } from "@/i18n";
import BodyMetricsPanel from "./BodyMetricsPanel";

const convex = vi.hoisted(() => ({
  create: vi.fn(),
  metrics: [] as unknown[] | undefined,
  queryCalls: [] as Array<{ name: string; args: unknown }>,
  remove: vi.fn(),
  update: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: unknown, args: unknown) => {
    convex.queryCalls.push({ name: getFunctionName(reference as never), args });
    return convex.metrics;
  },
  useMutation: (reference: unknown) => {
    const name = getFunctionName(reference as never).split(":")[1];
    return convex[name as "create" | "remove" | "update"];
  },
}));

const dogId = "dog-id" as Id<"dogs">;
const dog = {
  _id: dogId,
  name: "Milo",
  birthday: "2024-07-10",
  timezone: "UTC",
};
const metric = (
  id: string,
  at: number,
  values: Record<string, unknown> = {},
) => ({
  _id: id,
  _creationTime: at,
  dogId,
  at,
  weightKg: 4.2,
  ...values,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await setLocale("en");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-10T12:00:00Z"));
  convex.create.mockReset();
  convex.create.mockResolvedValue("metric-new");
  convex.metrics = [];
  convex.queryCalls = [];
  convex.remove.mockReset();
  convex.remove.mockResolvedValue(null);
  convex.update.mockReset();
  convex.update.mockResolvedValue(null);
});

describe("BodyMetricsPanel", () => {
  it("uses shared fields and 44px actions", () => {
    render(<BodyMetricsPanel dog={dog} />);
    const form = screen.getByRole("form", { name: "Add body measurement" });
    const weight = within(form).getByLabelText("Weight (kg)");
    const add = within(form).getByRole("button", { name: "Add measurement" });

    expect(weight).toHaveClass("field-control");
    expect(add).toHaveClass("min-h-11", "rounded-md");
    expect(add).not.toHaveClass("rounded-full");
  });

  it("queries bounded recent entries and rolls dog-local age on the 30-second tick", () => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-09T23:59:45.000Z");
    convex.metrics = [
      metric("new", Date.parse("2026-07-09T12:00:00Z"), { weightKg: 5 }),
      metric("old", Date.parse("2026-07-08T12:00:00Z"), { weightKg: 4.8 }),
    ];
    render(<BodyMetricsPanel dog={dog} />);

    expect(convex.queryCalls).toContainEqual({
      name: "bodyMetrics:listRecent",
      args: { dogId, limit: 100 },
    });
    expect(screen.getByText("1 year, 11 months old")).toBeVisible();
    const entries = screen.getAllByRole("article");
    expect(within(entries[0]).getByText("5 kg")).toBeVisible();
    expect(within(entries[1]).getByText("4.8 kg")).toBeVisible();

    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("2 years old")).toBeVisible();
  });

  it("creates at the current time with only entered measurements", async () => {
    const now = Date.parse("2026-07-10T12:00:00Z");
    render(<BodyMetricsPanel dog={dog} />);
    const form = screen.getByRole("form", { name: "Add body measurement" });
    fireEvent.change(within(form).getByLabelText("Weight (kg)"), {
      target: { value: "5.25" },
    });
    fireEvent.change(within(form).getByLabelText("Chest (cm)"), {
      target: { value: "41" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Add measurement" }),
    );

    await waitFor(() =>
      expect(convex.create).toHaveBeenCalledWith({
        dogId,
        at: now,
        weightKg: 5.25,
        chestCm: 41,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Body measurement added.",
    );
    expect(within(form).getByLabelText("Weight (kg)")).toHaveValue(null);
  });

  it("creates a dog-zone backdated measurement", async () => {
    render(
      <BodyMetricsPanel dog={{ ...dog, timezone: "Europe/Bratislava" }} />,
    );
    const form = screen.getByRole("form", { name: "Add body measurement" });
    fireEvent.click(within(form).getByLabelText("Use a different time"));
    fireEvent.change(within(form).getByLabelText("Measurement time"), {
      target: { value: "2026-07-09T07:30" },
    });
    fireEvent.change(within(form).getByLabelText("Neck (cm)"), {
      target: { value: "24" },
    });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(convex.create).toHaveBeenCalledWith({
        dogId,
        at: Date.parse("2026-07-09T05:30:00Z"),
        neckCm: 24,
      }),
    );
  });

  it("validates create values and focuses the first invalid field", () => {
    render(<BodyMetricsPanel dog={dog} />);
    const form = screen.getByRole("form", { name: "Add body measurement" });
    fireEvent.submit(form);
    expect(screen.getByText("Enter at least one measurement.")).toBeVisible();
    expect(within(form).getByLabelText("Weight (kg)")).toHaveFocus();

    fireEvent.change(within(form).getByLabelText("Weight (kg)"), {
      target: { value: "500.01" },
    });
    fireEvent.submit(form);
    expect(
      screen.getByText("Use a value above 0 and at most 500."),
    ).toBeVisible();
    expect(within(form).getByLabelText("Weight (kg)")).toHaveFocus();
    expect(convex.create).not.toHaveBeenCalled();
  });

  it("edits timestamp and values with explicit clearing", async () => {
    convex.metrics = [
      metric("metric-a", Date.parse("2026-07-09T12:00:00Z"), {
        weightKg: 4.2,
        neckCm: 20,
      }),
    ];
    render(<BodyMetricsPanel dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit measurement/ }));
    const form = screen.getByRole("form", { name: "Edit body measurement" });
    fireEvent.change(within(form).getByLabelText("Measurement time"), {
      target: { value: "2026-07-09T13:00" },
    });
    fireEvent.change(within(form).getByLabelText("Weight (kg)"), {
      target: { value: "" },
    });
    fireEvent.change(within(form).getByLabelText("Neck (cm)"), {
      target: { value: "21" },
    });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(convex.update).toHaveBeenCalledWith({
        dogId,
        metricId: "metric-a",
        at: Date.parse("2026-07-09T13:00:00Z"),
        weightKg: null,
        neckCm: 21,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Body measurement updated.",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Edit measurement/ }),
      ).toHaveFocus(),
    );
  });

  it("restores row action focus when inline work is cancelled", async () => {
    convex.metrics = [metric("metric-a", Date.parse("2026-07-09T12:00:00Z"))];
    render(<BodyMetricsPanel dog={dog} />);

    const edit = screen.getByRole("button", { name: /Edit measurement/ });
    fireEvent.click(edit);
    await waitFor(() =>
      expect(screen.getByLabelText("Measurement time")).toHaveFocus(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(edit).toHaveFocus());

    const remove = screen.getByRole("button", {
      name: /Delete measurement/,
    });
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole("button", { name: "Keep measurement" }));
    await waitFor(() => expect(remove).toHaveFocus());
  });

  it("preserves exact timestamp precision unless time is touched", async () => {
    const exactAt = Date.parse("2026-07-09T12:34:56.789Z");
    convex.metrics = [metric("metric-a", exactAt, { weightKg: 4.2 })];
    render(<BodyMetricsPanel dog={dog} />);

    fireEvent.click(screen.getByRole("button", { name: /Edit measurement/ }));
    fireEvent.submit(
      screen.getByRole("form", { name: "Edit body measurement" }),
    );
    expect(convex.update).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("form", { name: "Edit body measurement" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Edit measurement/ }));
    const form = screen.getByRole("form", { name: "Edit body measurement" });
    fireEvent.change(within(form).getByLabelText("Weight (kg)"), {
      target: { value: "4.5" },
    });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(convex.update).toHaveBeenCalledWith({
        dogId,
        metricId: "metric-a",
        weightKg: 4.5,
      }),
    );
    expect(convex.update.mock.calls[0][0]).not.toHaveProperty("at");
  });

  it("does not allow an edit to clear the final measurement", () => {
    convex.metrics = [metric("metric-a", 1_800_000, { weightKg: 4.2 })];
    render(<BodyMetricsPanel dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit measurement/ }));
    const form = screen.getByRole("form", { name: "Edit body measurement" });
    fireEvent.change(within(form).getByLabelText("Weight (kg)"), {
      target: { value: "" },
    });
    fireEvent.submit(form);

    expect(screen.getByText("Keep at least one measurement.")).toBeVisible();
    expect(within(form).getByLabelText("Weight (kg)")).toHaveFocus();
    expect(convex.update).not.toHaveBeenCalled();
  });

  it("requires delete confirmation and removes idempotently", async () => {
    convex.metrics = [metric("metric-a", 1_800_000)];
    render(<BodyMetricsPanel dog={dog} />);
    fireEvent.click(screen.getByRole("button", { name: /Delete measurement/ }));
    expect(screen.getByText("Delete this body measurement?")).toBeVisible();
    expect(convex.remove).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm delete measurement" }),
    );

    await waitFor(() =>
      expect(convex.remove).toHaveBeenCalledWith({
        dogId,
        metricId: "metric-a",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Body measurement deleted.",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Recent entries" }),
      ).toHaveFocus(),
    );
  });

  it("focuses the next logical row after a successful delete", async () => {
    convex.metrics = [
      metric("metric-a", Date.parse("2026-07-09T12:00:00Z")),
      metric("metric-b", Date.parse("2026-07-08T12:00:00Z")),
    ];
    render(<BodyMetricsPanel dog={dog} />);
    const rows = screen.getAllByRole("article");

    fireEvent.click(
      within(rows[0]).getByRole("button", { name: /Delete measurement/ }),
    );
    fireEvent.click(
      within(rows[0]).getByRole("button", {
        name: "Confirm delete measurement",
      }),
    );

    await waitFor(() =>
      expect(convex.remove).toHaveBeenCalledWith({
        dogId,
        metricId: "metric-a",
      }),
    );
    await waitFor(() => expect(rows[1]).toHaveFocus());
  });

  it("locks repeated and cross-operation mutations synchronously", async () => {
    let resolveCreate!: () => void;
    convex.create.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    convex.metrics = [metric("metric-a", 1_800_000)];
    render(<BodyMetricsPanel dog={dog} />);
    const form = screen.getByRole("form", { name: "Add body measurement" });
    fireEvent.change(within(form).getByLabelText("Weight (kg)"), {
      target: { value: "5" },
    });
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(convex.create).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("region", { name: "Body measurements" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", { name: /Edit measurement/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Delete measurement/ }),
    ).toBeDisabled();

    resolveCreate();
    await waitFor(() => expect(screen.getByRole("status")).toBeVisible());
  });

  it("keeps a failed keyed edit draft attached across reactive list swaps", async () => {
    convex.update.mockRejectedValueOnce(new Error("network"));
    const first = metric("metric-a", Date.parse("2026-07-09T12:00:00Z"), {
      weightKg: 4.2,
    });
    const second = metric("metric-b", Date.parse("2026-07-08T12:00:00Z"), {
      weightKg: 6,
    });
    convex.metrics = [first, second];
    const { rerender } = render(<BodyMetricsPanel dog={dog} />);
    const firstRow = screen.getAllByRole("article")[0];
    fireEvent.click(within(firstRow).getByRole("button", { name: /Edit/ }));
    const form = screen.getByRole("form", { name: "Edit body measurement" });
    fireEvent.change(within(form).getByLabelText("Weight (kg)"), {
      target: { value: "9" },
    });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn't update",
    );
    expect(within(form).getByLabelText("Weight (kg)")).toHaveValue(9);

    convex.metrics = [second, { ...first, weightKg: 4.4 }];
    rerender(<BodyMetricsPanel dog={dog} />);
    const preserved = screen.getByRole("form", {
      name: "Edit body measurement",
    });
    expect(within(preserved).getByLabelText("Weight (kg)")).toHaveValue(9);
    expect(
      within(preserved).getByRole("button", { name: "Save changes" }),
    ).toBeVisible();
  });

  it("shows local loading and empty states in a shrink-safe panel", () => {
    convex.metrics = undefined;
    const { rerender } = render(<BodyMetricsPanel dog={dog} />);
    const panel = screen.getByRole("region", { name: "Body measurements" });
    expect(panel).toHaveClass("min-w-0");
    expect(screen.getByText("Loading body measurements…")).toHaveAttribute(
      "role",
      "status",
    );

    convex.metrics = [];
    const longName = "M".repeat(300);
    rerender(<BodyMetricsPanel dog={{ ...dog, name: longName }} />);
    expect(
      screen.getByText(
        "No measurements yet. Use the form to add weight or body measurements.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: `${longName}’s body measurements`,
      }),
    ).toHaveClass("[overflow-wrap:anywhere]");
  });

  it("renders Slovak age, fields, ARIA, dates, decimals, and validation", async () => {
    await setLocale("sk");
    convex.metrics = [
      metric("metric-a", Date.parse("2026-07-09T12:00:00Z"), {
        weightKg: 4.2,
      }),
    ];
    render(<BodyMetricsPanel dog={dog} />);

    expect(screen.getByText("Vek: 2 roky")).toBeVisible();
    expect(screen.getByLabelText("Hmotnosť (kg)")).toBeVisible();
    expect(screen.getByText("4,2 kg")).toBeVisible();
    expect(
      screen.getByRole("article", {
        name: /Telesné meranie z 9\. 7\. 2026.*12:00/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /Upraviť meranie z 9\. 7\. 2026.*12:00/,
      }),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("Hmotnosť (kg)"), {
      target: { value: "500.01" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Pridať telesné meranie" }),
    );
    expect(
      screen.getByText("Použite hodnotu väčšiu ako 0 a najviac 500."),
    ).toBeVisible();
  });
});
