import { expect, type Page } from "@playwright/test";

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
