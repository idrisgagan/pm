import { expect, test } from "@playwright/test";
import { signIn, signInToBoard } from "./helpers";

test("shows the login form first", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
});

test("rejects a wrong password", async ({ page }) => {
  await signIn(page, "wrong");
  // Scoped to the form: Next.js adds its own empty role="alert" route announcer.
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Invalid username or password."
  );
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
});

test("stays signed in after a reload", async ({ page }) => {
  await signInToBoard(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("signs out", async ({ page }) => {
  await signInToBoard(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the API rejects requests without a session", async ({ request }) => {
  const response = await request.get("/api/me");
  expect(response.status()).toBe(401);
});
