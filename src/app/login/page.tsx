import type { Metadata } from "next";
import { Suspense } from "react";

import { SiteHeader } from "@/components/site-header";
import { LoginForm } from "@/features/auth/login-form";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "로그인 | 알리바이" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">로그인</h1>
        </div>
        <Suspense>
          <LoginBody searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function LoginBody({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/builder";
  const callbackError = sp.error === "callback";

  if (!getSupabaseEnv()) {
    return (
      <p role="alert" className="bg-muted rounded-lg p-4 text-sm">
        Supabase 설정이 아직 되어 있지 않습니다. README의 &quot;수동
        설정&quot;을 따라 환경변수를 입력해 주세요.
      </p>
    );
  }
  return (
    <>
      {callbackError && (
        <p role="alert" className="text-destructive text-sm">
          로그인 확인에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}
      <LoginForm next={next} />
    </>
  );
}
