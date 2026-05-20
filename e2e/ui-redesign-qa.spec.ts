import { expect, test } from "@playwright/test";
import {
  gotoAppPage,
  isVisible,
  login,
  waitForClientHydration
} from "./helpers";

test("login page renders on the dark canvas", async ({ page }) => {
  await page.goto("/login");

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(7, 8, 10)"
  );
  await expect(
    page.getByRole("heading", { name: "Operator login" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("app shell renders navigation and runtime badges after login", async ({
  page
}) => {
  await login(page);

  await expect(page.locator("aside")).toBeVisible();
  await expect(page.getByRole("navigation")).toBeVisible();
  const banner = page.getByRole("banner");
  await expect(banner.getByText("DEMO MODE")).toBeVisible();
  await expect(banner.getByText("DRY RUN")).toBeVisible();
  await expect(banner.getByText(/VAULT (LOCKED|UNLOCKED|UNAVAILABLE)/)).toBeVisible();
  await expect(banner.getByText(/Base 8453|Base 31337/)).toBeVisible();
  await expect(banner.getByText(/RPC (Online|Offline)/)).toBeVisible();

  const emergencyBadge = page.getByText("EMERGENCY PAUSED");
  if (await isVisible(emergencyBadge)) {
    await expect(emergencyBadge).toBeVisible();
  }
});

test("dashboard renders metrics, safety panel, and scheduler controls", async ({
  page
}) => {
  await login(page);

  await expect(
    page.getByRole("heading", { name: "Base Orchestrator" })
  ).toBeVisible();
  await expect(page.getByText("Active wallets").first()).toBeVisible();
  await expect(page.getByText("Confirmed tx")).toBeVisible();
  await expect(page.getByRole("heading", { name: "System safety" })).toBeVisible();
  await expect(page.getByText("Emergency pause")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scheduler control" })).toBeVisible();
  await expect(page.getByText(/DRY_RUN scheduler|LIVE rejected/)).toBeVisible();
});

test("wallets page renders inventory, import controls, and confirmation-gated bulk actions", async ({
  page
}) => {
  await login(page);
  await gotoAppPage(page, "Wallets");

  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible();
  await expect(page.getByText("CAUTION")).toBeVisible();
  await expect(page.getByPlaceholder("Wallet name")).toBeVisible();
  await expect(page.getByPlaceholder("Private key")).toBeVisible();

  const emptyState = page.getByText("No wallets match this filter");
  const walletRows = page.locator("input[type='checkbox']");
  if (await isVisible(emptyState)) {
    await expect(emptyState).toBeVisible();
    return;
  }

  await expect(page.getByText(/\d+ wallets/)).toBeVisible();
  await waitForClientHydration(page);
  await walletRows.first().click();
  await expect(page.getByText("1 selected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeEnabled();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Activate selected wallets")).toBeVisible();
  await expect(
    page.getByLabel("Type ACTIVATE WALLET to confirm")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Activate wallets" })
  ).toBeDisabled();
});

test("wallet detail renders for the demo wallet when seeded", async ({
  page
}) => {
  await login(page);
  await gotoAppPage(page, "Wallets");
  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible();

  const demoWallet = page.getByRole("link", { name: "Demo Strategy Wallet" });
  await expect(demoWallet).toBeVisible();

  await demoWallet.click();
  await expect(
    page.getByRole("heading", { name: "Demo Strategy Wallet" })
  ).toBeVisible();
  await expect(page.locator("code").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Basescan/ }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Transaction history" })
  ).toBeVisible();

  if (await isVisible(page.locator("a[href*='demo=true']"))) {
    await expect(page.getByText("DEMO").first()).toBeVisible();
  }
});

test("transactions page renders filters and transaction rows or empty state", async ({
  page
}) => {
  await login(page);
  await gotoAppPage(page, "Transactions");

  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "DRY RUN" })).toBeVisible();
  await expect(page.getByRole("button", { name: "SWAP" })).toBeVisible();

  const hasRows = await isVisible(page.getByRole("link", { name: "Open" }));
  const hasEmpty = await isVisible(page.getByText(/No transactions/));
  expect(hasRows || hasEmpty).toBeTruthy();

  if (await isVisible(page.locator("a[href*='demo=true']"))) {
    await expect(page.getByText("DEMO").first()).toBeVisible();
  }
});

test("settings security page keeps runtime, vault, and emergency controls visible", async ({
  page
}) => {
  await login(page);
  await gotoAppPage(page, "Settings");
  await page.getByRole("link", { name: /Security/ }).click();

  await expect(
    page.getByRole("heading", { name: "Security", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Runtime mode" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vault" })).toBeVisible();

  const pauseButton = page.getByRole("button", {
    name: /Enable global emergency pause|Disable global pause/
  });
  await expect(pauseButton).toBeVisible();
  await waitForClientHydration(page);
  await pauseButton.click();

  const typedPrompt = page.getByLabel(
    /Type (ENABLE PAUSE|DISABLE PAUSE) to confirm/
  );
  await expect(typedPrompt).toBeVisible();
  await expect(
    page
      .getByRole("button", {
        name: /Enable global pause|Disable global pause/
      })
      .last()
  ).toBeDisabled();
});

test("settings telegram page renders third-party warning and form controls", async ({
  page
}) => {
  await login(page);
  await gotoAppPage(page, "Settings");
  await page.getByRole("link", { name: /Telegram/ }).click();

  await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible();
  await expect(page.getByText("NOTE")).toBeVisible();
  await expect(page.getByText(/Telegram is third-party infrastructure/)).toBeVisible();
  await expect(page.getByLabel("Bot token")).toBeVisible();
  await expect(page.getByLabel("Chat ID")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send test" })).toBeVisible();
});

test("failed wallet read renders ErrorState instead of an empty state", async ({
  page
}) => {
  await login(page);
  await page.goto("/wallets/not-a-demo-wallet");

  await expect(page.getByText("Wallet API unavailable")).toBeVisible();
  await expect(page.getByText(/API request failed|unavailable/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Retry" })).toBeVisible();
  await expect(page.getByText("No wallets match this filter")).toHaveCount(0);
});
