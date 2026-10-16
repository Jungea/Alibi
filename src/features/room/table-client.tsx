"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  computeServerOffset,
  formatRemaining,
  hasTimerPhase,
  STATUS_LABELS,
  timerView,
} from "@/lib/game/room-state";
import { createClient } from "@/lib/supabase/client";
import { useNow } from "@/lib/use-now";

import { InviteQr } from "./invite-qr";
import { fetchEnding, fetchTableView } from "./state";
import type { EndingResult, TableView } from "./types";
import { useRemote } from "./use-remote";

const POLL_MS = 5_000;

/**
 * TV·PC 에 띄우는 공용 화면. 서버가 GM 에게만 돌려주는 공개 정보(get_table_view)만 쓰며,
 * 인물 카드·비밀·개인 힌트·귓속말·미션은 이 화면에 없다.
 */
export function TableClient({ roomId }: { roomId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<TableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [pulse, setPulse] = useState(0);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const n = ++seq.current;
    const r = await fetchTableView(supabase, roomId);
    if (n !== seq.current) return;
    if (r.ok) {
      setView(r.data);
      setError(null);
      setOffset(computeServerOffset(r.data.serverNow, Date.now()));
      setPulse((p) => p + 1);
    } else {
      setError(r.error);
    }
  }, [supabase, roomId]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), POLL_MS);
    const channel = supabase
      .channel(`table:${roomId}`)
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
      // 카드 획득·전원 투표 같은 시스템 메시지가 오면 다시 읽는다.
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      clearTimeout(first);
      clearInterval(id);
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, refresh]);

  const showEnding = view?.status === "ended" && view.endingStep > 0;
  const { data: ending } = useRemote(
    () => fetchEnding(supabase, roomId),
    `${pulse}:${view?.endingStep}`,
    showEnding,
  );

  if (!view) {
    return (
      <Shell>
        <p className="text-muted-foreground text-xl">
          {error ?? "불러오는 중…"}
        </p>
      </Shell>
    );
  }

  const round =
    view.currentRoundIndex >= 0 ? view.rounds[view.currentRoundIndex] : null;

  return (
    <Shell>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl font-semibold tracking-tight">
            {view.scenario.title?.trim() || "제목 없는 시나리오"}
          </h1>
          <p className="text-muted-foreground text-xl">
            {[view.scenario.genre, STATUS_LABELS[view.status]]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-muted-foreground text-sm">초대 코드</span>
          <span className="font-mono text-5xl font-semibold tracking-[0.3em]">
            {view.code}
          </span>
        </div>
      </header>

      {error && (
        <p role="alert" className="text-destructive text-lg">
          {error}
        </p>
      )}

      {view.status === "lobby" ? (
        <Lobby view={view} />
      ) : (
        <>
          <section className="bg-card flex flex-col gap-4 rounded-2xl border p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-4xl font-semibold">
                {round
                  ? `${view.currentRoundIndex + 1}. ${round.name}`
                  : STATUS_LABELS[view.status]}
              </h2>
              {hasTimerPhase(view.status) && (
                <BigTimer view={view} offset={offset} />
              )}
            </div>
            {round?.goal && view.status !== "intro" && (
              <p className="text-2xl whitespace-pre-wrap">{round.goal}</p>
            )}
            {view.status === "intro" && (
              <p className="text-muted-foreground text-2xl">
                각자 폰에서 내 인물을 확인하세요.
              </p>
            )}
            {view.status === "break" && (
              <p className="text-muted-foreground text-2xl">
                라운드가 끝났습니다. 잠시 기다려 주세요.
              </p>
            )}
            {view.status === "voting" && (
              <p className="text-3xl">
                투표 {view.votes.voted} / {view.votes.total}명 완료
              </p>
            )}
          </section>

          {view.status === "ended" && ending && <TableEnding ending={ending} />}

          {view.rounds.some((r) => r.unlockContent) && (
            <section className="flex flex-col gap-3">
              <h2 className="text-2xl font-semibold">공개된 정보</h2>
              {view.rounds
                .filter((r) => r.unlockContent)
                .map((r, i) => (
                  <div
                    key={i}
                    className="bg-card flex flex-col gap-1 rounded-2xl border p-6"
                  >
                    <span className="text-muted-foreground text-lg">
                      {r.name}
                    </span>
                    <p className="text-2xl whitespace-pre-wrap">
                      {r.unlockContent}
                    </p>
                  </div>
                ))}
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold">
              공개 힌트 ({view.clues.length})
            </h2>
            {view.clues.length === 0 ? (
              <p className="text-muted-foreground text-xl">
                아직 공개된 힌트가 없습니다.
              </p>
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {view.clues.map((c) => (
                  <li
                    key={c.id}
                    className="bg-card flex flex-col gap-2 rounded-2xl border p-6"
                  >
                    <span className="text-2xl font-semibold">
                      {c.title || "제목 없음"}
                    </span>
                    <p className="text-xl whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Overview view={view} />
          <Characters view={view} />
        </>
      )}

      {view.voiceLink && (
        <p className="text-muted-foreground text-lg">
          음성 대화: <span className="break-all">{view.voiceLink}</span>
        </p>
      )}
    </Shell>
  );
}

/** 라우트 레이아웃의 좁은 폭을 벗어나 화면 전체를 쓴다. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background fixed inset-0 z-50 overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 p-8">
        {children}
        <Link
          href="/builder"
          className="text-muted-foreground self-start text-sm underline"
        >
          GM 화면으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

function Lobby({ view }: { view: TableView }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
      <section className="bg-card flex flex-col items-center gap-3 rounded-2xl border p-8">
        <h2 className="text-2xl font-semibold">폰으로 스캔해서 입장</h2>
        <InviteQr code={view.code} size={320} />
      </section>
      <section className="bg-card flex flex-col gap-4 rounded-2xl border p-8">
        <h2 className="text-2xl font-semibold">
          참가자 {view.players.length} / {view.maxPlayers}
        </h2>
        {view.players.length === 0 ? (
          <p className="text-muted-foreground text-xl">
            아직 아무도 입장하지 않았습니다.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {view.players.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl border p-4 text-2xl"
              >
                {p.nickname}
                <span
                  className={`text-lg ${p.ready ? "text-emerald-300" : "text-muted-foreground"}`}
                >
                  {p.ready ? "준비 완료" : "대기 중"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Characters view={view} className="lg:col-span-2" />
    </div>
  );
}

function BigTimer({ view, offset }: { view: TableView; offset: number }) {
  const now = useNow();
  const t = timerView(view, now, offset);
  if (t.kind === "none")
    return (
      <span className="text-muted-foreground text-2xl">시간 제한 없음</span>
    );
  const urgent = t.kind === "running" && t.remainingMs <= 60_000;
  return (
    <div className="flex items-baseline gap-4" role="timer" aria-live="off">
      <span
        className={`font-mono text-8xl font-semibold tabular-nums ${urgent ? "text-destructive" : ""}`}
      >
        {formatRemaining(t.remainingMs)}
      </span>
      {t.kind === "paused" && (
        <span className="text-muted-foreground text-2xl">일시정지</span>
      )}
    </div>
  );
}

function Overview({ view }: { view: TableView }) {
  const { victim, incidentTime, incidentPlace, openingText } = view.scenario;
  if (!victim && !incidentTime && !incidentPlace && !openingText) return null;
  return (
    <section className="bg-card flex flex-col gap-2 rounded-2xl border p-6">
      <h2 className="text-2xl font-semibold">사건 개요</h2>
      {victim && <p className="text-xl">피해자: {victim}</p>}
      {(incidentTime || incidentPlace) && (
        <p className="text-xl">
          {[incidentTime, incidentPlace].filter(Boolean).join(" / ")}
        </p>
      )}
      {openingText && (
        <p className="text-xl whitespace-pre-wrap">{openingText}</p>
      )}
    </section>
  );
}

function Characters({
  view,
  className = "",
}: {
  view: TableView;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <h2 className="text-2xl font-semibold">등장인물</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {view.characters.map((c, i) => (
          <li
            key={i}
            className="bg-card flex flex-col gap-1 rounded-2xl border p-5"
          >
            <span className="text-2xl font-semibold">
              {c.name || "이름 없음"}
            </span>
            {c.publicInfo && (
              <p className="text-muted-foreground text-lg whitespace-pre-wrap">
                {c.publicInfo}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 결말 연출: GM 이 공개한 단계까지만 서버가 돌려준다. */
function TableEnding({ ending }: { ending: EndingResult }) {
  return (
    <section className="bg-card flex flex-col gap-6 rounded-2xl border p-8">
      <h2 className="text-4xl font-semibold">결말</h2>

      {ending.tally && (
        <div className="flex flex-col gap-3">
          <h3 className="text-2xl font-semibold">투표 결과</h3>
          {ending.tally.length === 0 ? (
            <p className="text-muted-foreground text-xl">투표가 없었습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {ending.tally.map((t, i) => {
                const max = Math.max(...ending.tally!.map((x) => x.count), 1);
                return (
                  <li key={i} className="flex items-center gap-4 text-2xl">
                    <span className="w-40 truncate">
                      {t.name ?? "알 수 없음"}
                    </span>
                    <span
                      className="bg-primary h-5 rounded-full"
                      style={{ width: `${Math.max(6, (t.count / max) * 60)}%` }}
                    />
                    <span className="text-muted-foreground">{t.count}표</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {ending.ending !== undefined && (
        <div className="flex flex-col gap-3 border-t pt-6">
          <h3 className="text-2xl font-semibold">진실</h3>
          {ending.culprits && (
            <p className="text-3xl">
              범인:{" "}
              <span className="font-semibold">
                {ending.culprits.join(", ") || "알 수 없음"}
              </span>
              {ending.culpritCaught !== undefined && (
                <span className="text-muted-foreground text-xl">
                  {" "}
                  · {ending.culpritCaught ? "검거됨" : "놓침"}
                </span>
              )}
            </p>
          )}
          {ending.ending && (
            <>
              <p className="text-3xl font-semibold">{ending.ending.name}</p>
              {ending.ending.resultText && (
                <p className="text-2xl whitespace-pre-wrap">
                  {ending.ending.resultText}
                </p>
              )}
              {ending.ending.truthText && (
                <p className="text-2xl whitespace-pre-wrap">
                  {ending.ending.truthText}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {ending.missions && ending.missions.length > 0 && (
        <div className="flex flex-col gap-3 border-t pt-6">
          <h3 className="text-2xl font-semibold">미션 달성표</h3>
          <ul className="flex flex-col gap-2 text-xl">
            {ending.missions.map((m, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="flex-1">
                  {m.title || "이름 없음"}
                  <span className="text-muted-foreground text-lg">
                    {" "}
                    · {m.scope === "common" ? "공통" : (m.character ?? "개인")}
                  </span>
                </span>
                <span
                  className={
                    m.status === "done"
                      ? "text-emerald-300"
                      : "text-muted-foreground"
                  }
                >
                  {m.status === "done" ? "달성" : "미달성"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ending.epilogues && (
        <div className="flex flex-col gap-3 border-t pt-6">
          <h3 className="text-2xl font-semibold">인물별 후일담</h3>
          <ul className="flex flex-col gap-4">
            {ending.epilogues.map((e, i) => (
              <li key={i} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-lg">{e.name}</span>
                <p className="text-2xl whitespace-pre-wrap">{e.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
