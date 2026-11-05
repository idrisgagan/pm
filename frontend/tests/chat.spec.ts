import { expect, test, type Page } from "@playwright/test";
import type { ApiBoard, ChatReply } from "../src/lib/api";
import { SEED, card, cardTitles, column, openFreshBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openFreshBoard(page);
});

const sidebar = (page: Page) => page.getByRole("complementary", { name: "AI chat" });

const ask = async (page: Page, message: string) => {
  await sidebar(page).getByLabel("Message").fill(message);
  await page.keyboard.press("Enter");
};

// A marker that a reload would wipe, so tests can show the page never reloaded.
const markPage = (page: Page) => page.evaluate(() => ((window as { marked?: boolean }).marked = true));
const isMarked = (page: Page) => page.evaluate(() => (window as { marked?: boolean }).marked === true);

// The AI is faked in the browser: /api/chat answers with the current board
// plus one card. The backend side is covered by the pytest tests.
test("a card from the AI appears on the board without a reload", async ({ page }) => {
  const board: ApiBoard = await (await page.request.get("/api/board")).json();
  board.columns[0].cards.push({ id: 999999, title: "From the AI", details: "Added by chat." });
  const reply: ChatReply = { reply: "Added From the AI to Backlog.", applied: [], skipped: [], board };
  await page.route("**/api/chat", (route) => route.fulfill({ json: reply }));
  await markPage(page);

  await ask(page, "Add a card called From the AI to Backlog");

  await expect(card(column(page, 0), "From the AI")).toContainText("Added by chat.");
  await expect(sidebar(page).getByRole("log")).toContainText("Added From the AI to Backlog.");
  expect(await isMarked(page)).toBe(true);
});

test("a failed chat call shows the error and leaves the board alone", async ({ page }) => {
  await page.route("**/api/chat", (route) => route.fulfill({ status: 502, json: { detail: "no" } }));

  await ask(page, "Delete every card");

  await expect(sidebar(page).getByRole("alert")).toHaveText("The AI could not answer. Try again.");
  await expect(sidebar(page).getByLabel("Message")).toHaveValue("Delete every card");
  for (const [index, [, cards]] of SEED.entries()) {
    await expect(cardTitles(column(page, index))).toHaveText(cards);
  }
});

// Real AI call. Skipped unless OPENROUTER_API_KEY is set in this shell, which
// the Playwright config passes into the test container.
test("live: the AI adds a card that is still there after a reload", async ({ page }) => {
  test.skip(!process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY not set");
  await markPage(page);

  await ask(page, "Add a card called Live test to Backlog");

  await expect(card(column(page, 0), "Live test")).toBeVisible({ timeout: 45_000 });
  expect(await isMarked(page)).toBe(true);
  await page.reload();
  await expect(card(column(page, 0), "Live test")).toBeVisible();
});
