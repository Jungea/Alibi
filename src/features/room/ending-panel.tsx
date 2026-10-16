"use client";

import { Button } from "@/components/ui/button";

import type { RoomContext } from "./room-client";
import { fetchEnding } from "./state";
import { useRemote } from "./use-remote";

const NEXT_LABEL: Record<number, string> = {
  1: "진실 공개",
  2: "후일담 공개",
};

/** 결말: 투표 결과 → 진실 → 후일담 순서로, GM 이 공개한 단계까지만 서버가 돌려준다. */
export function EndingPanel({ ctx }: { ctx: RoomContext }) {
  const { overview, busy, run } = ctx;
  const { data: ending, error } = useRemote(
    () => fetchEnding(ctx.supabase, ctx.roomId),
    `${ctx.pulse}:${overview.room.endingStep}`,
  );
  const step = ending?.step ?? 0;

  return (
    <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">결말</h2>
        {overview.isGm && step < 3 && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run("advance_ending", {})}
          >
            {NEXT_LABEL[step] ?? "다음"}
          </Button>
        )}
      </div>
      {error && !ending && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {ending?.tally && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">투표 결과</h3>
          {ending.tally.length === 0 ? (
            <p className="text-muted-foreground text-sm">투표가 없었습니다.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {ending.tally.map((t, i) => (
                <li
                  key={`${t.name}-${i}`}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-24 truncate">
                    {t.name ?? "알 수 없음"}
                  </span>
                  <span
                    className="bg-primary h-2 rounded-full"
                    style={{
                      width: `${Math.max(8, (t.count / Math.max(...ending.tally!.map((x) => x.count), 1)) * 60)}%`,
                    }}
                  />
                  <span className="text-muted-foreground">{t.count}표</span>
                </li>
              ))}
            </ul>
          )}
          {ending.ballots && ending.ballots.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {ending.ballots
                .map((b) => `${b.voter ?? "?"} → ${b.target ?? "?"}`)
                .join(" · ")}
            </p>
          )}
        </div>
      )}

      {ending?.ending !== undefined && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-medium">진실</h3>
          {ending.culprits && (
            <p className="text-sm">
              범인:{" "}
              <span className="font-semibold">
                {ending.culprits.join(", ") || "알 수 없음"}
              </span>
              {ending.culpritCaught !== undefined && (
                <span className="text-muted-foreground">
                  {" "}
                  · {ending.culpritCaught ? "검거됨" : "놓침"}
                </span>
              )}
            </p>
          )}
          {ending.ending && (
            <>
              <p className="font-medium">{ending.ending.name}</p>
              {ending.ending.resultText && (
                <p className="text-sm whitespace-pre-wrap">
                  {ending.ending.resultText}
                </p>
              )}
              {ending.ending.truthText && (
                <p className="text-sm whitespace-pre-wrap">
                  {ending.ending.truthText}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {ending?.missions && ending.missions.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-medium">미션 달성표</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {ending.missions.map((m, i) => (
              <li key={`${m.title}-${i}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {m.title || "이름 없음"}
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    · {m.scope === "common" ? "공통" : (m.character ?? "개인")}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs ${
                    m.status === "done"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {m.status === "done" ? "달성" : "미달성"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ending?.epilogues && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-medium">인물별 후일담</h3>
          {ending.epilogues.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              준비된 후일담이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ending.epilogues.map((e, i) => (
                <li key={`${e.name}-${i}`} className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-xs">
                    {e.name}
                  </span>
                  <p className="text-sm whitespace-pre-wrap">{e.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step > 0 && step < 3 && !overview.isGm && (
        <p className="text-muted-foreground text-xs">
          GM이 다음 내용을 공개할 때까지 기다려 주세요.
        </p>
      )}
    </section>
  );
}
