"use client";

import { useState } from "react";

import { useNow } from "@/lib/use-now";
import {
  formatRemaining,
  hasTimerPhase,
  STATUS_LABELS,
  timerView,
} from "@/lib/game/room-state";

import { ChatPanel } from "./chat-panel";
import { CharacterCardPanel } from "./character-card";
import { CluesPanel } from "./clues-panel";
import { EndingPanel } from "./ending-panel";
import { GmConsole, GmGuide } from "./gm-console";
import { MissionsPanel } from "./missions-panel";
import { NotesPanel } from "./notes-panel";
import type { RoomContext } from "./room-client";
import { useNotes } from "./use-notes";
import { VotePanel } from "./vote-panel";

type Tab = "common" | "mine" | "notes";
const TABS: [Tab, string][] = [
  ["common", "공통"],
  ["mine", "내 정보"],
  ["notes", "노트"],
];

export function GameView({ ctx }: { ctx: RoomContext }) {
  const { overview } = ctx;
  const [tab, setTab] = useState<Tab>("common");
  const notes = useNotes(ctx, !overview.isGm);
  const { room, scenario, rounds } = overview;
  const round =
    room.currentRoundIndex >= 0 ? rounds[room.currentRoundIndex] : undefined;
  const unlocked = rounds
    .slice(0, room.currentRoundIndex + 1)
    .filter((r) => r.unlockContent);

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
        {room.playMode === "face" && (
          <p className="text-muted-foreground text-xs">
            대면형: 채팅 없이 모여서 대화하며 진행합니다.
          </p>
        )}
        {room.status === "ended" && (
          <p className="text-muted-foreground text-sm">
            게임이 종료되었습니다.
          </p>
        )}
      </section>

      {overview.isGm && <GmConsole ctx={ctx} />}
      {room.status === "ended" && <EndingPanel ctx={ctx} />}
      {room.status === "voting" && <VotePanel ctx={ctx} />}

      {!overview.isGm && (
        <div
          role="tablist"
          aria-label="화면 구역"
          className="flex gap-1.5 lg:hidden"
        >
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-full border px-3 py-1.5 text-sm ${tab === id ? "bg-primary text-primary-foreground border-transparent" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
        <div
          className={`${overview.isGm || tab === "common" ? "flex" : "hidden"} flex-col gap-6 lg:flex`}
        >
          {unlocked.length > 0 && (
            <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
              <h2 className="font-medium">공개된 정보</h2>
              {unlocked.map((r) => (
                <div key={r.id} className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-xs">
                    {r.name}
                  </span>
                  <p className="text-sm whitespace-pre-wrap">
                    {r.unlockContent}
                  </p>
                </div>
              ))}
            </section>
          )}

          {room.voiceLink && (
            <section className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
              <h2 className="font-medium">음성 대화</h2>
              <a
                href={room.voiceLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-sm break-all underline"
              >
                {room.voiceLink}
              </a>
            </section>
          )}

          <CluesPanel ctx={ctx} notes={overview.isGm ? undefined : notes} />
          {room.playMode === "chat" && (
            <ChatPanel ctx={ctx} notes={overview.isGm ? undefined : notes} />
          )}
          {overview.isGm && <GmGuide ctx={ctx} />}

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
        </div>

        {!overview.isGm && (
          <div className="flex flex-col gap-6">
            <div
              className={`${tab === "mine" ? "flex" : "hidden"} flex-col gap-6 lg:flex`}
            >
              <CharacterCardPanel ctx={ctx} />
              <MissionsPanel ctx={ctx} />
            </div>
            <div className={`${tab === "notes" ? "block" : "hidden"} lg:block`}>
              <NotesPanel ctx={ctx} notes={notes} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
