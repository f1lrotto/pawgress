import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { DogSelectionProvider } from "@/contexts/DogSelectionContext";
import { setLocale } from "@/i18n";
import RedeemInviteForm from "./RedeemInviteForm";

const convex = vi.hoisted(() => ({ redeem: vi.fn() }));

vi.mock("convex/react", () => ({
  useMutation: () => convex.redeem,
}));

const dogId = "dog-id" as Id<"dogs">;
const otherDogId = "other-dog-id" as Id<"dogs">;
const validCode = "ABCDEF0123456789ABCDEF0123456789";
const selectDog = vi.fn();
const renderForm = (activeDogId: Id<"dogs"> | null = null) =>
  render(
    <DogSelectionProvider value={{ activeDogId, dogs: [], selectDog }}>
      <RedeemInviteForm />
    </DogSelectionProvider>,
  );

afterEach(cleanup);
beforeEach(async () => {
  await setLocale("en");
  convex.redeem.mockReset();
  convex.redeem.mockResolvedValue(dogId);
  selectDog.mockReset();
});

describe("RedeemInviteForm", () => {
  it("validates and focuses malformed invite codes locally", () => {
    renderForm();
    const input = screen.getByLabelText("Invite code");
    fireEvent.change(input, { target: { value: "too-short" } });
    fireEvent.submit(
      screen.getByRole("form", { name: "Join with an invite code" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter the 32-character invite code.",
    );
    expect(input).toHaveAttribute("aria-describedby", "invite-code-error");
    expect(screen.getByRole("alert")).toHaveAttribute(
      "id",
      "invite-code-error",
    );
    expect(input).toHaveFocus();
    expect(convex.redeem).not.toHaveBeenCalled();
  });

  it("normalizes once, locks synchronously, and selects the redeemed dog", async () => {
    let finish!: () => void;
    convex.redeem.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(dogId);
        }),
    );
    renderForm();
    const form = screen.getByRole("form", { name: "Join with an invite code" });
    fireEvent.change(screen.getByLabelText("Invite code"), {
      target: { value: `  ${validCode.toLowerCase()}  ` },
    });

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(convex.redeem).toHaveBeenCalledTimes(1);
    expect(convex.redeem).toHaveBeenCalledWith({ code: validCode });
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", { name: "Joining notebook…" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Invite code")).toBeDisabled();

    finish();
    await waitFor(() => expect(selectDog).toHaveBeenCalledWith(dogId));
    expect(screen.getByRole("status")).toHaveTextContent("Invite accepted");
    expect(screen.getByRole("status")).toHaveClass("text-success");
    expect(screen.getByLabelText("Invite code")).toHaveValue("");
  });

  it.each([
    ["INVITE_INVALID", "isn't available"],
    ["MEMBER_LIMIT", "household is full"],
    ["DOG_MEMBERSHIP_LIMIT", "maximum number of dog notebooks"],
  ])("turns %s into a friendly error", async (code, message) => {
    convex.redeem.mockRejectedValue(new Error(code));
    renderForm();
    fireEvent.change(screen.getByLabelText("Invite code"), {
      target: { value: validCode },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Join with an invite code" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(code)).not.toBeInTheDocument();
  });

  it("does not let delayed completion override a newer dog choice", async () => {
    let finish!: () => void;
    convex.redeem.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(dogId);
        }),
    );
    const view = renderForm(dogId);
    fireEvent.change(screen.getByLabelText("Invite code"), {
      target: { value: validCode },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Join with an invite code" }),
    );

    view.rerender(
      <DogSelectionProvider
        value={{ activeDogId: otherDogId, dogs: [], selectDog }}
      >
        <RedeemInviteForm />
      </DogSelectionProvider>,
    );
    await act(async () => finish());

    expect(selectDog).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Invite code")).toHaveValue(validCode);
  });

  it("ignores completion after the form unmounts", async () => {
    let finish!: () => void;
    convex.redeem.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(dogId);
        }),
    );
    const view = renderForm(dogId);
    fireEvent.change(screen.getByLabelText("Invite code"), {
      target: { value: validCode },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Join with an invite code" }),
    );

    view.unmount();
    await act(async () => finish());

    expect(selectDog).not.toHaveBeenCalled();
  });

  it("translates the form, validation, and pending state into Slovak", async () => {
    let finish!: () => void;
    convex.redeem.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(dogId);
        }),
    );
    await setLocale("sk");
    renderForm();

    const input = screen.getByLabelText("Kód pozvánky");
    fireEvent.submit(
      screen.getByRole("form", {
        name: "Pripojenie pomocou kódu pozvánky",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("32-znakový");

    fireEvent.change(input, { target: { value: validCode } });
    fireEvent.submit(
      screen.getByRole("form", {
        name: "Pripojenie pomocou kódu pozvánky",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Pripájanie k zápisníku…" }),
    ).toBeDisabled();
    finish();
    await waitFor(() => expect(selectDog).toHaveBeenCalledWith(dogId));
  });
});
