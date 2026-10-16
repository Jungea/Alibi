"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/schemas/scenario";

import type { RoomContext } from "./room-client";
import { drawCard, fetchClues } from "./state";
import { useRemote } from "./use-remote";

/** 증거 보관함 + 카드 뽑기. 뽑지 않은 카드의 내용은 서버가 아무에게도 주지 않는다. */
export function CluesPanel({ ctx }: { ctx: RoomContext }) {
  const { overview } = ctx;
  const [reload, setReload] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [justDrawn, setJustDrawn] = useState<string | null>(null);

  const { data: clues } = useRemote(
    () => fetchClues(ctx.supabase, ctx.roomId),
    `${ctx.pulse}:${reload}`,
  );

  const round = overview.rounds[overview.room.currentRoundIndex];
  const canDraw =
    !overview.isGm &&
    overview.room.status === "round" &&
    !!round?.allowedActions.includes("draw_card");

  const draw = async () => {
    setDrawing(true);
    setDrawError(null);
    const res = await drawCard(ctx.supabase, ctx.roomId);
    setDrawing(false);
    if (res.ok) {
      setJustDrawn(res.data.id);
      setReload((n) => n + 1);
    } else {
      setDrawError(res.error);
    }
  };

  const list = clues ?? [];
  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          {overview.isGm ? "획득된 힌트" : "증거 보관함"} ({list.length})
        </h2>
        {canDraw && (
          <Button size="sm" disabled={drawing} onClick={draw}>
            {drawing ? "뽑는 중…" : "카드 뽑기"}
          </Button>
        )}
      </div>
      {drawError && (
        <p role="alert" className="text-destructive text-sm">
          {drawError}
        </p>
      )}
      {list.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          아직 획득한 힌트가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((c) => (
            <li
              key={c.id}
              className={`flex flex-col gap-1 rounded-lg border p-3 ${c.id === justDrawn ? "border-primary" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.title || "제목 없음"}</span>
                <span className="bg-muted rounded-full px-2 py-0.5 text-xs">
                  {(LABELS.clueKind as Record<string, string>)[c.kind] ??
                    c.kind}
                </span>
                {c.isPublic && (
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">
                    전체 공개
                  </span>
                )}
                {overview.isGm && c.isTrue === false && (
                  <span className="bg-destructive/15 text-destructive rounded-full px-2 py-0.5 text-xs">
                    거짓
                  </span>
                )}
              </div>
              {c.body && (
                <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              )}
              {(c.isPublic || overview.isGm) && c.holderName && (
                <p className="text-muted-foreground text-xs">
                  획득: {c.holderName}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
