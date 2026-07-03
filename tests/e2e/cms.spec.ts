import { expect, test } from "@playwright/test";

test("renders the Ilm CMS shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();

  await page.getByRole("link", { name: "Editor" }).click();
  await expect(page.getByRole("heading", { name: "Editor", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Draft" })).toBeVisible();
});
