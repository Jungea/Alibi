import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { buttonVariants } from "@/components/ui/button";
import { fetchRoomState } from "@/features/room/state";
import { RoomClient } from "@/features/room/room-client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "게임방 | 알리바이" };

export default function RoomPage({ params }: PageProps<"/room/[id]">) {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground text-sm">불러오는 중…</p>}
    >
      <RoomContent params={params} />
    </Suspense>
  );
}

async function RoomContent({
  params,
}: Pick<PageProps<"/room/[id]">, "params">) {
  if (!getSupabaseEnv()) redirect("/join");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // 세션이 없으면 새로고침·재접속으로 온 사람이 아니므로 입장 화면으로 보낸다.
  if (!data?.claims) redirect("/join");

  const state = await fetchRoomState(supabase, id);
  if (!state.ok) {
    return (
      <div
        role="alert"
        className="bg-card flex flex-col gap-3 rounded-xl border p-6"
      >
        <h1 className="font-medium">
          {state.forbidden
            ? "이 방의 참가자가 아닙니다"
            : "방을 불러오지 못했습니다"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {state.forbidden
            ? "초대 코드로 입장한 뒤에 볼 수 있습니다."
            : state.error}
        </p>
        <Link
          href="/join"
          className={buttonVariants({ className: "self-start" })}
        >
          초대 코드로 입장
        </Link>
      </div>
    );
  }

  return (
    <RoomClient
      roomId={id}
      userId={data.claims.sub}
      initial={{ overview: state.overview, players: state.players }}
    />
  );
}
