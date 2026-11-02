import { expect, test, type Locator, type Page } from "@playwright/test";
import { SEED, openFreshBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openFreshBoard(page);
});

const column = (page: Page, index: number) =>
  page.locator('[data-testid^="column-"]').nth(index);

// A card is a dnd-kit button labelled with its title.
const card = (scope: Page | Locator, title: string) =>
  scope.getByRole("button", { name: title, exact: true });

const cardTitles = (scope: Locator) =>
  scope.locator("article").getByRole("button", { name: /^Edit (?!details)/ });

test("loads the board from the server", async ({ page }) => {
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  for (const [index, [title, cards]] of SEED.entries()) {
    await expect(column(page, index).getByLabel("Column title")).toHaveValue(title);
    await expect(cardTitles(column(page, index))).toHaveText(cards);
  }
});

test("adds a card and keeps it after a reload", async ({ page }) => {
  const backlog = column(page, 0);
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Playwright card");
  await backlog.getByPlaceholder("Details").fill("Added via e2e.");
  await backlog.getByRole("button", { name: /add card/i }).click();
  await expect(card(backlog, "Playwright card")).toContainText("Added via e2e.");

  await page.reload();
  await expect(cardTitles(column(page, 0))).toHaveText([...SEED[0][1], "Playwright card"]);
});

test("edits a card and keeps the edit after a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await page.getByLabel("Card title").fill("Roadmap themes for Q1");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Edit details of Roadmap themes for Q1" }).click();
  await page.getByLabel("Card details").fill("Three themes.");
  await page.getByLabel("Card details").blur();
  await expect(card(page, "Roadmap themes for Q1")).toContainText("Three themes.");

  await page.reload();
  await expect(card(column(page, 0), "Roadmap themes for Q1")).toContainText("Three themes.");
});

test("deletes a card and it stays deleted after a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Delete Align roadmap themes" }).click();
  await expect(cardTitles(column(page, 0))).toHaveText(["Gather customer signals"]);

  await page.reload();
  await expect(cardTitles(column(page, 0))).toHaveText(["Gather customer signals"]);
});

test("renames a column and keeps the name after a reload", async ({ page }) => {
  const input = column(page, 0).getByLabel("Column title");
  await input.fill("Todo");
  await input.press("Enter");
  await expect(page.locator("header")).toContainText("Todo");

  await page.reload();
  await expect(column(page, 0).getByLabel("Column title")).toHaveValue("Todo");
});

test("moves a card between columns and keeps it there after a reload", async ({ page }) => {
  const cardBox = await card(page, "Align roadmap themes").boundingBox();
  const columnBox = await column(page, 3).boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, { steps: 12 });
  await page.mouse.up();
  await expect(card(column(page, 3), "Align roadmap themes")).toBeVisible();

  await page.reload();
  await expect(card(column(page, 3), "Align roadmap themes")).toBeVisible();
  await expect(cardTitles(column(page, 0))).toHaveText(["Gather customer signals"]);
});

const keyboardMove = async (page: Page, title: string, key: string, overTitle: string) => {
  const moving = card(page, title);
  const overId = await card(page, overTitle).getAttribute("data-testid");
  await moving.focus();
  await page.keyboard.press("Space");
  await expect(moving).toHaveAttribute("aria-pressed", "true");
  // dnd-kit's KeyboardSensor adds its arrow-key listener in a setTimeout after
  // pick-up. Waiting one task in the page lets that timer run first.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await page.keyboard.press(key);
  await expect(page.getByText(`was moved over droppable area ${overId}`)).toBeAttached();
  await page.keyboard.press("Space");
};

test("links cards to the keyboard instructions", async ({ page }) => {
  const describedBy = await card(page, "Align roadmap themes").getAttribute("aria-describedby");
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText("press the space bar");
});

test("reorders a card with the keyboard and keeps the order after a reload", async ({ page }) => {
  await keyboardMove(page, "Gather customer signals", "ArrowUp", "Align roadmap themes");
  const reordered = ["Gather customer signals", "Align roadmap themes"];
  await expect(cardTitles(column(page, 0))).toHaveText(reordered);

  await page.reload();
  await expect(cardTitles(column(page, 0))).toHaveText(reordered);
});

test("moves a card to another column with the keyboard", async ({ page }) => {
  await keyboardMove(page, "Align roadmap themes", "ArrowRight", "Prototype analytics view");
  await expect(card(column(page, 1), "Align roadmap themes")).toBeVisible();

  await page.reload();
  await expect(cardTitles(column(page, 1))).toHaveText([
    "Align roadmap themes",
    "Prototype analytics view",
  ]);
});

test("a failed save shows a message and the board matches the server", async ({ page }) => {
  await page.route("**/api/cards/*", (route) =>
    route.request().method() === "PATCH" ? route.fulfill({ status: 500 }) : route.fallback()
  );
  await page.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await page.getByLabel("Card title").fill("Never saved");
  await page.keyboard.press("Enter");

  await expect(page.locator("header").getByRole("alert")).toHaveText(
    "Could not save your change. The board was reloaded."
  );
  await expect(cardTitles(column(page, 0))).toHaveText(SEED[0][1]);

  await page.unroute("**/api/cards/*");
  await page.reload();
  await expect(cardTitles(column(page, 0))).toHaveText(SEED[0][1]);
});
