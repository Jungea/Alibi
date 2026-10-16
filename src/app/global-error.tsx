"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** 앱 전체가 깨졌을 때의 마지막 화면. 오류는 Sentry 로 보낸다 (DSN 이 없으면 보내지 않음). */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
        <h1 className="text-xl font-semibold">문제가 발생했습니다</h1>
        <p className="text-sm text-neutral-400">
          잠시 후 다시 시도해 주세요. 계속되면 새로고침하거나 다시 입장해
          주세요.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
