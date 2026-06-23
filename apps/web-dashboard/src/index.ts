// @altos/web-dashboard - Web dashboard entry point

import { initDashboard } from "./app.js";

export const VERSION = "0.1.0";
export type { DashboardState } from "./types.js";

export interface DashboardConfig {
  port: number;
  apiUrl?: string;
}

export function createDashboard(_config?: DashboardConfig): unknown {
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => initDashboard());
    } else {
      initDashboard();
    }
  }
  return {};
}
