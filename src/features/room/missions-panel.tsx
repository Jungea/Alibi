"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import type { RoomContext } from "./room-client";
import { fetchMyMissions } from "./state";
import type { MissionStatus } from "./types";
import { useRemote } from "./use-remote";

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  open: "진행 중",
  reported: "GM 확인 대기",
  done: "달성",
  failed: "실패",
};

const POLL_MS = 10_000;

/** 내 미션 (숨김 미션은 나오지 않는다). 자가 보고 미션은 달성했다고 알리면 GM이 확인한다. */
export function MissionsPanel({ ctx }: { ctx: RoomContext }) {
  const { busy, run } = ctx;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);

  const { data: missions } = useRemote(
    () => fetchMyMissions(ctx.supabase, ctx.roomId),
    `${ctx.pulse}:${tick}`,
  );
  if (!missions || missions.length === 0) return null;

  const canReport = ["round", "break", "voting"].includes(
    ctx.overview.room.status,
  );

  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-medium">내 미션</h2>
      <ul className="flex flex-col gap-3">
        {missions.map((m) => (
          <li
            key={m.id}
            className="flex flex-col gap-1.5 rounded-lg border p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.title || "이름 없음"}</span>
              <span className="text-muted-foreground text-xs">
                {m.scope === "common" ? "공통" : "개인"}
              </span>
              <span
                className={`ml-auto rounded-full px-2.5 py-0.5 text-xs ${
                  m.status === "done"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : m.status === "failed"
                      ? "bg-destructive/20 text-destructive"
                      : "bg-muted"
                }`}
              >
                {MISSION_STATUS_LABELS[m.status]}
              </span>
            </div>
            {m.description && (
              <p className="text-sm whitespace-pre-wrap">{m.description}</p>
            )}
            {m.status === "open" && m.judgeType === "self_report" && (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                disabled={busy || !canReport}
                onClick={() => void run("report_mission", { p_mission: m.id })}
              >
                달성했어요
              </Button>
            )}
            {m.status === "open" && m.judgeType !== "self_report" && (
              <p className="text-muted-foreground text-xs">
                GM이 직접 판정합니다.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
