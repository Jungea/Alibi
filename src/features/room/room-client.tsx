"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { computeServerOffset, STATUS_LABELS } from "@/lib/game/room-state";
import { createClient } from "@/lib/supabase/client";

import { GameView } from "./game-view";
import { Lobby } from "./lobby";
import {
  fetchRoomState,
  runRoomCommand,
  type RoomCommandName,
  type RoomState,
} from "./state";

export interface RoomContext extends RoomState {
  supabase: SupabaseClient;
  roomId: string;
  userId: string;
  /** 진행 단계가 바뀌거나 시스템 메시지가 오면 올라가는 값. 카드·힌트·투표·결말을 다시 읽는 기준이다. */
  pulse: number;
  online: ReadonlySet<string>;
  /** 서버 시각 - 이 기기 시각 */
  serverOffsetMs: number;
  busy: boolean;
  /** 상태를 바꾸는 RPC 를 실행한다. 실패하면 화면 위쪽에 오류를 보여준다. */
  run: <K extends RoomCommandName>(
    fn: K,
    args: Omit<Parameters<typeof runRoomCommand<K>>[2], "p_room">,
  ) => Promise<boolean>;
}

const POLL_LOBBY_MS = 8_000;
const POLL_PLAYING_MS = 15_000;

export function RoomClient({
  roomId,
  userId,
  initial,
}: {
  roomId: string;
  userId: string;
  initial: RoomState;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<RoomState>(initial);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(0);
  const seq = useRef(0);
  const signature = useRef("");

  const refresh = useCallback(async () => {
    const n = ++seq.current;
    const result = await fetchRoomState(supabase, roomId);
    if (n !== seq.current) return; // 더 최근 요청이 있으면 오래된 응답은 버린다.
    if (result.ok) {
      setState({ overview: result.overview, players: result.players });
      const { status, currentRoundIndex, endingStep } = result.overview.room;
      const sig = `${status}:${currentRoundIndex}:${endingStep}`;
      if (sig !== signature.current) {
        signature.current = sig;
        setPulse((p) => p + 1);
      }
      setServerOffsetMs(
        computeServerOffset(result.overview.serverNow, Date.now()),
      );
      setRemoved(false);
    } else if (result.forbidden) {
      setRemoved(true); // 내보내졌거나 방이 사라졌다.
    }
  }, [supabase, roomId]);

  // 실시간 변경 알림 + 접속자(Presence). 알림이 늦거나 놓쳐도 아래 폴링이 보정한다.
  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: userId } },
    });
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          setPulse((p) => p + 1); // 힌트 획득·전원 투표 같은 시스템 메시지 뒤에 목록을 다시 읽는다.
        },
      )
      .on("presence", { event: "sync" }, () =>
        setOnline(new Set(Object.keys(channel.presenceState()))),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ online: true });
          void refresh();
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, userId, refresh]);

  const status = state.overview.room.status;
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(
      () => void refresh(),
      status === "lobby" ? POLL_LOBBY_MS : POLL_PLAYING_MS,
    );
    const onWake = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [refresh, status]);

  const run: RoomContext["run"] = useCallback(
    async (fn, args) => {
      setBusy(true);
      setError(null);
      const res = await runRoomCommand(supabase, fn, {
        p_room: roomId,
        ...args,
      } as never);
      setBusy(false);
      if (!res.ok) setError(res.error);
      setPulse((p) => p + 1);
      await refresh();
      return res.ok;
    },
    [supabase, roomId, refresh],
  );

  if (removed) {
    return (
      <div
        role="alert"
        className="bg-card flex flex-col gap-3 rounded-xl border p-6"
      >
        <h1 className="font-medium">이 방에서 나왔습니다</h1>
        <p className="text-muted-foreground text-sm">
          GM이 내보냈거나 방이 사라졌습니다. 다시 입장하려면 초대 코드가
          필요합니다.
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

  const ctx: RoomContext = {
    ...state,
    supabase,
    roomId,
    userId,
    pulse,
    online,
    serverOffsetMs,
    busy,
    run,
  };
  const { overview } = state;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {overview.scenario.title?.trim() || "제목 없는 시나리오"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {[
                overview.scenario.genre,
                overview.scenario.estimatedMinutes
                  ? `약 ${overview.scenario.estimatedMinutes}분`
                  : null,
                overview.isGm ? "GM" : "참가자",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span className="bg-muted rounded-full px-3 py-1 text-sm">
            {STATUS_LABELS[status]}
          </span>
        </div>
        <InviteBar code={overview.room.code} />
      </header>

      {error && (
        <p
          role="alert"
          className="text-destructive border-destructive/40 rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      )}

      {status === "lobby" ? <Lobby ctx={ctx} /> : <GameView ctx={ctx} />}
    </div>
  );
}

function InviteBar({ code }: { code: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = async (kind: "code" | "link") => {
    const text =
      kind === "code" ? code : `${window.location.origin}/join/${code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt("복사해서 사용하세요", text);
    }
  };

  return (
    <div className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-3">
      <span className="text-muted-foreground text-xs">초대 코드</span>
      <span className="font-mono text-xl font-semibold tracking-[0.3em]">
        {code}
      </span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={() => copy("code")}>
          {copied === "code" ? <Check /> : <Copy />} 코드 복사
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy("link")}>
          {copied === "link" ? <Check /> : <Copy />} 링크 복사
        </Button>
      </div>
    </div>
  );
}
