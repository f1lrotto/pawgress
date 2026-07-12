import { expect, type Page, test } from "@playwright/test";

const recentActivity = (page: Page) =>
  page.getByRole("region", { name: "Recent activity" });

const summaryItem = (page: Page, label: string) =>
  page
    .getByRole("region", { name: "Right now" })
    .getByRole("term")
    .filter({ hasText: label })
    .locator("..");

const activityRow = (page: Page, label: string) =>
  recentActivity(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();

test("a household can log and manage live activity", async ({
  browser,
  context,
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `zoe-e2e-${runId}@example.com`;
  const dogName = `E2E Pup ${runId}`;

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("button", { name: "Create account" }).click();
  const signUp = page.getByRole("form", { name: "Create an account" });
  await signUp.getByLabel("Email address").fill(email);
  await signUp.getByLabel("Password", { exact: true }).fill("E2E-pass-123!");
  await signUp.getByLabel("Confirm password").fill("E2E-pass-123!");
  await signUp.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Puppy name").fill(dogName);
  await page.getByLabel("Birthday").fill("2024-01-15");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Current weight").fill("4.25");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: `Hello, ${dogName}.` }),
  ).toBeVisible();

  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await expect(
    secondPage.getByRole("heading", { name: `Hello, ${dogName}.` }),
  ).toBeVisible();

  const quickLog = page.getByRole("region", { name: "Log an activity" });
  await quickLog.getByRole("button", { name: "Log Pee" }).click();
  await expect(quickLog.getByRole("status")).toContainText(
    `Pee logged for ${dogName}.`,
  );
  await expect(
    recentActivity(secondPage).getByText("Pee", { exact: true }),
  ).toBeVisible({ timeout: 1_000 });
  await expect(summaryItem(secondPage, "Since last pee")).toContainText(
    /\d+(?:s|m|h|d)/,
    { timeout: 1_000 },
  );
  await expect(
    secondPage.getByRole("button", { name: "Log Pee" }),
  ).toContainText("Last");

  await quickLog.getByRole("button", { name: "Log Meal" }).click();
  await expect(summaryItem(secondPage, "Since last meal")).toContainText(
    /\d+(?:s|m|h|d)/,
    { timeout: 1_000 },
  );

  await quickLog.getByRole("button", { name: "Log with details" }).click();
  const backdated = quickLog.getByRole("form", { name: "Backdated event" });
  await backdated.getByLabel("What happened?").selectOption("treat");
  await backdated.getByLabel("When did it happen?").fill("2024-01-16T12:00");
  await backdated.getByLabel(/Note/).fill("Backdated training treat");
  await backdated.getByRole("button", { name: "Log event" }).click();

  const recent = recentActivity(page);
  await expect(recent.getByText("Backdated training treat")).toBeVisible();
  await recent.getByRole("button", { name: /^Edit Treat on/ }).click();
  const editor = recent.getByRole("form", { name: "Edit Treat event" });
  await editor.getByLabel(/Note/).fill("Updated E2E note");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(recent.getByRole("status")).toContainText("Treat updated.");
  await expect(recent.getByText("Updated E2E note")).toBeVisible();

  await recent.getByRole("button", { name: /^Delete Treat on/ }).click();
  await expect(recent.getByText("Delete the “Treat” log?")).toBeVisible();
  await recent.getByRole("button", { name: "Confirm delete Treat" }).click();
  await expect(recent.getByRole("status")).toContainText("Treat deleted.");
  await expect(recent.getByText("Updated E2E note")).toHaveCount(0);

  await quickLog.getByRole("button", { name: "Log Poop" }).click();
  await expect(recent.getByText("Poop", { exact: true })).toBeVisible();
  await quickLog.getByRole("button", { name: "Undo" }).click();
  await expect(quickLog.getByRole("status")).toContainText("Last log removed.");
  await expect(recent.getByText("Poop", { exact: true })).toHaveCount(0);

  await quickLog.getByRole("button", { name: "Start walk" }).click();
  const activeWalk = secondPage.getByRole("region", {
    name: "Walk in progress",
  });
  await expect(activeWalk).toContainText(/\d+(?:s|m|h|d)/, {
    timeout: 1_000,
  });
  await expect(summaryItem(secondPage, "Current walk")).toContainText(
    /\d+(?:s|m|h|d)/,
    { timeout: 1_000 },
  );

  const pee = quickLog.getByRole("button", { name: "Log Pee" });
  await expect(pee).toContainText("During walk", { timeout: 1_000 });
  await pee.click();
  await expect(activityRow(secondPage, "Pee")).toContainText("During walk", {
    timeout: 1_000,
  });

  const pageAWalk = page.getByRole("region", { name: "Walk in progress" });
  await pageAWalk.getByRole("button", { name: "Add walk diary" }).click();
  const diary = pageAWalk.getByRole("form", { name: "Walk diary" });
  await diary
    .getByRole("textbox", { name: /Walk diary/ })
    .fill("Played by the pond");
  await diary.getByRole("button", { name: "Save diary" }).click();
  await expect(activityRow(secondPage, "Walk")).toContainText(
    "Played by the pond",
    { timeout: 1_000 },
  );

  await activeWalk.getByRole("button", { name: "End walk" }).click();
  for (const householdPage of [page, secondPage]) {
    const completedWalk = activityRow(householdPage, "Walk");
    await expect(completedWalk).toContainText("Completed", { timeout: 1_000 });
    await expect(completedWalk).toContainText(/\d+(?:s|m|h|d)/, {
      timeout: 1_000,
    });
    await expect(completedWalk).toContainText("Played by the pond", {
      timeout: 1_000,
    });
    await expect(summaryItem(householdPage, "Since last walk")).toContainText(
      /\d+(?:s|m|h|d)/,
      { timeout: 1_000 },
    );
  }

  await quickLog.getByRole("button", { name: "Log Fell asleep" }).click();
  await expect(summaryItem(secondPage, "Current rest state")).toContainText(
    "Asleep",
    { timeout: 1_000 },
  );
  const secondQuickLog = secondPage.getByRole("region", {
    name: "Log an activity",
  });
  await expect(
    secondQuickLog.getByRole("button", { name: "Log Woke up" }),
  ).toBeEnabled({ timeout: 1_000 });
  await expect(
    secondQuickLog.getByRole("button", { name: "Log Fell asleep" }),
  ).toBeDisabled({ timeout: 1_000 });

  await secondQuickLog.getByRole("button", { name: "Log Woke up" }).click();
  await expect(summaryItem(page, "Current rest state")).toContainText("Awake", {
    timeout: 1_000,
  });
  await expect(
    quickLog.getByRole("button", { name: "Log Woke up" }),
  ).toBeDisabled({ timeout: 1_000 });
  await expect(
    quickLog.getByRole("button", { name: "Log Fell asleep" }),
  ).toBeEnabled({ timeout: 1_000 });

  await page
    .getByRole("navigation", { name: "Notebook sections" })
    .getByRole("link", { name: "Enrichment" })
    .click();
  await expect(page).toHaveURL(/\/enrichment$/);
  const createActivity = page.getByRole("form", {
    name: "Create custom activity",
  });
  await createActivity.getByLabel("Activity name").fill("Cafe visit");
  await createActivity.getByRole("button", { name: "Add activity" }).click();
  await expect(page.getByRole("status")).toContainText("Cafe visit added.");

  const activities = page.getByRole("region", { name: "Activities" });
  const cafeRow = activities
    .getByRole("list")
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Cafe visit" }) });
  await cafeRow.getByRole("button", { name: "Log Cafe visit now" }).click();
  await expect(page.getByRole("status")).toContainText(
    `Cafe visit logged for ${dogName}.`,
  );
  const cafeHistory = activityRow(secondPage, "Cafe visit");
  await expect(cafeHistory).toBeVisible({ timeout: 1_000 });

  await cafeRow.getByRole("button", { name: "Archive Cafe visit" }).click();
  await cafeRow
    .getByRole("button", { name: "Confirm archive Cafe visit" })
    .click();
  await expect(cafeRow).toHaveCount(0);
  await expect(
    page
      .getByRole("form", { name: "Log another play time" })
      .getByRole("option", { name: "Cafe visit" }),
  ).toHaveCount(0);
  await expect(cafeHistory).toContainText("Cafe visit", { timeout: 1_000 });

  await page
    .getByRole("navigation", { name: "Notebook sections" })
    .getByRole("link", { name: "Training" })
    .click();
  await expect(page).toHaveURL(/\/training$/);
  const createCommand = page.getByRole("form", { name: "Create command" });
  await createCommand.getByLabel("Command name").fill("Recall");
  await createCommand.getByText("Add guidance", { exact: true }).click();
  await createCommand
    .getByLabel("Command description")
    .fill("Return promptly when called.");
  await createCommand
    .getByLabel("How to train")
    .fill("Reward every fast return, then add distance.");
  await createCommand.getByRole("button", { name: "Add command" }).click();

  const commandDetail = page.locator("#command-detail");
  await expect(
    commandDetail.getByRole("heading", { name: "Recall" }),
  ).toBeVisible();
  await expect(commandDetail.getByLabel("Description")).toHaveValue(
    "Return promptly when called.",
  );
  await expect(commandDetail.getByLabel("Training plan")).toHaveValue(
    "Reward every fast return, then add distance.",
  );
  await expect(
    commandDetail.getByRole("button", { name: "Set status Learning" }),
  ).toHaveAttribute("aria-pressed", "true");

  await createCommand.getByLabel("Command name").fill("Stay");
  await createCommand.getByRole("button", { name: "Add command" }).click();
  await page
    .getByRole("navigation", { name: "Notebook sections" })
    .getByRole("link", { name: "Today" })
    .click();
  await page.getByRole("button", { name: "Log training" }).click();
  const quickTraining = page.getByRole("dialog", { name: "Log training" });
  await quickTraining.getByRole("checkbox", { name: "Recall" }).check();
  await quickTraining.getByRole("checkbox", { name: "Stay" }).check();
  await quickTraining.getByRole("radio", { name: "Thumbs up" }).check();
  await quickTraining.getByRole("button", { name: "Save training" }).click();
  await expect(quickTraining).not.toBeVisible();
  await page
    .getByRole("navigation", { name: "Notebook sections" })
    .getByRole("link", { name: "Training" })
    .click();
  await page.getByRole("link", { name: "Open Recall" }).click();
  await expect(
    page.getByRole("list", { name: "Training sessions" }),
  ).toContainText("5 / 5");

  await secondPage
    .getByRole("navigation", { name: "Notebook sections" })
    .getByRole("link", { name: "Training" })
    .click();
  await expect(
    secondPage.getByRole("link", { name: "Open Recall" }),
  ).toBeVisible({ timeout: 1_000 });
  await secondPage.getByRole("link", { name: "Open Recall" }).click();
  const secondCommandDetail = secondPage.locator("#command-detail");
  await expect(secondCommandDetail.getByLabel("Description")).toHaveValue(
    "Return promptly when called.",
  );

  await commandDetail.getByRole("button", { name: "Set status Solid" }).click();
  await expect(
    commandDetail.getByRole("button", { name: "Set status Solid" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    secondCommandDetail.getByRole("button", { name: "Set status Solid" }),
  ).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });

  await commandDetail
    .getByRole("button", { name: "Set status Mastered" })
    .click();
  await expect(
    commandDetail.getByRole("button", { name: "Set status Mastered" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    secondCommandDetail.getByRole("button", { name: "Set status Mastered" }),
  ).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });

  const sessionForm = commandDetail.getByRole("form", {
    name: "Log training session",
  });
  await sessionForm.getByLabel("Session rating").fill("5");
  await sessionForm
    .getByLabel("Session notes")
    .fill("Immediate response beside the cafe.");
  await sessionForm.getByRole("button", { name: "Log session" }).click();
  await expect(
    secondCommandDetail.getByRole("list", { name: "Training sessions" }),
  ).toContainText("Immediate response beside the cafe.", { timeout: 1_000 });
  await expect(secondCommandDetail.getByLabel("Rating 5 out of 5")).toBeVisible(
    { timeout: 1_000 },
  );

  for (const householdPage of [page, secondPage]) {
    await householdPage
      .getByRole("navigation", { name: "Notebook sections" })
      .getByRole("link", { name: "Agenda" })
      .click();
    await expect(householdPage).toHaveURL(/\/agenda$/);
  }

  const todayAgenda = page.getByRole("region", { name: "Today’s agenda" });
  const secondTodayAgenda = secondPage.getByRole("region", {
    name: "Today’s agenda",
  });
  const enrichmentGoal = todayAgenda.getByRole("form", {
    name: "Add enrichment goal",
  });
  await enrichmentGoal.getByLabel("New enrichment goal").fill("Garden sniff");
  await enrichmentGoal
    .getByRole("button", { name: "Add enrichment goal" })
    .click();
  await expect(
    secondTodayAgenda.getByText("Garden sniff", { exact: true }),
  ).toBeVisible({ timeout: 1_000 });

  const trainingGoal = todayAgenda.getByRole("form", {
    name: "Add training goal",
  });
  await trainingGoal.getByLabel("New training goal").fill("Recall reps");
  await trainingGoal.getByRole("button", { name: "Add training goal" }).click();
  await expect(
    secondTodayAgenda.getByText("Recall reps", { exact: true }),
  ).toBeVisible({ timeout: 1_000 });

  const secondGardenSniff = secondTodayAgenda.getByRole("checkbox", {
    name: "Garden sniff",
  });
  await secondGardenSniff.click();
  await expect(secondGardenSniff).toBeChecked({ timeout: 1_000 });
  await expect(
    todayAgenda.getByRole("checkbox", { name: "Garden sniff" }),
  ).toBeChecked({ timeout: 1_000 });

  const winForm = todayAgenda.getByRole("form", { name: "Save win" });
  await winForm.getByLabel("Today’s win").fill("Settled after the walk");
  await winForm.getByRole("button", { name: "Save win" }).click();
  await expect(
    secondTodayAgenda
      .getByRole("form", { name: "Save win" })
      .getByLabel("Today’s win"),
  ).toHaveValue("Settled after the walk", { timeout: 1_000 });

  const ratingForm = todayAgenda.getByRole("form", { name: "Save rating" });
  await ratingForm.getByLabel("Day rating", { exact: true }).fill("5");
  await ratingForm.getByRole("button", { name: "Save rating" }).click();
  await expect(
    secondTodayAgenda
      .getByRole("form", { name: "Save rating" })
      .getByLabel("Day rating", { exact: true }),
  ).toHaveValue("5", { timeout: 1_000 });

  const agendaDiary = todayAgenda.getByRole("form", { name: "Save diary" });
  await agendaDiary
    .getByLabel("Agenda diary")
    .fill("Garden sniff and recall went well.");
  await agendaDiary.getByRole("button", { name: "Save diary" }).click();
  await expect(
    secondTodayAgenda
      .getByRole("form", { name: "Save diary" })
      .getByLabel("Agenda diary"),
  ).toHaveValue("Garden sniff and recall went well.", { timeout: 1_000 });

  await page
    .getByRole("navigation", { name: "Notebook sections" })
    .getByRole("link", { name: "Today" })
    .click();
  const agendaSummary = page.getByRole("region", { name: "Today’s agenda" });
  await expect(
    agendaSummary
      .getByRole("term")
      .filter({ hasText: "Enrichment" })
      .locator("..")
      .getByRole("definition"),
  ).toHaveText("1/1", { timeout: 1_000 });
  await expect(
    agendaSummary
      .getByRole("term")
      .filter({ hasText: "Training" })
      .locator("..")
      .getByRole("definition"),
  ).toHaveText("0/1");
  await expect(agendaSummary).toContainText("Settled after the walk");
  await expect(agendaSummary).toContainText("5/5");
  await expect(
    agendaSummary.getByRole("link", { name: "Open agenda" }),
  ).toHaveAttribute("href", "/agenda");

  await page
    .getByRole("navigation", { name: "Notebook sections" })
    .getByRole("link", { name: "Timeline" })
    .click();
  await expect(page).toHaveURL(/\/timeline$/);
  const timelineDate = await page.getByLabel("Timeline date").inputValue();
  const timelineDay = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(Date.parse(`${timelineDate}T00:00:00Z`));
  const timeline = page.getByRole("region", {
    name: timelineDay,
  });
  await expect(
    timeline.getByRole("heading", { name: "Pee", exact: true }).first(),
  ).toBeVisible();
  await expect(
    timeline.getByRole("heading", { name: "Meal", exact: true }),
  ).toBeVisible();
  const timelineWalk = timeline.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Walk", exact: true }),
  });
  await expect(timelineWalk).toContainText("Played by the pond");
  await expect(timelineWalk).toContainText("Duration:");

  const peeFilter = page.getByRole("checkbox", { name: "Pee" });
  await peeFilter.press("Space");
  await expect(peeFilter).toBeChecked();
  await expect(
    timeline.getByRole("heading", { name: "Pee", exact: true }).first(),
  ).toBeVisible({ timeout: 1_000 });
  await expect(
    timeline.getByRole("heading", { name: "Meal", exact: true }),
  ).toHaveCount(0);
  await expect(
    timeline.getByRole("heading", { name: "Walk", exact: true }),
  ).toHaveCount(0);
  await peeFilter.press("Space");
  await expect(peeFilter).not.toBeChecked();
  await expect(
    timeline.getByRole("heading", { name: "Meal", exact: true }),
  ).toBeVisible({ timeout: 1_000 });
  await expect(
    timeline.getByRole("heading", { name: "Walk", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Notebook sections" })
    .getByRole("link", { name: "Insights" })
    .click();
  await expect(page).toHaveURL(/\/insights$/);
  await expect(
    page.getByRole("heading", { name: `Insights for ${dogName}` }),
  ).toBeVisible();

  const weightTrail = page.getByRole("region", { name: "Weight trail" });
  await expect(weightTrail).toContainText("Latest weight: 4.25 kg", {
    timeout: 1_000,
  });
  const bodyMeasurements = page.getByRole("region", {
    name: "Body measurements",
    exact: true,
  });
  await expect(bodyMeasurements).toContainText("4.25 kg");
  await expect(
    page
      .getByRole("region", { name: "Potty clock" })
      .getByRole("table", { name: "Potty events by dog-local hour" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Walk rhythm" })).toContainText(
    "Log at least two completed walks to compare the time between them.",
  );
  await expect(
    page
      .getByRole("region", { name: "Sleep ledger" })
      .getByRole("list", { name: "Daily sleep data" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Day ratings" })
      .getByRole("list", { name: "Day rating data" }),
  ).toContainText("5 out of 5");

  const bodyForm = bodyMeasurements.getByRole("form", {
    name: "Add body measurement",
  });
  await bodyForm.getByLabel("Weight (kg)").fill("5.6");
  await bodyForm.getByRole("button", { name: "Add measurement" }).click();
  await expect(bodyMeasurements.getByRole("status")).toContainText(
    "Body measurement added.",
  );
  await expect(weightTrail).toContainText("Latest weight: 5.6 kg", {
    timeout: 1_000,
  });
  await expect(
    weightTrail.getByRole("list", { name: "Weight history data" }),
  ).toContainText("5.6 kg");

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("button", { name: "Create invite code" }).click();
  const inviteCode = await page.getByLabel("Active invite code").inputValue();
  const memberEmail = `zoe-e2e-member-${runId}@example.com`;
  const memberContext = await browser.newContext();

  try {
    const memberPage = await memberContext.newPage();
    await memberPage.goto(new URL(page.url()).origin);
    await memberPage.getByRole("button", { name: "Create account" }).click();
    const memberSignUp = memberPage.getByRole("form", {
      name: "Create an account",
    });
    await memberSignUp.getByLabel("Email address").fill(memberEmail);
    await memberSignUp
      .getByLabel("Password", { exact: true })
      .fill("E2E-pass-123!");
    await memberSignUp.getByLabel("Confirm password").fill("E2E-pass-123!");
    await memberSignUp.getByRole("button", { name: "Create account" }).click();

    await expect(memberPage).toHaveURL(/\/onboarding$/);
    const join = memberPage.getByRole("form", {
      name: "Join with an invite code",
    });
    await join.getByLabel("Invite code").fill(inviteCode);
    await join.getByRole("button", { name: "Join notebook" }).click();

    await expect(memberPage).toHaveURL(/\/$/);
    await expect(
      memberPage.getByRole("heading", { name: `Hello, ${dogName}.` }),
    ).toBeVisible();
    await expect(page.getByText(memberEmail, { exact: true })).toBeVisible({
      timeout: 1_000,
    });

    await page
      .getByRole("navigation", { name: "Notebook sections" })
      .getByRole("link", { name: "Today" })
      .click();
    await expect(activityRow(page, "Cafe visit")).toBeVisible();
    const ownerPees = recentActivity(page).getByText("Pee", { exact: true });
    const peeCount = await ownerPees.count();
    const memberQuickLog = memberPage.getByRole("region", {
      name: "Log an activity",
    });
    await memberQuickLog.getByRole("button", { name: "Log Pee" }).click();
    await expect(memberQuickLog.getByRole("status")).toContainText(
      `Pee logged for ${dogName}.`,
    );
    await expect(ownerPees).toHaveCount(peeCount + 1, { timeout: 1_000 });

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByLabel("Language").selectOption("sk");
    await expect(page.locator("html")).toHaveAttribute("lang", "sk");
    await expect(
      page.getByRole("heading", { name: `Nastavenia pre ${dogName}.` }),
    ).toBeVisible();
    const slovakNavigation = page.getByRole("navigation", {
      name: "Časti zápisníka",
    });
    await expect(
      slovakNavigation.getByRole("link", { name: "Denný plán" }),
    ).toBeVisible();
    await expect(page.getByLabel("Jazyk")).toBeEnabled();
    await expect(page.getByLabel("Jazyk")).toHaveValue("sk");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "sk");
    await expect(page.getByLabel("Jazyk")).toHaveValue("sk");
    await expect(
      page.getByRole("heading", { name: `Nastavenia pre ${dogName}.` }),
    ).toBeVisible();

    await secondPage.reload();
    await expect(secondPage.locator("html")).toHaveAttribute("lang", "sk");
    const secondSlovakNavigation = secondPage.getByRole("navigation", {
      name: "Časti zápisníka",
    });
    await secondSlovakNavigation.getByRole("link", { name: "Tréning" }).click();
    await secondPage
      .getByRole("link", { name: "Otvoriť povel Recall" })
      .click();
    await expect(
      secondPage.getByRole("heading", { name: "Recall" }),
    ).toBeVisible();
    await expect(secondPage.getByLabel("Opis", { exact: true })).toHaveValue(
      "Return promptly when called.",
    );
    await expect(
      secondPage.getByText("Immediate response beside the cafe."),
    ).toBeVisible();

    await slovakNavigation.getByRole("link", { name: "Dnes" }).click();
    await expect(
      page.getByRole("heading", { name: `Ahoj, ${dogName}.` }),
    ).toBeVisible();
    const slovakRecent = page.getByRole("region", {
      name: "Nedávna aktivita",
    });
    await expect(
      slovakRecent.getByText("Cafe visit", { exact: true }),
    ).toBeVisible();
    await expect(slovakRecent.getByText("Played by the pond")).toBeVisible();

    await memberPage.reload();
    await expect(memberPage.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      memberPage.getByRole("navigation", { name: "Notebook sections" }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("heading", { name: `Hello, ${dogName}.` }),
    ).toBeVisible();
    await expect(
      recentActivity(memberPage).getByText("Cafe visit", { exact: true }),
    ).toBeVisible();
    await expect(
      recentActivity(memberPage).getByText("Played by the pond"),
    ).toBeVisible();
  } finally {
    await Promise.all([secondPage.close(), memberContext.close()]);
  }
});
