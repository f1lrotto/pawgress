import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "@/i18n";
import RuntimeErrorBoundary from "./RuntimeErrorBoundary";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await setLocale("en");
});

describe("RuntimeErrorBoundary", () => {
  it("moves focus to the fallback after a crash", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Broken = () => {
      throw new Error("failure");
    };

    render(
      <RuntimeErrorBoundary>
        <Broken />
      </RuntimeErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("tabindex", "-1");
    expect(alert).toHaveFocus();
  });

  it("replaces a failed subtree with a localized alert and retries it", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let shouldThrow = true;
    const Child = () => {
      if (shouldThrow) throw new Error("private failure detail");
      return <p>Notebook restored</p>;
    };

    render(
      <RuntimeErrorBoundary>
        <Child />
      </RuntimeErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("We couldn't open your notebook");
    expect(alert).not.toHaveTextContent("private failure detail");

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Notebook restored")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses the active Slovak locale", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await setLocale("sk");
    const Broken = () => {
      throw new Error("failure");
    };

    render(
      <RuntimeErrorBoundary>
        <Broken />
      </RuntimeErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nepodarilo sa otvoriť váš zápisník",
    );
    expect(
      screen.getByRole("button", { name: "Skúsiť znova" }),
    ).toBeInTheDocument();
  });
});
