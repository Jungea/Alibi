import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 는 실제 Supabase 프로젝트(개발용)가 필요하다. .env.local 에 연결 정보가 있어야 하고,
 * 개발용 프로젝트는 "Confirm email"이 꺼져 있고 Anonymous Sign-Ins 가 켜져 있어야 한다.
 * E2E_BASE_URL 을 주면 그 주소(배포 미리보기 등)를 대상으로, 없으면 로컬 개발 서버를 띄운다.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
