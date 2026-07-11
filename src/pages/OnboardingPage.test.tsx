import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "@/i18n";
import OnboardingPage from "./OnboardingPage";

const convex = vi.hoisted(() => ({ complete: vi.fn(), redeemInvite: vi.fn() }));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) =>
    convex[
      getFunctionName(reference as never).split(":")[1] as
        "complete" | "redeemInvite"
    ],
}));

afterEach(cleanup);
beforeEach(async () => {
  await setLocale("en");
  convex.complete.mockReset();
  convex.complete.mockResolvedValue("dog-id");
  convex.redeemInvite.mockReset();
  convex.redeemInvite.mockResolvedValue("shared-dog-id");
});

const enterPuppy = (name = "Zoe", birthday = "2024-01-15") => {
  fireEvent.change(screen.getByLabelText("Puppy name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Birthday"), {
    target: { value: birthday },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
};

const reachMeals = (weight = "4.25", name = "Zoe") => {
  render(<OnboardingPage />);
  enterPuppy(name);
  fireEvent.change(screen.getByLabelText("Current weight"), {
    target: { value: weight },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
};

const dispatchBeforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("OnboardingPage", () => {
  it("offers the shared invite form before puppy setup begins", () => {
    render(<OnboardingPage />);

    expect(
      screen.getByRole("form", { name: "Join with an invite code" }),
    ).toBeInTheDocument();
    enterPuppy();
    expect(
      screen.queryByRole("form", { name: "Join with an invite code" }),
    ).not.toBeInTheDocument();
  });

  it("guards reloads only after the user changes setup data", async () => {
    render(<OnboardingPage />);

    expect(dispatchBeforeUnload()).toBe(false);
    fireEvent.change(screen.getByLabelText("Puppy name"), {
      target: { value: "Zoe" },
    });

    await waitFor(() => expect(dispatchBeforeUnload()).toBe(true));
  });

  it("blocks invalid puppy details and focuses the first field", () => {
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Enter your puppy's name.")).toBeInTheDocument();
    expect(screen.getByText("Choose a valid birthday.")).toBeInTheDocument();
    expect(screen.getByLabelText("Puppy name")).toHaveFocus();
    expect(
      screen.getByRole("heading", { name: "Tell us about your puppy." }),
    ).toBeInTheDocument();
  });

  it("rejects a future birthday", () => {
    render(<OnboardingPage />);

    enterPuppy("Zoe", "2999-01-01");

    expect(
      screen.getByText("Birthday can't be in the future."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Birthday")).toHaveFocus();
  });

  it("requires a positive weight and accepts a decimal", () => {
    render(<OnboardingPage />);
    enterPuppy();
    const weight = screen.getByLabelText("Current weight");
    const unitHint = screen.getByText("Weight is entered in kilograms.");

    expect(unitHint).toHaveAttribute("id", "weight-unit");
    expect(weight).toHaveAttribute("aria-describedby", "weight-unit");

    fireEvent.change(weight, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("Enter a weight greater than zero."),
    ).toBeInTheDocument();
    expect(weight).toHaveAttribute(
      "aria-describedby",
      "weight-unit weight-error",
    );
    expect(weight).toHaveFocus();

    fireEvent.change(weight, { target: { value: "4.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "When do meals happen?" }),
    ).toHaveFocus();
  });

  it("enforces the backend name and weight ceilings", () => {
    render(<OnboardingPage />);
    enterPuppy("A".repeat(65));
    expect(screen.getByText("Use 64 characters or fewer.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Puppy name"), {
      target: { value: "Zoe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Current weight"), {
      target: { value: "500.01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("Weight must be 500 kg or less."),
    ).toBeInTheDocument();
    expect(convex.complete).not.toHaveBeenCalled();
  });

  it("preserves values when moving back", () => {
    reachMeals();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Current weight")).toHaveValue(4.25);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Puppy name")).toHaveValue("Zoe");
    expect(screen.getByLabelText("Birthday")).toHaveValue("2024-01-15");
  });

  it("marks the active step semantically", () => {
    render(<OnboardingPage />);
    const progress = screen.getByRole("list", { name: "Setup progress" });
    const steps = within(progress).getAllByRole("listitem");

    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).not.toHaveAttribute("aria-current");

    enterPuppy();
    expect(steps[0]).not.toHaveAttribute("aria-current");
    expect(steps[0]).toHaveTextContent("Completed");
    expect(within(steps[0]).getByText("✓")).toBeInTheDocument();
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByRole("heading", { name: "Add a starting point." }),
    ).toHaveFocus();
  });

  it("adds and removes meals while enforcing the eight-meal bound", () => {
    reachMeals();

    expect(screen.getAllByLabelText("Meal name")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Remove meal 1" }),
    ).toBeDisabled();

    const add = screen.getByRole("button", { name: "Add another meal" });
    fireEvent.click(add);
    expect(screen.getAllByLabelText("Meal name")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove meal 2" }));
    expect(screen.getAllByLabelText("Meal name")).toHaveLength(1);

    for (let index = 0; index < 7; index += 1) fireEvent.click(add);
    expect(screen.getAllByLabelText("Meal name")).toHaveLength(8);
    expect(
      screen.getByRole("button", { name: "Eight meal limit reached" }),
    ).toBeDisabled();
  });

  it("validates duplicate names, label length, and meal time", () => {
    reachMeals();
    fireEvent.click(screen.getByRole("button", { name: "Add another meal" }));
    const names = screen.getAllByLabelText("Meal name");
    const times = screen.getAllByLabelText("Time");

    fireEvent.change(names[1], { target: { value: " breakfast " } });
    fireEvent.change(times[1], { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(screen.getAllByText("Meal names must be unique.")).toHaveLength(2);

    fireEvent.change(names[0], { target: { value: "A".repeat(65) } });
    fireEvent.change(times[0], { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(screen.getByText("Use 64 characters or fewer.")).toBeInTheDocument();
    expect(screen.getByText("Choose a valid time.")).toBeInTheDocument();
  });

  it("sends a normalized payload to the onboarding mutation", async () => {
    reachMeals("4.25", "  Zoe  ");
    fireEvent.click(screen.getByRole("button", { name: "Add another meal" }));
    const names = screen.getAllByLabelText("Meal name");
    const times = screen.getAllByLabelText("Time");
    fireEvent.change(names[1], { target: { value: "  Early meal  " } });
    fireEvent.change(times[1], { target: { value: "06:00" } });

    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() =>
      expect(convex.complete).toHaveBeenCalledWith({
        birthday: "2024-01-15",
        mealRoutines: [
          { label: "Early meal", timeOfDay: "06:00" },
          { label: "Breakfast", timeOfDay: "07:30" },
        ],
        name: "Zoe",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        weightKg: 4.25,
      }),
    );
  });

  it("locks every control and prevents duplicate submissions", async () => {
    let finish!: () => void;
    convex.complete.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve("dog-id");
        }),
    );
    reachMeals();
    const submit = screen.getByRole("button", { name: "Finish setup" });

    fireEvent.click(submit);
    fireEvent.click(submit);

    const pending = await screen.findByRole("button", {
      name: "Setting up Zoe…",
    });
    expect(convex.complete).toHaveBeenCalledTimes(1);
    expect(pending).toBeDisabled();
    expect(screen.getByLabelText("Meal name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(dispatchBeforeUnload()).toBe(false);

    finish();
    await waitFor(() => expect(pending).not.toBeDisabled());
    expect(dispatchBeforeUnload()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Add another meal" }));
    await waitFor(() => expect(dispatchBeforeUnload()).toBe(true));
  });

  it("retains every value when the backend rejects setup", async () => {
    convex.complete.mockRejectedValue(new Error("Database unavailable"));
    reachMeals("5.75");
    fireEvent.change(screen.getByLabelText("Meal name"), {
      target: { value: "  Morning meal  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save Zoe's setup. Nothing was lost—try again.",
    );
    await waitFor(() => expect(dispatchBeforeUnload()).toBe(true));
    expect(screen.getByLabelText("Meal name")).toHaveValue("  Morning meal  ");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Current weight")).toHaveValue(5.75);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Puppy name")).toHaveValue("Zoe");
    expect(screen.getByLabelText("Birthday")).toHaveValue("2024-01-15");
  });

  it("renders the Slovak wizard, validation, ARIA, and localized default once", async () => {
    await setLocale("sk");
    render(<OnboardingPage />);

    expect(
      screen.getByRole("region", { name: "Nastavenie šteniatka" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Priebeh nastavenia" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Povedzte nám o svojom šteniatku.",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pokračovať" }));
    expect(
      screen.getByText("Zadajte meno svojho šteniatka."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Meno šteniatka")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Meno šteniatka"), {
      target: { value: "Žofka" },
    });
    fireEvent.change(screen.getByLabelText("Dátum narodenia"), {
      target: { value: "2024-01-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pokračovať" }));
    expect(
      screen.getByText("Hmotnosť zadávajte v kilogramoch."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Aktuálna hmotnosť"), {
      target: { value: "4.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pokračovať" }));

    const meal = screen.getByLabelText("Názov jedla");
    expect(meal).toHaveValue("Raňajky");
    expect(
      screen.getByRole("button", { name: "Odstrániť jedlo 1" }),
    ).toBeDisabled();

    await setLocale("en");
    expect(
      screen.getByRole("heading", { name: "When do meals happen?" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Meal name")).toHaveValue("Raňajky");
  });

  it("offers the localized Slovak invite join card", async () => {
    await setLocale("sk");
    render(<OnboardingPage />);

    expect(
      screen.getByRole("heading", { name: "Pripojte sa k zápisníku." }),
    ).toBeInTheDocument();
    const form = screen.getByRole("form", {
      name: "Pripojenie pomocou kódu pozvánky",
    });
    const code = "ABCDEF0123456789ABCDEF0123456789";
    fireEvent.change(screen.getByLabelText("Kód pozvánky"), {
      target: { value: code },
    });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(convex.redeemInvite).toHaveBeenCalledWith({ code }),
    );
  });
});
