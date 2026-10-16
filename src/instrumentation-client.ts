import * as Sentry from "@sentry/nextjs";

/**
 * 브라우저 오류 수집 (Sentry). DSN 이 없으면 아무것도 보내지 않고 꺼진 채로 동작한다.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    // 채팅·인물 정보 같은 화면 내용이 breadcrumb(클릭·입력 기록)로 나가지 않게 한다.
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== "Breadcrumbs"),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
