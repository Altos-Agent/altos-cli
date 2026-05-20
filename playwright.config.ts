import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command:
      "bash -lc 'trap \"kill 0\" EXIT; API_PORT=4210 WEB_PORT=3210 pnpm --filter @base-orchestrator/api e2e:server & NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4210 pnpm --filter @base-orchestrator/web exec next dev --port 3210 --hostname 127.0.0.1'",
    url: "http://127.0.0.1:3210/login",
    reuseExistingServer: false,
    timeout: 60_000
  }
});
