import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Copy, DoorOpen, Download, Pencil, Plus, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/features/auth/session";
import {
  createScenarioAction,
  deleteScenarioAction,
  duplicateAction,
} from "@/features/builder/actions";
import { ConfirmSubmitButton } from "@/features/builder/confirm-submit-button";
import { ImportButton } from "@/features/builder/import-button";
import { listScenarios } from "@/features/builder/server/db";
import { SetupNotice } from "@/features/builder/setup-notice";
import { createRoomAction } from "@/features/room/actions";
import { listActiveRooms } from "@/features/room/list";
import { STATUS_LABELS } from "@/lib/game/room-state";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "내 시나리오 | 알리바이" };

export default function BuilderPage({ searchParams }: PageProps<"/builder">) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">내 시나리오</h1>
          <p className="text-muted-foreground text-sm">
            머더미스터리를 만들고 발행합니다.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <ImportButton />
          <form action={createScenarioAction}>
            <Button type="submit">
              <Plus /> 새 시나리오
            </Button>
          </form>
        </div>
      </div>
      <Suspense
        fallback={<p className="text-muted-foreground text-sm">불러오는 중…</p>}
      >
        <RoomNotice searchParams={searchParams} />
        <ActiveRooms />
        <ScenarioList />
      </Suspense>
    </>
  );
}

async function RoomNotice({
  searchParams,
}: {
  searchParams: PageProps<"/builder">["searchParams"];
}) {
  const sp = await searchParams;
  const message = typeof sp.roomError === "string" ? sp.roomError : null;
  if (!message) return null;
  return (
    <p
      role="alert"
      className="text-destructive border-destructive/40 rounded-lg border p-3 text-sm"
    >
      {message.slice(0, 200)}
    </p>
  );
}

async function ActiveRooms() {
  if (!getSupabaseEnv()) return null;
  const { supabase, userId } = await requireUser();
  const rooms = await listActiveRooms(supabase, userId);
  if (rooms.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">진행 중인 방</h2>
      <ul className="flex flex-col gap-2">
        {rooms.map((r) => (
          <li key={r.id}>
            <Link
              href={`/room/${r.id}`}
              className="bg-card hover:bg-muted/50 flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
            >
              <span className="font-mono text-base font-semibold tracking-widest">
                {r.code}
              </span>
              <span className="text-muted-foreground">
                {STATUS_LABELS[r.status]} ·{" "}
                {new Date(r.created_at).toLocaleString("ko-KR")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ScenarioList() {
  if (!getSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireUser();
  const scenarios = await listScenarios(supabase);

  if (scenarios.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        아직 시나리오가 없습니다. 새 시나리오를 만들어 보세요.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {scenarios.map((s) => (
        <li
          key={s.id}
          className="bg-card flex flex-col gap-3 rounded-xl border p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link
                href={`/builder/${s.id}/edit`}
                className="truncate font-medium hover:underline"
              >
                {s.title.trim() || "제목 없는 시나리오"}
              </Link>
              <p className="text-muted-foreground text-xs">
                {[s.genre, `${s.minPlayers}~${s.maxPlayers}명`]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                · 수정 {new Date(s.updatedAt).toLocaleDateString("ko-KR")}
              </p>
            </div>
            <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs">
              {s.latestVersion
                ? `발행 v${s.latestVersion.versionNo} · ${s.latestVersion.visibility === "public" ? "공개" : "비공개"}`
                : "작성 중"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/builder/${s.id}/edit`}
              className={buttonVariants({ size: "sm" })}
            >
              <Pencil /> 편집
            </Link>
            <Link
              href={`/builder/${s.id}/export`}
              prefetch={false}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Download /> 내보내기
            </Link>
            {s.latestVersion && (
              <form action={createRoomAction}>
                <input
                  type="hidden"
                  name="versionId"
                  value={s.latestVersion.id}
                />
                <Button type="submit" size="sm" variant="secondary">
                  <DoorOpen /> 방 만들기
                </Button>
              </form>
            )}
            <form action={duplicateAction}>
              <input type="hidden" name="id" value={s.id} />
              <Button type="submit" size="sm" variant="outline">
                <Copy /> 복제
              </Button>
            </form>
            <form action={deleteScenarioAction}>
              <input type="hidden" name="id" value={s.id} />
              <ConfirmSubmitButton
                size="sm"
                variant="destructive"
                confirmText={`"${s.title.trim() || "제목 없는 시나리오"}"을(를) 삭제할까요? 발행본도 함께 삭제되며 되돌릴 수 없습니다.`}
              >
                <Trash2 /> 삭제
              </ConfirmSubmitButton>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
