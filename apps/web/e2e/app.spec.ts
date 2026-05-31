import { test, expect } from "@playwright/test";

const unique = Date.now();

test("register, play track, like, create playlist", async ({ page }) => {
  page.on("dialog", async (dialog) => {
    await dialog.accept(`E2E ${unique}`);
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.getByLabel("Handle").fill(`e2e_${unique}`);
  await page.getByLabel("Email").fill(`e2e_${unique}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();

  await expect(page).toHaveURL("/");

  const trackCard = page.locator("[data-testid=track-card]").first();
  await expect(trackCard).toBeVisible({ timeout: 15_000 });
  await trackCard.click();

  await expect(page).toHaveURL(/\/track\//);
  await page.getByRole("button", { name: /play/i }).first().click();
  await page.getByRole("button", { name: /like|save/i }).first().click();

  await page.getByTestId("sidebar-create-playlist").click();
  await expect(page.getByText(`E2E ${unique}`)).toBeVisible({ timeout: 10_000 });
});
