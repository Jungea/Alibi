import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { requireUser } from "@/features/auth/session";
import { loadBundle } from "@/features/builder/server/db";
import { SetupNotice } from "@/features/builder/setup-notice";
import { ScenarioWizard } from "@/features/builder/wizard/scenario-wizard";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "시나리오 편집 | 알리바이" };

export default function EditPage({
  params,
  searchParams,
}: PageProps<"/builder/[id]/edit">) {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground text-sm">불러오는 중…</p>}
    >
      <EditContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditContent({
  params,
  searchParams,
}: Pick<PageProps<"/builder/[id]/edit">, "params" | "searchParams">) {
  if (!getSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase, userId } = await requireUser();
  const loaded = await loadBundle(supabase, id);
  if (!loaded) notFound();

  const sp = await searchParams;
  const step = Number(typeof sp.step === "string" ? sp.step : "1") - 1;

  return (
    <ScenarioWizard
      scenarioId={id}
      userId={userId}
      initialBundle={loaded.bundle}
      initialStep={Number.isFinite(step) ? step : 0}
    />
  );
}
