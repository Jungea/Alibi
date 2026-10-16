"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { PlayModePanel } from "./play-mode-panel";
import type { RoomContext } from "./room-client";

export function Lobby({ ctx }: { ctx: RoomContext }) {
  const router = useRouter();
  const { overview, players, userId, online, busy, run } = ctx;
  const { isGm } = overview;
  const me = players.find((p) => p.user_id === userId);
  const readyCount = players.filter((p) => p.ready).length;
  const assignmentOf = (uid: string) =>
    overview.assignments?.find((a) => a.userId === uid)?.characterId ?? "";
  const takenBy = (characterId: string) =>
    overview.assignments?.find((a) => a.characterId === characterId)?.userId;

  return (
    <div className="flex flex-col gap-6">
      {overview.room.voiceLink && (
        <section className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <h2 className="font-medium">음성 대화</h2>
          <a
            href={overview.room.voiceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm break-all underline"
          >
            {overview.room.voiceLink}
          </a>
        </section>
      )}
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">
            참가자 {players.length} / {overview.room.maxPlayers}
          </h2>
          <span className="text-muted-foreground text-xs">
            준비 {readyCount} / {players.length}
          </span>
        </div>

        {players.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            아직 아무도 입장하지 않았습니다. 초대 코드나 링크를 공유하세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {players.map((p) => (
              <li
                key={p.user_id}
                className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm"
              >
                <span
                  aria-label={online.has(p.user_id) ? "접속 중" : "오프라인"}
                  className={`size-2 rounded-full ${online.has(p.user_id) ? "bg-emerald-400" : "bg-muted-foreground/40"}`}
                />
                <span className="font-medium">
                  {p.nickname}
                  {p.user_id === userId && (
                    <span className="text-muted-foreground ml-1 font-normal">
                      (나)
                    </span>
                  )}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${p.ready ? "bg-emerald-400/15 text-emerald-300" : "bg-muted text-muted-foreground"}`}
                >
                  {p.ready ? "준비 완료" : "대기 중"}
                </span>

                {isGm && (
                  <div className="ml-auto flex items-center gap-2">
                    <select
                      aria-label={`${p.nickname}의 인물`}
                      className="bg-background rounded-md border px-2 py-1 text-sm"
                      value={assignmentOf(p.user_id)}
                      disabled={busy}
                      onChange={(e) =>
                        void run("set_player_character", {
                          p_user: p.user_id,
                          p_character: e.target.value || null,
                        })
                      }
                    >
                      <option value="">인물 미배정</option>
                      {overview.characters.map((c) => {
                        const owner = takenBy(c.id);
                        return (
                          <option
                            key={c.id}
                            value={c.id}
                            disabled={!!owner && owner !== p.user_id}
                          >
                            {c.name || "이름 없음"}
                            {owner && owner !== p.user_id ? " (배정됨)" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`${p.nickname}님을 내보낼까요?`))
                          void run("kick_player", { p_user: p.user_id });
                      }}
                    >
                      내보내기
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {!isGm && me && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              variant={me.ready ? "outline" : "default"}
              onClick={() => void run("set_ready", { p_ready: !me.ready })}
            >
              {me.ready ? "준비 취소" : "준비 완료"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm("방에서 나갈까요?")) return;
                if (await run("leave_room", {})) router.push("/join");
              }}
            >
              방 나가기
            </Button>
          </div>
        )}
        {!isGm && (
          <p className="text-muted-foreground text-xs">
            인물은 GM이 게임을 시작하면 공개됩니다.
          </p>
        )}
      </section>

      {isGm && (
        <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-medium">GM 콘솔</h2>
          <p className="text-muted-foreground text-sm">
            인물을 무작위로 배정하거나 참가자별로 직접 지정한 뒤 게임을
            시작하세요. 일반 시작은 2명 이상이 모두 준비해야 합니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || players.length === 0}
              onClick={() => void run("assign_characters", {})}
            >
              랜덤 배정 (전체 다시)
            </Button>
            <Button
              disabled={busy || players.length === 0}
              onClick={() => void run("start_game", { p_force: false })}
            >
              게임 시작
            </Button>
            <Button
              variant="outline"
              disabled={busy || players.length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    "준비하지 않은 참가자가 있어도 시작하고, 인물이 없는 사람은 무작위로 배정합니다. 계속할까요?",
                  )
                )
                  void run("start_game", { p_force: true });
              }}
            >
              강제 시작
            </Button>
          </div>
          <PlayModePanel ctx={ctx} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">
          등장인물 ({overview.characters.length}명)
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {overview.characters.map((c) => (
            <li
              key={c.id}
              className="bg-card flex flex-col gap-1 rounded-xl border p-3"
            >
              <span className="font-medium">{c.name || "이름 없음"}</span>
              {c.publicInfo && (
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                  {c.publicInfo}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
