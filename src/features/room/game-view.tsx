"use client";

import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useNow } from "@/lib/use-now";
import {
  availableEvents,
  formatRemaining,
  hasTimerPhase,
  STATUS_LABELS,
  timerView,
  type RoomEvent,
} from "@/lib/game/room-state";

import type { RoomContext } from "./room-client";

export function GameView({ ctx }: { ctx: RoomContext }) {
  const { overview, players } = ctx;
  const { room, scenario, rounds, characters } = overview;
  const round = roundAt(rounds, room.currentRoundIndex);
  const myCharacter = characters.find((c) => c.id === overview.myCharacterId);

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            {round
              ? `${room.currentRoundIndex + 1}. ${round.name}`
              : STATUS_LABELS[room.status]}
          </h2>
          {room.status === "voting" && (
            <span className="bg-primary text-primary-foreground rounded-full px-3 py-0.5 text-xs">
              투표 단계
            </span>
          )}
        </div>
        {room.status === "intro" && (
          <p className="text-muted-foreground text-sm">
            {overview.isGm
              ? "참가자들이 인물을 확인하는 중입니다. 준비되면 첫 라운드를 시작하세요."
              : "내 인물을 확인하세요. GM이 첫 라운드를 시작할 때까지 기다려 주세요."}
          </p>
        )}
        {round?.goal && room.status !== "intro" && (
          <p className="text-sm whitespace-pre-wrap">{round.goal}</p>
        )}
        {hasTimerPhase(room.status) && <RoundTimer ctx={ctx} />}
        {room.status === "break" && (
          <p className="text-muted-foreground text-sm">
            라운드가 끝났습니다. GM이 다음 진행을 선택할 때까지 기다려 주세요.
          </p>
        )}
        {room.status === "ended" && (
          <p className="text-sm">
            게임이 종료되었습니다. 투표 결과와 결말 공개는 다음 업데이트에서
            제공됩니다.
          </p>
        )}
      </section>

      {overview.isGm ? (
        <GmConsole ctx={ctx} />
      ) : (
        <section className="bg-card flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="font-medium">내 인물</h2>
          {myCharacter ? (
            <>
              <p className="text-lg font-semibold">
                {myCharacter.name || "이름 없음"}
              </p>
              {myCharacter.publicInfo && (
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                  {myCharacter.publicInfo}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              배정된 인물이 없습니다.
            </p>
          )}
        </section>
      )}

      <section className="bg-card flex flex-col gap-2 rounded-xl border p-4">
        <h2 className="font-medium">사건 개요</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <Info label="피해자" value={scenario.victim} />
          <Info
            label="사건 시각 / 장소"
            value={[scenario.incidentTime, scenario.incidentPlace]
              .filter(Boolean)
              .join(" / ")}
          />
          <Info label="오프닝" value={scenario.openingText} />
        </dl>
      </section>

      <p className="text-muted-foreground text-xs">
        참가자 {players.length}명 · 라운드 {rounds.length}개
      </p>
    </div>
  );
}

function roundAt(rounds: RoomContext["overview"]["rounds"], index: number) {
  return index >= 0 ? rounds[index] : undefined;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function RoundTimer({ ctx }: { ctx: RoomContext }) {
  const now = useNow();
  const { room } = ctx.overview;
  const view = timerView(room, now, ctx.serverOffsetMs);
  if (view.kind === "none")
    return <p className="text-muted-foreground text-sm">시간 제한 없음</p>;

  const urgent = view.kind === "running" && view.remainingMs <= 60_000;
  return (
    <div className="flex items-baseline gap-3" role="timer" aria-live="off">
      <span
        className={`font-mono text-4xl font-semibold tabular-nums ${urgent ? "text-destructive" : ""}`}
      >
        {formatRemaining(view.remainingMs)}
      </span>
      <span className="text-muted-foreground text-sm">
        {view.kind === "paused"
          ? "일시정지"
          : view.remainingMs === 0
            ? "시간 종료"
            : "남음"}
      </span>
    </div>
  );
}

const EVENT_LABELS: Record<RoomEvent, string> = {
  start_game: "게임 시작",
  start_round: "다음 라운드 시작",
  end_round: "라운드 종료",
  start_vote: "투표 시작",
  finish_game: "게임 종료",
};

function GmConsole({ ctx }: { ctx: RoomContext }) {
  const { overview, players, busy, run } = ctx;
  const { room, rounds, characters } = overview;
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
    if (
      e === "finish_game" &&
      !window.confirm("게임을 종료할까요? 되돌릴 수 없습니다.")
    )
      return;
    if (e === "start_round") void run("start_round", {});
    if (e === "end_round") void run("end_round", {});
    if (e === "start_vote") void run("start_vote", {});
    if (e === "finish_game") void run("finish_game", {});
  };

  return (
    <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium">GM 콘솔</h2>

      {events.length === 0 && room.status !== "ended" && (
        <p className="text-muted-foreground text-sm">
          지금 선택할 수 있는 진행 동작이 없습니다.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
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
