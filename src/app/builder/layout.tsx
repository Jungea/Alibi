import Link from "next/link";
import { Suspense } from "react";

import { signOutAction } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/session";
import { Button } from "@/components/ui/button";
import { getSupabaseEnv } from "@/lib/supabase/env";

export default function BuilderLayout({ children }: LayoutProps<"/builder">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          알리바이
        </Link>
        <Suspense>
          <UserMenu />
        </Suspense>
      </header>
      <main className="flex flex-1 flex-col gap-6">{children}</main>
    </div>
  );
}

async function UserMenu() {
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
