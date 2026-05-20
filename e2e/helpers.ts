import { expect, type Locator, type Page } from "@playwright/test";

export const login = async (page: Page) => {
  const response = await page.request.post(
    "http://127.0.0.1:4210/api/auth/login",
    {
      data: {
        username: "operator",
        password: "demo-password"
      }
    }
  );
  await expect(response).toBeOK();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Base Orchestrator" })
  ).toBeVisible({ timeout: 15_000 });
  await waitForClientHydration(page);
};

export const isVisible = async (locator: Locator) =>
  await locator
    .first()
    .isVisible()
    .catch(() => false);

export const gotoAppPage = async (page: Page, linkName: string | RegExp) => {
  await page.getByRole("navigation").getByRole("link", { name: linkName }).click();
};

export const waitForClientHydration = async (page: Page) => {
  await page.waitForTimeout(500);
};
