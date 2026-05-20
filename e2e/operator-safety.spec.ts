import { expect, test } from "@playwright/test";
import {
  gotoAppPage,
  isVisible,
  login,
  waitForClientHydration
} from "./helpers";

test("execute once remains blocked by demo dry-run safety gates", async ({
  page
}) => {
  await login(page);
  await gotoAppPage(page, "Wallets");
  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible();

  const demoWallet = page.getByRole("link", { name: "Demo Strategy Wallet" });
  if (!(await isVisible(demoWallet))) {
    test.skip(true, "Demo wallet is not seeded in this environment.");
  }

  await demoWallet.click();
  await expect(
    page.getByText(
      "DRY_RUN is enabled on the API. Execute-once requests are blocked by default."
    )
  ).toBeVisible();
  await expect(
    page.getByText("I understand this will send a real Base transaction")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Execute Once" })).toBeDisabled();
  await expect(page.getByText(/live transaction|real Base transaction/)).toBeVisible();
});

test("emergency pause action requires typed confirmation before enabling or disabling", async ({
  page
}) => {
  await login(page);
  await gotoAppPage(page, "Settings");
  await page.getByRole("link", { name: /Security/ }).click();
  await expect(
    page.getByRole("heading", { name: "Security", exact: true })
  ).toBeVisible();

  const pauseButton = page.getByRole("button", {
    name: /Enable global emergency pause|Disable global pause/
  });
  await expect(pauseButton).toBeVisible();
  await waitForClientHydration(page);
  await pauseButton.click();

  const typedInput = page.getByLabel(
    /Type (ENABLE PAUSE|DISABLE PAUSE) to confirm/
  );
  await expect(typedInput).toBeVisible();
  const confirmButton = page
    .getByRole("button", { name: /Enable global pause|Disable global pause/ })
    .last();
  await expect(confirmButton).toBeDisabled();

  const requiredText = (await typedInput.getAttribute("aria-label"))?.includes(
    "DISABLE PAUSE"
  )
    ? "DISABLE PAUSE"
    : "ENABLE PAUSE";
  await typedInput.fill(requiredText);
  await expect(confirmButton).toBeEnabled();
});
