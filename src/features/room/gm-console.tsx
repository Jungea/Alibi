"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/schemas/scenario";
import {
  availableEvents,
  hasTimerPhase,
  type RoomEvent,
} from "@/lib/game/room-state";

import type { RoomContext } from "./room-client";
import { fetchGmGuide } from "./state";
import { useRemote } from "./use-remote";

const EVENT_LABELS: Record<RoomEvent, string> = {
  start_game: "게임 시작",
  start_round: "다음 라운드 시작",
  end_round: "라운드 종료",
  start_vote: "투표 시작",
  finish_game: "게임 종료",
};

export function GmConsole({ ctx }: { ctx: RoomContext }) {
  const { overview, players, busy, run } = ctx;
  const { room, rounds, characters } = overview;
  const endings = overview.endings ?? [];
  const [endingId, setEndingId] = useState("");
  const next = rounds[room.currentRoundIndex + 1];
  const events = availableEvents({
    status: room.status,
    currentRoundIndex: room.currentRoundIndex,
    roundCount: rounds.length,
    nextRoundAllowsVote: next?.allowedActions.includes("vote"),
  }).filter((e) => e !== "start_game");

  const nameOf = (id: string) =>
    characters.find((c) => c.id === id)?.name || "이름 없음";
  const paused = room.timerPausedRemaining !== null;
  const hasTimer = room.timerEndsAt !== null || paused;

  const trigger = (e: RoomEvent) => {
    if (e === "start_round") void run("start_round", {});
    if (e === "end_round") void run("end_round", {});
    if (e === "start_vote") void run("start_vote", {});
    if (e === "finish_game") {
      if (
        !window.confirm(
          "게임을 종료하고 결말 공개를 시작할까요? 되돌릴 수 없습니다.",
        )
      )
        return;
      void run("finish_game", { p_ending_id: endingId || null });
    }
  };

  if (room.status === "ended") return null;

  return (
    <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium">GM 콘솔</h2>

      {events.length === 0 && (
        <p className="text-muted-foreground text-sm">
          지금 선택할 수 있는 진행 동작이 없습니다.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {events.map((e) => (
          <Button
            key={e}
            disabled={busy}
            variant={
              e === "start_round" || e === "end_round" ? "default" : "outline"
            }
            onClick={() => trigger(e)}
          >
            {e === "start_round" && next
              ? `다음 라운드 시작: ${next.name || "이름 없음"}`
              : EVENT_LABELS[e]}
          </Button>
        ))}
        {events.includes("finish_game") && endings.length > 1 && (
          <select
            aria-label="공개할 결말"
            className="bg-background rounded-md border px-2 py-2 text-sm"
            value={endingId || endings[0].id}
            onChange={(e) => setEndingId(e.target.value)}
          >
            {endings.map((e) => (
              <option key={e.id} value={e.id}>
                결말: {e.name || "이름 없음"}
              </option>
            ))}
          </select>
        )}
      </div>

      {hasTimerPhase(room.status) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">타이머</span>
          {hasTimer && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run("set_timer_paused", { p_paused: !paused })
              }
            >
              {paused ? <Play /> : <Pause />} {paused ? "재개" : "일시정지"}
            </Button>
          )}
          {[-60, 60, 300].map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              disabled={busy || (!hasTimer && s < 0)}
              onClick={() => void run("extend_timer", { p_seconds: s })}
            >
              {s > 0 ? "+" : "−"}
              {Math.abs(s) / 60}분
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">참가자와 인물 (GM만 보임)</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {players.map((p) => {
            const a = overview.assignments?.find((x) => x.userId === p.user_id);
            return (
              <li key={p.user_id} className="flex items-center gap-2">
                <span
                  aria-label={
                    ctx.online.has(p.user_id) ? "접속 중" : "오프라인"
                  }
                  className={`size-2 rounded-full ${ctx.online.has(p.user_id) ? "bg-emerald-400" : "bg-muted-foreground/40"}`}
                />
                <span className="font-medium">{p.nickname}</span>
                <span className="text-muted-foreground">
                  → {a ? nameOf(a.characterId) : "미배정"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** GM 진행 자료: 진실·범인·타임라인·인물별 비밀. 열 때만 서버에서 읽는다 (GM 만 받을 수 있다). */
export function GmGuide({ ctx }: { ctx: RoomContext }) {
  const [open, setOpen] = useState(false);
  const { data: guide, error } = useRemote(
    () => fetchGmGuide(ctx.supabase, ctx.roomId),
    open,
    open,
  );

  const nameOf = (id: string | null) =>
    guide?.characters.find((c) => c.id === id)?.name || "-";

  return (
    <details
      className="bg-card rounded-xl border p-4"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">
        GM 진행 자료 (진실·비밀)
      </summary>
      <div className="mt-3 flex flex-col gap-4 text-sm">
        {error && !guide && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {!guide && !error && (
          <p className="text-muted-foreground">불러오는 중…</p>
        )}
        {guide && (
          <>
            <div>
              <h3 className="font-medium">범인</h3>
              <p>
                {guide.characters
                  .filter((c) => c.roleType === "culprit")
                  .map((c) => c.name)
                  .join(", ") || "지정되지 않음"}
              </p>
            </div>
            <div>
              <h3 className="font-medium">타임라인</h3>
              <p className="whitespace-pre-wrap">
                {guide.scenario.timeline
                  .map(
                    (t) =>
                      `${t.time || "--:--"} ${nameOf(t.characterId)} @ ${t.place || "-"}: ${t.description}`,
                  )
                  .join("\n") || "-"}
              </p>
            </div>
            <div>
              <h3 className="font-medium">인물별 비밀</h3>
              <ul className="flex flex-col gap-2">
                {guide.characters.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.name || "이름 없음"}</span>{" "}
                    <span className="text-muted-foreground">
                      (
                      {(LABELS.roleType as Record<string, string>)[
                        c.roleType
                      ] ?? c.roleType}
                      )
                    </span>
                    <p className="whitespace-pre-wrap">{c.secretInfo || "-"}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">
                전체 힌트 ({guide.clues.length}장)
              </h3>
              <ul className="flex flex-col gap-1">
                {guide.clues.map((c) => (
                  <li key={c.id}>
                    {c.title || "제목 없음"}
                    {!c.isTrue && (
                      <span className="text-destructive"> · 거짓</span>
                    )}
                    {c.acquireCondition && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {c.acquireCondition}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
