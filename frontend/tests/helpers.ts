import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import type { ApiBoard } from "../src/lib/api";

export const signIn = async (page: Page, password = "password") => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
};

export const signInToBoard = async (page: Page) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

// The board every test starts from: column titles and their card titles.
export const SEED: [string, string[]][] = [
  ["Backlog", ["Align roadmap themes", "Gather customer signals"]],
  ["Discovery", ["Prototype analytics view"]],
  ["In Progress", ["Refine status language", "Design card layout"]],
  ["Review", ["QA micro-interactions"]],
  ["Done", ["Ship marketing page", "Close onboarding sprint"]],
];

// Puts the board back to SEED through the normal API. Card ids change on
// every reset, so tests find cards by title.
const resetBoard = async (request: APIRequestContext) => {
  const board: ApiBoard = await (await request.get("/api/board")).json();
  for (const [index, column] of board.columns.entries()) {
    const [title, cards] = SEED[index];
    for (const card of column.cards) {
      expect((await request.delete(`/api/cards/${card.id}`)).ok()).toBe(true);
    }
    if (column.title !== title) {
      expect((await request.patch(`/api/columns/${column.id}`, { data: { title } })).ok()).toBe(true);
    }
    for (const card of cards) {
      const data = { column_id: column.id, title: card, details: `${card} details` };
      expect((await request.post("/api/cards", { data })).ok()).toBe(true);
    }
  }
};

export const openFreshBoard = async (page: Page) => {
  const login = await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
  expect(login.ok()).toBe(true);
  await resetBoard(page.request);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

export const column = (page: Page, index: number) =>
  page.locator('[data-testid^="column-"]').nth(index);

// A card is a dnd-kit button labelled with its title.
export const card = (scope: Page | Locator, title: string) =>
  scope.getByRole("button", { name: title, exact: true });

export const cardTitles = (scope: Locator) =>
  scope.locator("article").getByRole("button", { name: /^Edit (?!details)/ });
