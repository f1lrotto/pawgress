import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { DogSelectionProvider } from "@/contexts/DogSelectionContext";
import { setLocale } from "@/i18n";
import NotebookHeader from "./NotebookHeader";

afterEach(cleanup);
beforeEach(async () => {
  await setLocale("en");
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NotebookHeader dogName="Milo" />
    </MemoryRouter>,
  );

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">{`${location.pathname}${location.search}`}</span>
  );
}

describe("NotebookHeader", () => {
  it("links the six notebook sections in plan order", () => {
    renderAt("/");
    const navigation = screen.getByRole("navigation", {
      name: "Notebook sections",
    });

    expect(
      within(navigation).getByRole("link", { name: "Today" }),
    ).toHaveAttribute("href", "/");
    expect(
      within(navigation).getByRole("link", { name: "Agenda" }),
    ).toHaveAttribute("href", "/agenda");
    expect(
      within(navigation).getByRole("link", { name: "Timeline" }),
    ).toHaveAttribute("href", "/timeline");
    expect(
      within(navigation).getByRole("link", { name: "Insights" }),
    ).toHaveAttribute("href", "/insights");
    expect(
      within(navigation).getByRole("link", { name: "Enrichment" }),
    ).toHaveAttribute("href", "/enrichment");
    expect(
      within(navigation).getByRole("link", { name: "Training" }),
    ).toHaveAttribute("href", "/training");
    expect(
      within(navigation)
        .getAllByRole("link")
        .map(({ textContent }) => textContent),
    ).toEqual([
      "Today",
      "Agenda",
      "Timeline",
      "Insights",
      "Enrichment",
      "Training",
    ]);
  });

  it.each([
    ["/", "Today"],
    ["/agenda", "Agenda"],
    ["/timeline", "Timeline"],
    ["/insights", "Insights"],
    ["/enrichment", "Enrichment"],
    ["/training", "Training"],
  ])("marks %s as the current section", (path, currentName) => {
    renderAt(path);

    for (const name of [
      "Today",
      "Agenda",
      "Timeline",
      "Insights",
      "Enrichment",
      "Training",
    ]) {
      const link = screen.getByRole("link", { name });
      if (name === currentName)
        expect(link).toHaveAttribute("aria-current", "page");
      else expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("keeps every section visible in a touch-sized mobile navigation", () => {
    renderAt("/");
    const navigation = screen.getByRole("navigation", {
      name: "Notebook sections",
    });

    expect(navigation).not.toHaveClass("overflow-x-auto");
    for (const link of within(navigation).getAllByRole("link")) {
      expect(link).toBeVisible();
      expect(link).toHaveClass("min-h-11");
    }
  });

  it("marks Settings as the current page", () => {
    renderAt("/settings");

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the current dog and exposes keyboard-focusable semantic links", () => {
    renderAt("/");

    expect(screen.getByText("Milo")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    for (const name of [
      "Today",
      "Agenda",
      "Timeline",
      "Insights",
      "Enrichment",
      "Training",
    ]) {
      const link = screen.getByRole("link", { name });
      link.focus();
      expect(link).toHaveFocus();
    }

    const settings = screen.getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "/settings");
    expect(settings).toHaveClass("min-h-11");
    settings.focus();
    expect(settings).toHaveFocus();
  });

  it("keeps a long current dog name available without truncating it", () => {
    const dogName = "Sir Waffles von Bratislava the Third";

    render(
      <MemoryRouter>
        <NotebookHeader dogName={dogName} />
      </MemoryRouter>,
    );

    const identity = screen.getByLabelText(`Current dog: ${dogName}`);
    expect(identity).toHaveTextContent(dogName);
    expect(within(identity).getByText(dogName)).not.toHaveClass("truncate");
  });

  it("selects dogs accessibly while preserving the path and clearing search", () => {
    const miloId = "dog-id" as Id<"dogs">;
    const lunaId = "luna-id" as Id<"dogs">;
    const selectDog = vi.fn();

    render(
      <MemoryRouter initialEntries={["/training?command=old"]}>
        <DogSelectionProvider
          value={{
            activeDogId: miloId,
            dogs: [
              { _id: miloId, name: "Milo" },
              { _id: lunaId, name: "Luna" },
            ],
            selectDog,
          }}
        >
          <NotebookHeader dogName="Milo" />
          <LocationProbe />
        </DogSelectionProvider>
      </MemoryRouter>,
    );

    const selector = screen.getByRole("combobox", { name: "Current dog" });
    expect(selector).toHaveValue(miloId);
    expect(selector).toHaveClass("field-control", "w-full", "min-w-0");
    expect(within(selector).getAllByRole("option")).toHaveLength(2);

    fireEvent.change(selector, { target: { value: lunaId } });

    expect(selectDog).toHaveBeenCalledOnce();
    expect(selectDog).toHaveBeenCalledWith(lunaId);
    expect(screen.getByTestId("location")).toHaveTextContent("/training");
    expect(screen.getByTestId("location")).not.toHaveTextContent("command");
  });

  it("keeps a long selected dog name available in the native selector", () => {
    const dogId = "long-name-id" as Id<"dogs">;
    const dogName = "Sir Waffles von Bratislava the Third";

    render(
      <MemoryRouter>
        <DogSelectionProvider
          value={{
            activeDogId: dogId,
            dogs: [{ _id: dogId, name: dogName }],
            selectDog: vi.fn(),
          }}
        >
          <NotebookHeader dogName={dogName} />
        </DogSelectionProvider>
      </MemoryRouter>,
    );

    const selector = screen.getByRole("combobox", { name: "Current dog" });
    expect(selector).toHaveDisplayValue(dogName);
    expect(selector).not.toHaveClass("max-w-40");
  });

  it("translates navigation and dog controls into Slovak", async () => {
    await setLocale("sk");
    renderAt("/settings");

    expect(
      screen.getByRole("navigation", { name: "Časti zápisníka" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dnes" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Denný plán" })).toHaveAttribute(
      "href",
      "/agenda",
    );
    expect(screen.getByRole("link", { name: "Obohatenie" })).toHaveAttribute(
      "href",
      "/enrichment",
    );
    expect(screen.getByRole("link", { name: "Nastavenia" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByLabelText("Aktuálny pes: Milo")).toBeInTheDocument();
  });
});
