import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLocale } from "@/i18n";
import AppFrame from "./AppFrame";

afterEach(cleanup);
beforeEach(async () => {
  await setLocale("en");
});

describe("AppFrame", () => {
  it("offers a skip link before the header and one targeted main landmark", () => {
    render(
      <MemoryRouter>
        <AppFrame dogName="Milo">
          <h1>Today</h1>
        </AppFrame>
      </MemoryRouter>,
    );

    const skipLink = screen.getByRole("link", {
      name: "Skip to main content",
    });
    const header = screen.getByRole("banner");
    const main = screen.getByRole("main");

    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(main).not.toHaveAttribute("aria-busy");
    expect(skipLink.compareDocumentPosition(header)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(header.compareDocumentPosition(main)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("marks the main content as busy while data is loading", () => {
    render(
      <MemoryRouter>
        <AppFrame dogName="Milo" isBusy>
          <h1>Today</h1>
        </AppFrame>
      </MemoryRouter>,
    );

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });
});
