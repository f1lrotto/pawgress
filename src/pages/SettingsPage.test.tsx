import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";
import { DogSelectionProvider } from "@/contexts/DogSelectionContext";
import type { InstallApp } from "@/hooks/useInstallPrompt";
import { setLocale } from "@/i18n";
import SettingsPage from "./SettingsPage";

const convex = vi.hoisted(() => ({
  activeInvite: null as unknown,
  generateInvite: vi.fn(),
  members: [] as unknown[] | undefined,
  queryArgs: [] as { args: unknown; name: string }[],
  redeemInvite: vi.fn(),
  revokeInvite: vi.fn(),
  setLocale: vi.fn(),
  setWaterTracking: vi.fn(),
  user: { name: "Taylor", email: "current@example.com" } as
    { name?: string; email?: string } | undefined,
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) =>
    convex[
      getFunctionName(reference as never).split(":")[1] as
        | "generateInvite"
        | "redeemInvite"
        | "revokeInvite"
        | "setLocale"
        | "setWaterTracking"
    ],
  useQuery: (reference: unknown, args: unknown) => {
    const functionName = getFunctionName(reference as never);
    const name = functionName.split(":")[1];
    convex.queryArgs.push({ args, name });
    if (functionName === "users:current") return convex.user;
    return name === "activeInvite" ? convex.activeInvite : convex.members;
  },
}));

const dogId = "dog-id" as Id<"dogs">;
const dog: Pick<Doc<"dogs">, "_id" | "name" | "waterIntervalMinutes"> = {
  _id: dogId,
  name: "Milo",
};
const selectDog = vi.fn();
const stubClipboard = (writeText: Clipboard["writeText"]) => {
  const { maxTouchPoints, platform, userAgent } = navigator;
  vi.stubGlobal("navigator", {
    clipboard: { writeText },
    maxTouchPoints,
    platform,
    userAgent,
  });
};
const page = (settingsDog = dog, installApp: InstallApp | null = null) => (
  <MemoryRouter initialEntries={["/settings"]}>
    <DogSelectionProvider
      value={{
        activeDogId: settingsDog._id,
        dogs: [settingsDog],
        selectDog,
      }}
    >
      <SettingsPage dog={settingsDog} installApp={installApp} />
    </DogSelectionProvider>
  </MemoryRouter>
);
const renderPage = (settingsDog = dog, installApp: InstallApp | null = null) =>
  render(page(settingsDog, installApp));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await setLocale("en");
  convex.activeInvite = null;
  convex.generateInvite.mockReset();
  convex.generateInvite.mockResolvedValue({
    code: "ABCDEF0123456789ABCDEF0123456789",
    inviteId: "invite-id",
  });
  convex.members = [];
  convex.queryArgs = [];
  convex.redeemInvite.mockReset();
  convex.redeemInvite.mockResolvedValue(dogId);
  convex.revokeInvite.mockReset();
  convex.revokeInvite.mockResolvedValue(null);
  convex.setLocale.mockReset();
  convex.setLocale.mockResolvedValue(null);
  convex.setWaterTracking.mockReset();
  convex.setWaterTracking.mockResolvedValue(null);
  convex.user = { name: "Taylor", email: "current@example.com" };
  selectDog.mockReset();
});

describe("SettingsPage", () => {
  it("lists household members and requests only the active dog", () => {
    convex.members = [
      {
        userId: "owner-id",
        role: "owner",
        name: "Avery",
        email: "avery@example.com",
      },
      { userId: "member-id", role: "member", email: "sam@example.com" },
    ];
    renderPage();

    expect(
      screen.getByRole("heading", { name: "The people in Milo’s notebook." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Avery")).toBeInTheDocument();
    expect(screen.getByText("avery@example.com")).toBeInTheDocument();
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Owner")).toHaveClass("rounded-full");
    expect(screen.getByText("Owner")).not.toHaveClass("uppercase");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(convex.queryArgs).toEqual([
      { args: {}, name: "current" },
      { args: { dogId }, name: "listMembers" },
      { args: { dogId }, name: "activeInvite" },
    ]);
  });

  it("shows household loading and empty states", () => {
    convex.members = undefined;
    const view = renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening the household list…",
    );

    convex.members = [];
    view.rerender(page());
    expect(
      screen.getByText("No household members are listed yet."),
    ).toBeInTheDocument();
  });

  it("enables, configures, and disables shared water tracking", async () => {
    renderPage();
    const enabled = screen.getByRole("checkbox", {
      name: "Track water for Milo",
    });
    const interval = screen.getByRole("combobox", {
      name: "Drink reminder interval",
    });

    expect(enabled).not.toBeChecked();
    expect(interval).toBeDisabled();
    fireEvent.click(enabled);
    fireEvent.change(interval, { target: { value: "120" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save water tracking" }),
    );

    await waitFor(() =>
      expect(convex.setWaterTracking).toHaveBeenCalledWith({
        dogId,
        intervalMinutes: 120,
      }),
    );
    expect(await screen.findByText("Water tracking updated.")).toBeVisible();

    fireEvent.click(enabled);
    fireEvent.click(
      screen.getByRole("button", { name: "Save water tracking" }),
    );
    await waitFor(() =>
      expect(convex.setWaterTracking).toHaveBeenLastCalledWith({
        dogId,
        intervalMinutes: null,
      }),
    );
    expect(
      await screen.findByText(/Existing drink history is still available/),
    ).toBeVisible();
  });

  it("saves and restores a custom water interval", async () => {
    renderPage({ ...dog, waterIntervalMinutes: 47 });

    expect(
      screen.getByRole("combobox", { name: "Drink reminder interval" }),
    ).toHaveValue("custom");
    expect(screen.getByRole("option", { name: "Custom" })).toBeInTheDocument();

    const customInterval = screen.getByRole("spinbutton", {
      name: "Custom interval (minutes)",
    });
    expect(customInterval).toHaveValue(47);
    expect(customInterval).toHaveAttribute("min", "15");
    expect(customInterval).toHaveAttribute("max", "1440");

    fireEvent.change(customInterval, { target: { value: "75" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save water tracking" }),
    );

    await waitFor(() =>
      expect(convex.setWaterTracking).toHaveBeenCalledWith({
        dogId,
        intervalMinutes: 75,
      }),
    );
  });

  it("shows the current account and persists an immediate locked language switch", async () => {
    let finish!: () => void;
    convex.setLocale.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(null);
        }),
    );
    renderPage();

    expect(screen.getByRole("heading", { name: "Your account" })).toBeVisible();
    expect(screen.getByText("current@example.com")).toBeInTheDocument();
    const language = screen.getByRole("combobox", { name: "Language" });
    expect(language).toHaveClass("field-control");

    fireEvent.change(language, { target: { value: "sk" } });
    fireEvent.change(language, { target: { value: "en" } });

    expect(document.documentElement.lang).toBe("sk");
    expect(screen.getByRole("combobox", { name: "Jazyk" })).toBeDisabled();
    await waitFor(() => expect(convex.setLocale).toHaveBeenCalledTimes(1));
    expect(convex.setLocale).toHaveBeenCalledWith({ locale: "sk" });

    finish();
    await waitFor(() =>
      expect(screen.getByText("Jazyk bol uložený.")).toBeInTheDocument(),
    );
  });

  it("shows a real install action only when the browser offers one", async () => {
    const installApp = vi.fn().mockResolvedValue("dismissed" as const);
    renderPage(dog, installApp);

    fireEvent.click(screen.getByRole("button", { name: "Install app" }));

    await waitFor(() => expect(installApp).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        "Installation was cancelled. Your browser can offer it again later.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Install app" }),
    ).not.toBeInTheDocument();
  });

  it("announces install progress and completion", async () => {
    let finish!: () => void;
    const installApp = vi.fn(
      () =>
        new Promise<"accepted">((resolve) => {
          finish = () => resolve("accepted");
        }),
    );
    renderPage(dog, installApp);

    fireEvent.click(screen.getByRole("button", { name: "Install app" }));

    expect(
      screen.getByText("Opening the browser install prompt…").parentElement,
    ).toHaveAttribute("aria-live", "polite");
    expect(
      screen.queryByRole("button", { name: "Install app" }),
    ).not.toBeInTheDocument();

    finish();
    expect(
      await screen.findByText("Finish the installation in your browser."),
    ).toBeInTheDocument();
  });

  it("shows one truthful install error and offers retry", async () => {
    const installApp = vi
      .fn()
      .mockRejectedValueOnce(new Error("browser details"))
      .mockResolvedValueOnce("accepted" as const);
    renderPage(dog, installApp);

    fireEvent.click(screen.getByRole("button", { name: "Install app" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The install prompt couldn't open",
    );
    expect(screen.queryByText("browser details")).not.toBeInTheDocument();
    expect(
      screen.queryByText("This browser can install Pawgress now."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Install app" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Try installation again" }),
    );
    expect(installApp).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByText("Finish the installation in your browser."),
    ).toBeInTheDocument();
  });

  it("gives truthful iOS and unsupported-browser installation guidance", () => {
    const userAgent = vi
      .spyOn(navigator, "userAgent", "get")
      .mockReturnValue("iPhone");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    const view = renderPage();

    expect(
      screen.getByText("In Safari, tap Share, then Add to Home Screen."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Install app" }),
    ).not.toBeInTheDocument();

    userAgent.mockReturnValue("Firefox");
    view.rerender(page());
    expect(
      screen.getByText(/isn't offering app installation right now/i),
    ).toBeInTheDocument();
  });

  it("recognizes the installed display mode without offering installation", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    renderPage(dog, vi.fn());

    expect(
      screen.getByText(
        "Pawgress is already open as an installed app on this device.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Install app" }),
    ).not.toBeInTheDocument();
  });

  it("reverts and focuses a translated alert when language persistence fails", async () => {
    convex.setLocale.mockRejectedValue(new Error("offline details"));
    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "sk" },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("previous language has been restored");
    expect(alert).toHaveFocus();
    expect(alert).toHaveClass(
      "focus:outline-2",
      "focus:outline-offset-2",
      "focus:outline-ring",
    );
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue(
      "en",
    );
    expect(screen.queryByText("offline details")).not.toBeInTheDocument();
  });

  it("renders representative Settings, ARIA, and role copy in Slovak", async () => {
    convex.activeInvite = {
      code: "ABCDEF0123456789ABCDEF0123456789",
      inviteId: "invite-id",
    };
    convex.members = [
      { userId: "owner-id", role: "owner", email: "owner@example.com" },
      { userId: "member-id", role: "member", email: "member@example.com" },
    ];
    await setLocale("sk");
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Nastavenia pre Milo." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Časti zápisníka" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nastavenia" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Vlastník")).toBeInTheDocument();
    expect(screen.getByText("Člen")).toBeInTheDocument();
    expect(screen.getByLabelText("Aktívny kód pozvánky")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Kopírovať kód" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", {
        name: "Pripojenie pomocou kódu pozvánky",
      }),
    ).toBeInTheDocument();
  });

  it("contains maximum unbroken dog, household, and invite content", () => {
    const longDogName = "VeryLongDogName".repeat(16);
    const longName = "VeryLongHouseholdName".repeat(12);
    const longEmail = `${"unbroken".repeat(24)}@example.com`;
    const longDog = { _id: dogId, name: longDogName };
    convex.activeInvite = {
      code: "ABCDEF0123456789ABCDEF0123456789",
      inviteId: "invite-id",
    };
    convex.members = [
      {
        userId: "member-id",
        role: "member",
        name: longName,
        email: longEmail,
      },
    ];
    renderPage(longDog);

    expect(
      screen.getByRole("heading", {
        name: `The people in ${longDogName}’s notebook.`,
      }),
    ).toHaveClass("break-words", "[overflow-wrap:anywhere]");
    expect(
      screen.getByRole("heading", { name: `Settings for ${longDogName}.` }),
    ).toHaveClass("break-words", "[overflow-wrap:anywhere]");
    expect(screen.getByText(longName)).toHaveClass(
      "break-words",
      "[overflow-wrap:anywhere]",
    );
    expect(screen.getByText(longEmail)).toHaveClass(
      "break-words",
      "[overflow-wrap:anywhere]",
    );
    const membersSection = screen
      .getByRole("heading", { name: "Household members" })
      .closest("section");
    expect(membersSection).toHaveClass("min-w-0");
    expect(membersSection?.parentElement).toHaveClass(
      "grid-cols-[minmax(0,1fr)]",
    );

    expect(screen.getByLabelText("Active invite code")).toHaveClass(
      "min-w-0",
      "max-w-full",
    );
    expect(
      screen
        .getByRole("heading", { name: "Join another dog" })
        .closest("section"),
    ).toHaveClass("min-w-0", "grid-cols-[minmax(0,1fr)]");
    expect(
      screen.getByRole("heading", { name: "Join another dog" }),
    ).toHaveClass("text-xl", "font-bold");
  });

  it("renders loading, active, and consumed invite query states", () => {
    convex.activeInvite = undefined;
    const view = renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking for an active invite",
    );
    expect(
      screen.getByRole("button", { name: "Checking invite…" }),
    ).toBeDisabled();

    convex.activeInvite = {
      code: "ABCDEF0123456789ABCDEF0123456789",
      inviteId: "invite-id",
    };
    view.rerender(page());
    const activeCode = screen.getByLabelText("Active invite code");
    expect(activeCode).toHaveValue("ABCDEF0123456789ABCDEF0123456789");
    expect(activeCode).toHaveClass("field-control", "uppercase");

    convex.activeInvite = null;
    view.rerender(page());
    expect(
      screen.queryByLabelText("Active invite code"),
    ).not.toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Create invite code" });
    expect(create).toBeEnabled();
    expect(create).toHaveClass("bg-primary");
  });

  it("copies the active invite under a synchronous pending lock", async () => {
    let finish!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    stubClipboard(writeText);
    convex.activeInvite = {
      code: "ABCDEF0123456789ABCDEF0123456789",
      inviteId: "invite-id",
    };
    renderPage();

    const copy = screen.getByRole("button", { name: "Copy code" });
    fireEvent.click(copy);
    fireEvent.click(copy);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("ABCDEF0123456789ABCDEF0123456789");
    expect(
      screen.getByRole("button", { name: "Copying code…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Revoke invite code" }),
    ).toBeDisabled();

    finish();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Invite code copied.",
    );
    expect(screen.getByRole("button", { name: "Copy code" })).toBeEnabled();
  });

  it("shows a friendly clipboard failure without a fallback or leaked detail", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard details"));
    stubClipboard(writeText);
    convex.activeInvite = {
      code: "ABCDEF0123456789ABCDEF0123456789",
      inviteId: "invite-id",
    };
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't copy the invite code. Try again.",
    );
    expect(screen.queryByText("clipboard details")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeEnabled();
  });

  it("generates under a page-wide synchronous lock and waits for the query", async () => {
    let finish!: () => void;
    convex.generateInvite.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              code: "ABCDEF0123456789ABCDEF0123456789",
              inviteId: "invite-id",
            });
        }),
    );
    const view = renderPage();
    const generate = screen.getByRole("button", { name: "Create invite code" });

    fireEvent.click(generate);
    fireEvent.click(generate);

    expect(convex.generateInvite).toHaveBeenCalledTimes(1);
    expect(convex.generateInvite).toHaveBeenCalledWith({ dogId });
    expect(
      screen.getByRole("button", { name: "Creating invite…" }),
    ).toBeDisabled();

    convex.activeInvite = {
      code: "QUERY000000000000000000000000000",
      inviteId: "invite-id",
    };
    view.rerender(page());
    expect(screen.getByLabelText("Active invite code")).toHaveValue(
      "QUERY000000000000000000000000000",
    );
    expect(
      screen.getByRole("button", { name: "Creating invite…" }),
    ).toBeDisabled();

    finish();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Revoke invite code" }),
      ).toBeEnabled(),
    );
  });

  it("requires confirmation before an idempotent revoke", async () => {
    let finish!: () => void;
    convex.activeInvite = {
      code: "ABCDEF0123456789ABCDEF0123456789",
      inviteId: "invite-id",
    };
    convex.revokeInvite.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(null);
        }),
    );
    const view = renderPage();

    const revoke = screen.getByRole("button", { name: "Revoke invite code" });
    expect(revoke).toHaveClass("border-input");
    fireEvent.click(revoke);
    expect(convex.revokeInvite).not.toHaveBeenCalled();
    expect(
      screen.getByText("This code will stop working immediately."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep code" }));
    expect(
      screen.queryByRole("button", { name: "Confirm revoke" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke invite code" }));
    const confirm = screen.getByRole("button", { name: "Confirm revoke" });
    expect(confirm).toHaveClass("bg-destructive");
    expect(confirm.parentElement).toHaveClass("sm:grid-cols-2");
    expect(confirm.parentElement).not.toHaveClass("grid-cols-2");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(convex.revokeInvite).toHaveBeenCalledTimes(1);
    expect(convex.revokeInvite).toHaveBeenCalledWith({
      dogId,
      inviteId: "invite-id",
    });

    convex.activeInvite = null;
    view.rerender(page());
    expect(
      screen.queryByLabelText("Active invite code"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revoking invite…" }),
    ).toBeDisabled();

    finish();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create invite code" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows operation errors without leaking details", async () => {
    convex.generateInvite.mockRejectedValue(new Error("INVITE_LIMIT details"));
    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Create invite code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "more than one active invite",
    );
    expect(screen.queryByText("INVITE_LIMIT details")).not.toBeInTheDocument();

    convex.activeInvite = {
      code: "ABCDEF0123456789ABCDEF0123456789",
      inviteId: "invite-id",
    };
    convex.revokeInvite.mockRejectedValue(new Error("network details"));
    view.rerender(page());
    fireEvent.click(screen.getByRole("button", { name: "Revoke invite code" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn't revoke this invite code",
    );
    expect(screen.queryByText("network details")).not.toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Join with an invite code" }),
    ).toBeInTheDocument();
  });

  it("resets confirmation when the dog changes", () => {
    convex.activeInvite = {
      code: "ABCDEF0123456789ABCDEF0123456789",
      inviteId: "first-invite",
    };
    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Revoke invite code" }));
    expect(
      screen.getByRole("button", { name: "Confirm revoke" }),
    ).toBeInTheDocument();

    const otherDog = {
      _id: "other-dog" as Id<"dogs">,
      name: "Pepper",
    };
    convex.activeInvite = {
      code: "1234567890ABCDEF1234567890ABCDEF",
      inviteId: "second-invite",
    };
    view.rerender(page(otherDog));
    expect(
      screen.queryByRole("button", { name: "Confirm revoke" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revoke invite code" }),
    ).toBeEnabled();
  });
});
