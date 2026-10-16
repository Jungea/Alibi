import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { buttonVariants } from "@/components/ui/button";
import { fetchRoomState } from "@/features/room/state";
import { TableClient } from "@/features/room/table-client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "테이블 화면 | 알리바이",
  robots: { index: false },
};

export default function TablePage({ params }: PageProps<"/room/[id]/table">) {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground text-sm">불러오는 중…</p>}
    >
      <TableContent params={params} />
    </Suspense>
  );
}

async function TableContent({
  params,
}: Pick<PageProps<"/room/[id]/table">, "params">) {
  if (!getSupabaseEnv()) redirect("/join");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  // 테이블 화면은 방을 연 GM 만 열 수 있다. 내용도 서버가 GM 에게만 돌려준다.
  const state = await fetchRoomState(supabase, id);
  if (!state.ok || !state.overview.isGm) {
    return (
      <div
        role="alert"
        className="bg-card flex flex-col gap-3 rounded-xl border p-6"
      >
        <h1 className="font-medium">테이블 화면은 GM만 열 수 있습니다</h1>
        <p className="text-muted-foreground text-sm">
          방을 만든 계정으로 로그인한 브라우저에서 열어 주세요.
        </p>
        <Link
          href="/builder"
          className={buttonVariants({ className: "self-start" })}
        >
          내 시나리오로 이동
        </Link>
      </div>
    );
  }

  return <TableClient roomId={id} />;
}
