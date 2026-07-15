import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "@/i18n";
import App from "./App";

const auth = vi.hoisted(() => ({
  completeOnboarding: vi.fn(),
  dogs: [] as unknown[] | undefined,
  generateInvite: vi.fn(),
  loadMore: vi.fn(),
  locale: null as "en" | "sk" | null | undefined,
  paginatedArgs: [] as unknown[][],
  persistLocale: vi.fn(),
  queryArgs: [] as unknown[][],
  redeemInvite: vi.fn(),
  state: { isAuthenticated: false, isLoading: false },
  signIn: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: auth.signIn }),
  useConvexAuth: () => auth.state,
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "preferences:setLocale") return auth.persistLocale;
    if (name === "sharing:generateInvite") return auth.generateInvite;
    if (name === "sharing:redeemInvite") return auth.redeemInvite;
    return auth.completeOnboarding;
  },
  usePaginatedQuery: (...args: unknown[]) => {
    auth.paginatedArgs.push(args);
    return {
      isLoading: false,
      loadMore: auth.loadMore,
      results: [],
      status: "Exhausted",
    };
  },
  useQuery: (...args: unknown[]) => {
    auth.queryArgs.push(args);
    const name = getFunctionName(args[0] as never);
    if (name === "dogs:listMine") return auth.dogs;
    if (name === "preferences:current") return auth.locale;
    if (
      name === "activityTypes:list" ||
      name === "bodyMetrics:listRecent" ||
      name === "events:listRecent" ||
      name === "insights:dayRatings" ||
      name === "insights:pottyByHour" ||
      name === "insights:sleepByDay" ||
      name === "insights:walkIntervals" ||
      name === "routines:list" ||
      name === "sharing:listMembers" ||
      name === "training:list" ||
      name === "training:listDay"
    )
      return [];
    if (name === "sharing:activeInvite") return null;
    if (name === "training:get") return undefined;
    if (name === "agenda:get") return null;
    if (name === "walks:active") return null;
    if (name === "events:latestByKind")
      return {
        meal: null,
        pee: null,
        poop: null,
        sleep: null,
        treat: null,
        water: null,
        wake: null,
        walk: null,
      };
    return auth.dogs;
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  if (!document.querySelector('meta[name="description"]')) {
    const description = document.createElement("meta");
    description.name = "description";
    document.head.append(description);
  }
  await setLocale("en");
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
  auth.completeOnboarding.mockReset();
  auth.completeOnboarding.mockResolvedValue("dog-id");
  auth.dogs = [];
  auth.generateInvite.mockReset();
  auth.generateInvite.mockResolvedValue({
    code: "ABCDEF0123456789ABCDEF0123456789",
    inviteId: "invite-id",
  });
  auth.loadMore.mockReset();
  auth.locale = null;
  auth.paginatedArgs = [];
  auth.persistLocale.mockReset();
  auth.persistLocale.mockResolvedValue(null);
  auth.queryArgs = [];
  auth.redeemInvite.mockReset();
  auth.redeemInvite.mockResolvedValue("dog-id");
  auth.state.isAuthenticated = false;
  auth.state.isLoading = false;
  auth.signIn.mockReset();
});

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();

  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}:{navigationType}
    </span>
  );
}

const renderAt = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );

const dog = {
  _id: "dog-id",
  birthday: "2024-01-15",
  name: "Milo",
  timezone: "UTC",
};

const alfie = {
  _id: "alfie-id",
  birthday: "2022-06-12",
  name: "Alfie",
  timezone: "UTC",
};

const luna = {
  _id: "luna-id",
  birthday: "2023-09-03",
  name: "Luna",
  timezone: "UTC",
};

const fillSignIn = () => {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "  PUPPY@example.com " },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "long-enough" },
  });
};

describe("App auth routing", () => {
  it("shows a persistent reconnecting status only while the browser is offline", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderAt("/login");

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(
      "You're offline. Live notebook updates need a connection. Reconnecting…",
    );
    expect(status).toHaveClass("sticky", "top-0");

    online.mockReturnValue(true);
    fireEvent(window, new Event("online"));

    await waitFor(() =>
      expect(
        screen.queryByText(/live notebook updates need a connection/i),
      ).not.toBeInTheDocument(),
    );
  });

  it("protects the dashboard from signed-out users", async () => {
    renderAt();

    expect(
      await screen.findByRole("heading", { name: /keep their day/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /^hello,/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login:REPLACE");
    expect(auth.queryArgs.at(-1)?.[1]).toBe("skip");
  });

  it("shows a stable shell while authentication resolves", () => {
    auth.state.isLoading = true;
    renderAt();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening your notebook",
    );
    expect(
      screen.queryByRole("heading", { name: /keep their day/i }),
    ).not.toBeInTheDocument();
  });

  it("uses the browser locale for signed-out copy and metadata", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["sk-SK"]);
    renderAt("/login");

    expect(
      await screen.findByRole("heading", { name: /majte ich deň/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("sk");
    expect(document.title).toBe("Pawgress");
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      "content",
      expect.stringContaining("denný režim"),
    );
  });

  it("gives an authenticated preference precedence over the browser", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["sk-SK"]);
    auth.dogs = [dog];
    auth.locale = "en";
    auth.state.isAuthenticated = true;
    renderAt();

    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(auth.persistLocale).not.toHaveBeenCalled();
  });

  it("captures the browser install offer and exposes the real prompt in Settings", async () => {
    auth.dogs = [dog];
    auth.locale = "en";
    auth.state.isAuthenticated = true;
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(
      new Event("beforeinstallprompt", { cancelable: true }),
      {
        prompt,
        userChoice: Promise.resolve({ outcome: "accepted" as const }),
      },
    );
    renderAt("/settings");

    fireEvent(window, installEvent);
    fireEvent.click(await screen.findByRole("button", { name: "Install app" }));

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(installEvent.defaultPrevented).toBe(true);
    expect(
      await screen.findByText("Finish the installation in your browser."),
    ).toBeInTheDocument();
  });

  it("does not release authenticated routes before locale resolves", async () => {
    auth.dogs = [dog];
    auth.locale = undefined;
    auth.state.isAuthenticated = true;
    const view = renderAt();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening your notebook",
    );
    expect(
      screen.queryByRole("heading", { name: "Hello, Milo." }),
    ).not.toBeInTheDocument();

    auth.locale = "sk";
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Ahoj, Milo." }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("sk");
  });

  it("persists a legacy browser fallback before releasing routes once", async () => {
    let finish!: () => void;
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["sk-SK"]);
    auth.persistLocale.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(null);
        }),
    );
    auth.dogs = [dog];
    auth.locale = null;
    auth.state.isAuthenticated = true;
    renderAt();

    await waitFor(() =>
      expect(auth.persistLocale).toHaveBeenCalledWith({ locale: "sk" }),
    );
    expect(auth.persistLocale).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "Hello, Milo." }),
    ).not.toBeInTheDocument();

    finish();
    expect(
      await screen.findByRole("heading", { name: "Ahoj, Milo." }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("sk");
  });

  it("shows a truthful retry gate when fallback persistence fails", async () => {
    auth.persistLocale.mockRejectedValueOnce(new Error("offline"));
    auth.dogs = [dog];
    auth.locale = null;
    auth.state.isAuthenticated = true;
    renderAt();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn't save your language preference",
    );
    expect(
      screen.queryByRole("heading", { name: "Hello, Milo." }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();
    expect(auth.persistLocale).toHaveBeenCalledTimes(2);
  });

  it("resets an account locale to the browser language on sign-out", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["sk-SK"]);
    auth.dogs = [dog];
    auth.locale = "en";
    auth.state.isAuthenticated = true;
    const view = renderAt();
    await screen.findByRole("heading", { name: "Hello, Milo." });

    auth.state.isAuthenticated = false;
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /majte ich deň/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("sk");
  });

  it("keeps the branded shell up while the dog query resolves", () => {
    auth.dogs = undefined;
    auth.state.isAuthenticated = true;
    renderAt();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening your notebook",
    );
    expect(auth.queryArgs.at(-1)?.[1]).toEqual({});
  });

  it("routes authenticated users without dogs to onboarding", async () => {
    auth.state.isAuthenticated = true;
    renderAt();

    expect(
      await screen.findByRole("heading", {
        name: "Tell us about your puppy.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/onboarding:REPLACE",
    );
  });

  it("shows the dashboard for authenticated users with a dog", async () => {
    auth.dogs = [dog];
    auth.state.isAuthenticated = true;
    renderAt();

    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Log an activity" }),
    ).toBeInTheDocument();
  });

  it("does not retarget when an earlier-alphabetical dog appears", async () => {
    auth.dogs = [dog];
    auth.state.isAuthenticated = true;
    const view = renderAt();

    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();

    auth.dogs = [alfie, dog];
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Current dog" })).toHaveValue(
      dog._id,
    );
  });

  it("keeps an authorized dog selected across reorder and falls back on removal", async () => {
    auth.dogs = [dog, luna];
    auth.state.isAuthenticated = true;
    const view = renderAt();

    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Current dog" }), {
      target: { value: luna._id },
    });

    expect(
      await screen.findByRole("heading", { name: "Hello, Luna." }),
    ).toBeInTheDocument();
    expect(
      auth.queryArgs.some(
        ([, args]) =>
          typeof args === "object" &&
          args !== null &&
          "dogId" in args &&
          args.dogId === luna._id,
      ),
    ).toBe(true);

    auth.dogs = [luna, dog];
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Hello, Luna." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Current dog" })).toHaveValue(
      luna._id,
    );

    auth.dogs = [dog];
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Current dog" })).toHaveValue(
      dog._id,
    );

    auth.dogs = [luna, dog];
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();
  });

  it("keeps a redeemed dog pending until membership becomes reactive", async () => {
    let finish!: () => void;
    auth.redeemInvite.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(luna._id);
        }),
    );
    auth.dogs = [dog];
    auth.state.isAuthenticated = true;
    const view = renderAt("/settings");

    fireEvent.change(await screen.findByLabelText("Invite code"), {
      target: { value: "ABCDEF0123456789ABCDEF0123456789" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join notebook" }));
    finish();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Join notebook" }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("heading", { name: "The people in Milo’s notebook." }),
    ).toBeInTheDocument();

    auth.dogs = [dog, luna];
    view.rerender(
      <MemoryRouter initialEntries={["/settings"]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "The people in Luna’s notebook.",
      }),
    ).toBeInTheDocument();
  });

  it("announces the lazy insights chunk while it opens", async () => {
    auth.dogs = [dog];
    auth.state.isAuthenticated = true;
    renderAt("/insights");

    expect(await screen.findByText("Opening insights…")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Current dog" })).toHaveValue(
      dog._id,
    );
  });

  it.each([
    ["/agenda", "Today’s agenda", "Agenda"],
    ["/timeline", "Day by day.", "Timeline"],
    ["/insights", "Insights for Milo", "Insights"],
    ["/enrichment", "Enrichment", "Enrichment"],
    ["/training", "Training ledger.", "Training"],
  ])(
    "shows the protected %s page and marks its notebook tab",
    async (path, heading, tab) => {
      auth.dogs = [dog];
      auth.state.isAuthenticated = true;
      renderAt(path);

      expect(
        await screen.findByRole("heading", {
          name: heading,
          ...(path === "/agenda" ? { level: 1 } : {}),
        }),
      ).toBeInTheDocument();
      screen
        .getAllByRole("link", { name: tab })
        .forEach((link) =>
          expect(link).toHaveAttribute("aria-current", "page"),
        );
      expect(screen.getByTestId("location")).toHaveTextContent(`${path}:POP`);
    },
  );

  it("opens protected household settings and switches its dog-keyed page", async () => {
    auth.dogs = [dog, luna];
    auth.state.isAuthenticated = true;
    renderAt("/settings");

    expect(
      await screen.findByRole("heading", {
        name: "The people in Milo’s notebook.",
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Current dog" }), {
      target: { value: luna._id },
    });

    expect(
      await screen.findByRole("heading", {
        name: "The people in Luna’s notebook.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/settings:POP");
  });

  it.each([
    ["/agenda", "Today’s agenda"],
    ["/timeline", "Day by day."],
    ["/insights", "Insights for Milo"],
    ["/enrichment", "Enrichment"],
    ["/training?command=command-id", "Training ledger."],
    ["/settings", "The people in Milo’s notebook."],
  ])(
    "returns a signed-out %s visit to its intended page after authentication",
    async (path, heading) => {
      const view = renderAt(path);
      expect(
        await screen.findByRole("heading", { name: /keep their day/i }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/login:REPLACE",
      );

      auth.dogs = [dog];
      auth.state.isAuthenticated = true;
      view.rerender(
        <MemoryRouter initialEntries={[path]}>
          <App />
          <LocationProbe />
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole("heading", {
          name: heading,
          ...(path === "/agenda" ? { level: 1 } : {}),
        }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent(
        `${path}:REPLACE`,
      );
    },
  );

  it.each([
    "/agenda",
    "/timeline",
    "/insights",
    "/enrichment",
    "/training",
    "/settings",
  ])("sends a dogless authenticated %s visit to onboarding", async (path) => {
    auth.state.isAuthenticated = true;
    renderAt(path);

    expect(
      await screen.findByRole("heading", {
        name: "Tell us about your puppy.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/onboarding:REPLACE",
    );
  });

  it("redirects dogless users away from login", async () => {
    auth.state.isAuthenticated = true;
    renderAt("/login");

    expect(
      await screen.findByRole("heading", {
        name: "Tell us about your puppy.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/onboarding:REPLACE",
    );
  });

  it("redirects users with dogs away from onboarding", async () => {
    auth.dogs = [dog];
    auth.state.isAuthenticated = true;
    renderAt("/onboarding");

    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/:REPLACE");
  });

  it("redirects signed-out users away from onboarding", async () => {
    renderAt("/onboarding");

    expect(
      await screen.findByRole("heading", { name: /keep their day/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login:REPLACE");
  });

  it("keeps wildcard handling pointed at the authenticated dashboard", async () => {
    auth.dogs = [dog];
    auth.state.isAuthenticated = true;
    renderAt("/not-a-page");

    expect(
      await screen.findByRole("heading", { name: "Hello, Milo." }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/:REPLACE");
  });
});

describe("Login form", () => {
  it("groups account modes and marks the current choice", () => {
    renderAt("/login");
    const group = screen.getByRole("group", { name: "Account access" });
    const signIn = within(group).getByRole("button", { name: "Sign in" });
    const signUp = within(group).getByRole("button", {
      name: "Create account",
    });

    expect(signIn).toHaveAttribute("aria-pressed", "true");
    expect(signUp).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(signUp);

    expect(signIn).toHaveAttribute("aria-pressed", "false");
    expect(signUp).toHaveAttribute("aria-pressed", "true");
  });

  it("localizes account access and focuses the first invalid Slovak field", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["sk-SK"]);
    renderAt("/login");

    const group = await screen.findByRole("group", {
      name: "Prístup k účtu",
    });
    fireEvent.click(
      within(group).getByRole("button", { name: "Vytvoriť účet" }),
    );
    fireEvent.submit(screen.getByRole("form", { name: "Vytvorenie účtu" }));

    expect(screen.getByText("Zadajte platnú e-mailovú adresu.")).toBeVisible();
    expect(screen.getByLabelText("E-mailová adresa")).toHaveFocus();
  });

  it("normalizes credentials and calls the Password sign-in flow", async () => {
    auth.signIn.mockResolvedValue({ signingIn: true });
    renderAt("/login");
    fillSignIn();

    fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));

    await waitFor(() =>
      expect(auth.signIn).toHaveBeenCalledWith("password", {
        email: "puppy@example.com",
        password: "long-enough",
        flow: "signIn",
      }),
    );
  });

  it("rejects email addresses containing more than one at-sign", () => {
    renderAt("/login");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "puppy@@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "long-enough" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));

    expect(
      screen.getByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("clears each validation error as its field is corrected", () => {
    renderAt("/login");
    fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
    const email = screen.getByLabelText("Email address");
    const password = screen.getByLabelText("Password");

    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(email, { target: { value: "puppy@example.com" } });

    expect(email).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText("Enter a valid email address.")).toBeNull();
    expect(password).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(password, { target: { value: "long-enough" } });

    expect(password).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText("Enter your password.")).toBeNull();
  });

  it("validates sign-up fields before calling auth", () => {
    renderAt("/login");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "puppy@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Create an account" }));

    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Passwords must match.")).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("calls the Password sign-up flow for valid account details", async () => {
    auth.signIn.mockResolvedValue({ signingIn: true });
    renderAt("/login");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "long-enough" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "long-enough" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Create an account" }));

    await waitFor(() =>
      expect(auth.signIn).toHaveBeenCalledWith("password", {
        email: "new@example.com",
        password: "long-enough",
        flow: "signUp",
      }),
    );
  });

  it("locks the form while sign-in is pending", async () => {
    let finish!: () => void;
    auth.signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ signingIn: true });
        }),
    );
    renderAt("/login");
    fillSignIn();

    fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));

    const pendingButton = await screen.findByRole("button", {
      name: "Signing in…",
    });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByRole("form", { name: "Sign in" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    finish();
    await waitFor(() => expect(pendingButton).not.toBeDisabled());
  });

  it("shows a generic error without leaking backend details", async () => {
    auth.signIn.mockRejectedValue(new Error("Invalid credentials for user 42"));
    renderAt("/login");
    fillSignIn();

    fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you in. Check your details and try again.",
    );
    expect(screen.queryByText(/user 42/i)).not.toBeInTheDocument();
  });

  it("clears a stale backend error when either credential changes", async () => {
    auth.signIn.mockRejectedValue(new Error("Invalid credentials"));
    renderAt("/login");
    fillSignIn();
    const form = screen.getByRole("form", { name: "Sign in" });

    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "another@example.com" },
    });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "another-password" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
