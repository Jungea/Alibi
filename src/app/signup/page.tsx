import type { Metadata } from "next";
import { Suspense } from "react";

import { SiteHeader } from "@/components/site-header";
import { SignupForm } from "@/features/auth/signup-form";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "회원가입 | 알리바이" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">회원가입</h1>
        </div>
        <Suspense>
          <SignupBody searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function SignupBody({
  searchParams,
}: {
  searchParams: PageProps<"/signup">["searchParams"];
}) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/builder";

  if (!getSupabaseEnv()) {
    return (
      <p role="alert" className="bg-muted rounded-lg p-4 text-sm">
        Supabase 설정이 아직 되어 있지 않습니다. README의 &quot;수동
        설정&quot;을 따라 환경변수를 입력해 주세요.
      </p>
    );
  }
  return <SignupForm next={next} />;
}
