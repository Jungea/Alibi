import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { requireUser } from "@/features/auth/session";
import { PreviewClient } from "@/features/builder/preview-client";
import { loadBundle } from "@/features/builder/server/db";
import { SetupNotice } from "@/features/builder/setup-notice";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "테스트 플레이 | 알리바이" };

export default function PreviewPage({
  params,
}: PageProps<"/builder/[id]/preview">) {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground text-sm">불러오는 중…</p>}
    >
      <PreviewContent params={params} />
    </Suspense>
  );
}

async function PreviewContent({
  params,
}: Pick<PageProps<"/builder/[id]/preview">, "params">) {
  if (!getSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  const loaded = await loadBundle(supabase, id);
  if (!loaded) notFound();

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link
          href={`/builder/${id}/edit`}
          className="text-muted-foreground text-sm"
        >
          ← 편집으로
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">테스트 플레이</h1>
        <p className="text-muted-foreground text-sm">
          인물을 바꿔가며 각 플레이어에게 무엇이 보이는지 확인합니다.
        </p>
      </div>
      <PreviewClient bundle={loaded.bundle} />
    </>
  );
}
