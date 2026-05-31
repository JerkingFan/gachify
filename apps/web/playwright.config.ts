import { defineConfig, devices } from "@playwright/test";

const webURL = process.env.GACHIFY_E2E_WEB_URL ?? "http://localhost:5173";
const apiURL = process.env.GACHIFY_E2E_API_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: webURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: webURL,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_API_PROXY_TARGET: apiURL,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
