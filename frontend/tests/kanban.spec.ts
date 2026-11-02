import { expect, test, type Page } from "@playwright/test";

test("loads the kanban board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await page.goto("/");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

const keyboardMove = async (
  page: Page,
  cardId: string,
  key: string,
  overId: string
) => {
  const card = page.getByTestId(`card-${cardId}`);
  await card.focus();
  await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  // dnd-kit's KeyboardSensor adds its arrow-key listener in a setTimeout after
  // pick-up. Waiting one task in the page lets that timer run first.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await page.keyboard.press(key);
  await expect(
    page.getByText(`was moved over droppable area ${overId}`)
  ).toBeAttached();
  await page.keyboard.press("Space");
};

test("links cards to the keyboard instructions", async ({ page }) => {
  await page.goto("/");
  const describedBy = await page
    .getByTestId("card-card-1")
    .getAttribute("aria-describedby");
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText(
    "press the space bar"
  );
});

test("reorders a card with the keyboard", async ({ page }) => {
  await page.goto("/");
  await keyboardMove(page, "card-2", "ArrowUp", "card-1");
  await expect(
    page.getByTestId("column-col-backlog").locator("article")
  ).toHaveText([/Gather customer signals/, /Align roadmap themes/]);
});

test("moves a card to another column with the keyboard", async ({ page }) => {
  await page.goto("/");
  await keyboardMove(page, "card-1", "ArrowRight", "card-3");
  await expect(
    page.getByTestId("column-col-discovery").getByTestId("card-card-1")
  ).toBeVisible();
});
