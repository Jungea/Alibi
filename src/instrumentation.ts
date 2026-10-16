import * as Sentry from "@sentry/nextjs";

/** 서버 오류 수집 (Sentry). DSN 이 없으면 꺼진 채로 동작한다. */
export function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0 });
}

export const onRequestError = Sentry.captureRequestError;
