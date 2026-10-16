import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { requireUser } from "@/features/auth/session";
import { PublishPanel } from "@/features/builder/publish-panel";
import { reviewScenario } from "@/features/builder/review";
import { listVersions, loadBundle } from "@/features/builder/server/db";
import { SetupNotice } from "@/features/builder/setup-notice";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "검수·발행 | 알리바이" };

export default function PublishPage({
  params,
}: PageProps<"/builder/[id]/publish">) {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground text-sm">불러오는 중…</p>}
    >
      <PublishContent params={params} />
    </Suspense>
  );
}

async function PublishContent({
  params,
}: Pick<PageProps<"/builder/[id]/publish">, "params">) {
  if (!getSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  const loaded = await loadBundle(supabase, id);
  if (!loaded) notFound();
  const versions = await listVersions(supabase, id);

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link
          href={`/builder/${id}/edit`}
          className="text-muted-foreground text-sm"
        >
          ← 편집으로
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">검수·발행</h1>
        <p className="text-muted-foreground text-sm">
          {loaded.bundle.scenario.title.trim() || "제목 없는 시나리오"}
        </p>
      </div>
      <div className="flex gap-2 text-sm">
        <Link
          href={`/builder/${id}/preview`}
          className="text-primary hover:underline"
        >
          테스트 플레이 미리보기
        </Link>
      </div>
      <PublishPanel
        scenarioId={id}
        issues={reviewScenario(loaded.bundle)}
        versions={versions}
      />
    </>
  );
}
