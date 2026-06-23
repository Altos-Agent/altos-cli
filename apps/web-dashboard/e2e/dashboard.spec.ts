// @altos/web-dashboard - Playwright e2e tests

import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:3002";
const API_BASE = "http://localhost:3001/api";

test.describe("Altos Web Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`[browser console error] ${msg.text()}`);
      }
    });
  });

  test("loads the sessions page without crashing", async ({ page }) => {
    await page.goto(BASE);
    // Should redirect to /sessions
    await page.waitForURL(/#\/sessions/);
    // Sidebar should be visible
    await expect(page.locator(".sidebar")).toBeVisible();
    // Main content area
    await expect(page.locator("#main-content")).toBeVisible();
  });

  test("sessions page shows the page title", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector(".main-header h2");
    await expect(page.locator(".main-header h2")).toContainText("Sessions");
  });

  test("navigation sidebar has all routes", async ({ page }) => {
    await page.goto(BASE);
    const navItems = page.locator(".nav-item");
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(7);
  });

  test("navigates to Tools page", async ({ page }) => {
    await page.goto(BASE);
    await page.click('a[href="#/tools"]');
    await page.waitForURL(/#\/tools/);
    await expect(page.locator(".main-header h2")).toContainText("Tools");
  });

  test("navigates to Plugins page", async ({ page }) => {
    await page.goto(BASE);
    await page.click('a[href="#/plugins"]');
    await page.waitForURL(/#\/plugins/);
    await expect(page.locator(".main-header h2")).toContainText("Plugins");
  });

  test("navigates to Skills page", async ({ page }) => {
    await page.goto(BASE);
    await page.click('a[href="#/skills"]');
    await page.waitForURL(/#\/skills/);
    await expect(page.locator(".main-header h2")).toContainText("Skills");
  });

  test("navigates to MCP page", async ({ page }) => {
    await page.goto(BASE);
    await page.click('a[href="#/mcp"]');
    await page.waitForURL(/#\/mcp/);
    await expect(page.locator(".main-header h2")).toContainText("MCP");
  });

  test("navigates to Memory page", async ({ page }) => {
    await page.goto(BASE);
    await page.click('a[href="#/memory"]');
    await page.waitForURL(/#\/memory/);
    await expect(page.locator(".main-header h2")).toContainText("Memory");
  });

  test("navigates to Settings page", async ({ page }) => {
    await page.goto(BASE);
    await page.click('a[href="#/settings"]');
    await page.waitForURL(/#\/settings/);
    await expect(page.locator(".main-header h2")).toContainText("Settings");
  });

  test("session row is clickable", async ({ page }) => {
    await page.goto(BASE);
    // Just verify session rows render without error (may be empty)
    const rows = page.locator(".session-row");
    const count = await rows.count();
    // If sessions exist, rows should be there; if not, empty state should show
    if (count > 0) {
      await expect(rows.first()).toBeVisible();
    } else {
      await expect(page.locator(".empty-state")).toBeVisible();
    }
  });

  test("settings form has inputs", async ({ page }) => {
    await page.goto(`${BASE}/#/settings`);
    await page.waitForSelector(".form-input");
    const inputs = page.locator(".form-input");
    expect(await inputs.count()).toBeGreaterThan(0);
  });

  test("memory page shows memory bars", async ({ page }) => {
    await page.goto(`${BASE}/#/memory`);
    await page.waitForSelector(".memory-bar-wrap");
    const bars = page.locator(".memory-bar-wrap");
    expect(await bars.count()).toBeGreaterThan(0);
  });

  test("mcp page shows table of servers", async ({ page }) => {
    await page.goto(`${BASE}/#/mcp`);
    await page.waitForSelector("table");
    await expect(page.locator("table th").first()).toContainText("Server");
  });

  test("no console errors on any page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    const routes = ["/sessions", "/tools", "/plugins", "/skills", "/mcp", "/memory", "/settings"];
    for (const route of routes) {
      await page.goto(`${BASE}/#${route}`);
      await page.waitForLoadState("networkidle");
    }

    // Filter out known non-critical errors (e.g. favicon 404)
    const criticalErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("net::ERR_CONNECTION_REFUSED"),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
