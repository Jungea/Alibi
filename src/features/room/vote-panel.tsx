"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import type { RoomContext } from "./room-client";
import { fetchVoteStatus } from "./state";
import { useRemote } from "./use-remote";

/** 범인 투표 (1인 1표). 누가 누구에게 투표했는지는 결말 공개 전에는 아무에게도 보이지 않는다. */
export function VotePanel({ ctx }: { ctx: RoomContext }) {
  const { overview, busy, run } = ctx;
  const [tick, setTick] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);

  // 다른 사람의 투표 진행 상황을 주기적으로 반영한다.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const { data: status } = useRemote(
    () => fetchVoteStatus(ctx.supabase, ctx.roomId),
    `${ctx.pulse}:${tick}`,
  );

  const nameOf = (id: string) =>
    overview.characters.find((c) => c.id === id)?.name || "이름 없음";
  const candidates = overview.characters.filter(
    (c) => c.id !== overview.myCharacterId,
  );

  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">범인 투표</h2>
        {status && (
          <span className="text-muted-foreground text-xs">
            {status.voted} / {status.total}명 투표
          </span>
        )}
      </div>

      {overview.isGm ? (
        <p className="text-muted-foreground text-sm">
          {status?.pending && status.pending.length > 0
            ? `아직 투표하지 않음: ${status.pending.join(", ")}`
            : "모든 참가자가 투표했습니다. 라운드를 종료하거나 게임을 종료하세요."}
        </p>
      ) : status?.myVote ? (
        <p className="text-sm">
          <span className="font-medium">{nameOf(status.myVote)}</span>에게
          투표했습니다. 결과는 결말 공개 때 나옵니다.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            범인이라고 생각하는 인물을 한 명 고르세요. 투표는 바꿀 수 없습니다.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {candidates.map((c) => (
              <li key={c.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${choice === c.id ? "border-primary bg-primary/10" : ""}`}
                >
                  <input
                    type="radio"
                    name="vote-target"
                    checked={choice === c.id}
                    onChange={() => setChoice(c.id)}
                  />
                  {c.name || "이름 없음"}
                </label>
              </li>
            ))}
          </ul>
          <Button
            disabled={busy || !choice}
            onClick={() => {
              if (
                choice &&
                window.confirm(
                  `${nameOf(choice)}에게 투표할까요? 바꿀 수 없습니다.`,
                )
              )
                void run("cast_vote", { p_target: choice });
            }}
          >
            투표하기
          </Button>
        </>
      )}
    </section>
  );
}
