import { connection } from "next/server";
import { Suspense } from "react";

import { SiteHeader } from "@/components/site-header";
import { signOutAction } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/session";
import { Button } from "@/components/ui/button";
import { getSupabaseEnv } from "@/lib/supabase/env";

export default function BuilderLayout({ children }: LayoutProps<"/builder">) {
  return (
    <>
      <SiteHeader
        actions={
          <Suspense>
            <UserMenu />
          </Suspense>
        }
      />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
        <main className="flex flex-1 flex-col gap-6">{children}</main>
      </div>
    </>
  );
}

async function UserMenu() {
  // 인증 토큰 확인은 요청마다 달라질 수 있으므로 정적 프리렌더에서 제외한다.
  await connection();
  if (!getSupabaseEnv()) return null;
  const { email, nickname } = await requireUser();
  return (
    <form action={signOutAction} className="flex items-center gap-3">
      <span className="text-muted-foreground max-w-40 truncate text-sm">
        {nickname || email}
      </span>
      <Button type="submit" variant="outline" size="sm">
        로그아웃
      </Button>
    </form>
  );
}
