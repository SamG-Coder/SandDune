import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1365, height: 900 },
    launchOptions: {
      args: [
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
