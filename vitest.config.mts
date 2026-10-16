import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // server-only 는 서버 번들 전용 가드라 테스트에서는 빈 모듈로 대체한다.
    alias: {
      "server-only": new URL(
        "./supabase/tests/helpers/empty.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "supabase/tests/**/*.test.ts",
    ],
    testTimeout: 30_000,
  },
});
