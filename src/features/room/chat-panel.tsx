"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { GroupManager } from "./groups-panel";
import type { RoomContext } from "./room-client";
import {
  CHAT_PAGE_SIZE,
  fetchGroups,
  fetchMessages,
  runRoomCommand,
} from "./state";
import { useRemote } from "./use-remote";
import { messageSchema, type RoomMessage } from "./types";

const POLL_MS = 10_000;
const GROUP_POLL_MS = 8_000;

type Channel = "all" | "whisper" | "group";
const CHANNEL_LABELS: Record<Channel, string> = {
  all: "전체",
  whisper: "귓속말",
  group: "그룹",
};

function merge(prev: RoomMessage[], incoming: RoomMessage[]): RoomMessage[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/**
 * 채팅 (전체 / 귓속말 / 그룹). 말한 사람은 닉네임이 아니라 인물 이름으로 표시한다 (GM 화면에만 닉네임을 덧붙임).
 * 처음에는 최근 메시지만 불러오고, 위로 스크롤하면 이전 메시지를 더 불러온다.
 */
export function ChatPanel({ ctx }: { ctx: RoomContext }) {
  const { supabase, roomId, overview, players } = ctx;
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("all");
  const [target, setTarget] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groupTick, setGroupTick] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const restoreHeight = useRef<number | null>(null);
  const lastId = useRef(0);

  useEffect(() => {
    lastId.current = messages.length ? messages[messages.length - 1].id : 0;
  }, [messages]);

  // 처음에는 최근 N개만
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void fetchMessages(supabase, roomId).then((r) => {
        if (cancelled || !r.ok) return;
        setMessages((prev) => merge(prev, r.data));
        setHasMore(r.data.length >= CHAT_PAGE_SIZE);
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [supabase, roomId]);

  const { data: groupData } = useRemote(
    () => fetchGroups(supabase, roomId),
    `${ctx.pulse}:${groupTick}`,
  );
  const groups = groupData ?? [];
  const reloadGroups = useCallback(() => setGroupTick((t) => t + 1), []);
  useEffect(() => {
    const id = setInterval(reloadGroups, GROUP_POLL_MS);
    return () => clearInterval(id);
  }, [reloadGroups]);

  // 아직 모르는 그룹의 메시지가 오면 그룹 목록을 다시 읽는다 (초대받은 직후 등).
  const askedGroups = useRef(new Set<string>());
  useEffect(() => {
    if (!groupData) return;
    const known = new Set(groupData.map((g) => g.id));
    const unknown = messages
      .map((m) => m.group_id)
      .filter((id): id is string => !!id && !known.has(id))
      .filter((id) => !askedGroups.current.has(id));
    if (unknown.length === 0) return;
    // 같은 그룹은 한 번만 다시 묻는다 (이미 나온 그룹의 옛 메시지로 무한히 읽지 않도록).
    const t = setTimeout(() => {
      unknown.forEach((id) => askedGroups.current.add(id));
      reloadGroups();
    }, 0);
    return () => clearTimeout(t);
  }, [messages, groupData, reloadGroups]);

  const loadNewer = useCallback(async () => {
    const r = await fetchMessages(supabase, roomId, {
      afterId: lastId.current,
    });
    if (r.ok && r.data.length) setMessages((prev) => merge(prev, r.data));
  }, [supabase, roomId]);

  // 새 메시지: 실시간 알림 + 놓친 것을 보정하는 폴링
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const parsed = messageSchema.safeParse(payload.new);
          if (parsed.success) setMessages((prev) => merge(prev, [parsed.data]));
        },
      )
      .subscribe();
    const id = setInterval(() => void loadNewer(), POLL_MS);
    return () => {
      clearInterval(id);
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, loadNewer]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (restoreHeight.current !== null) {
      el.scrollTop = el.scrollHeight - restoreHeight.current;
      restoreHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const loadOlder = async () => {
    if (loadingOlder || !hasMore || !messages.length) return;
    setLoadingOlder(true);
    const r = await fetchMessages(supabase, roomId, {
      beforeId: messages[0].id,
    });
    setLoadingOlder(false);
    if (!r.ok) return;
    restoreHeight.current = boxRef.current?.scrollHeight ?? null;
    setHasMore(r.data.length >= CHAT_PAGE_SIZE);
    setMessages((prev) => merge(prev, r.data));
  };

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (el.scrollTop < 40) void loadOlder();
  };

  const round = overview.rounds[overview.room.currentRoundIndex];
  const { status } = overview.room;
  const freeTalk =
    status === "intro" || status === "break" || status === "ended";
  const me = players.find((p) => p.user_id === ctx.userId);
  const blocked = !overview.isGm && overview.room.chatBlocked;
  const muted = !overview.isGm && !!me?.muted;
  const allowAll =
    overview.isGm || freeTalk || !!round?.allowedActions.includes("chat");
  const allowWhisper =
    !overview.isGm && (freeTalk || !!round?.allowedActions.includes("whisper"));
  const available = (c: Channel) => (c === "all" ? allowAll : allowWhisper);
  const channels: Channel[] = overview.isGm
    ? ["all"]
    : ["all", "whisper", "group"];
  const myGroups = groups.filter((g) => g.isMember);
  // 선택한 채널이 지금 막혀 있으면 열려 있는 채널로 바꿔 보여 준다.
  const active: Channel = available(channel)
    ? channel
    : (channels.find(available) ?? "all");
  const needsTarget =
    (active === "whisper" && !target) || (active === "group" && !groupId);
  const allowed = available(active) && !blocked && !muted;

  const nameOfCharacter = (id: string | null) =>
    id ? overview.characters.find((c) => c.id === id)?.name || "이름 없음" : "";
  // GM 전용: 인물 → 참가자 닉네임
  const nicknameOfCharacter = (id: string | null) => {
    if (!overview.isGm || !id) return null;
    const userId = overview.assignments?.find(
      (a) => a.characterId === id,
    )?.userId;
    return players.find((p) => p.user_id === userId)?.nickname ?? null;
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending || needsTarget) return;
    setSending(true);
    setSendError(null);
    const res = await runRoomCommand(supabase, "send_message", {
      p_room: roomId,
      p_body: body,
      p_channel: active,
      p_target: active === "whisper" ? target : null,
      p_group: active === "group" ? groupId : null,
    });
    setSending(false);
    if (res.ok) {
      setText("");
      stickToBottom.current = true;
      void loadNewer();
    } else {
      setSendError(res.error);
    }
  };

  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">채팅</h2>
        {overview.isGm && overview.room.chatBlocked && (
          <span className="text-xs text-amber-300">대화 정지 중</span>
        )}
      </div>
      <div
        ref={boxRef}
        onScroll={onScroll}
        className="bg-background/50 flex h-80 flex-col gap-2 overflow-y-auto rounded-lg border p-3"
        aria-live="polite"
      >
        {hasMore && (
          <Button
            size="sm"
            variant="ghost"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
            className="self-center"
          >
            {loadingOlder ? "불러오는 중…" : "이전 메시지 보기"}
          </Button>
        )}
        {messages.length === 0 && (
          <p className="text-muted-foreground m-auto text-sm">
            아직 메시지가 없습니다.
          </p>
        )}
        {messages.map((m) =>
          m.kind === "system" ? (
            <p
              key={m.id}
              className="text-muted-foreground text-center text-xs whitespace-pre-wrap"
            >
              {m.body}
            </p>
          ) : (
            <div
              key={m.id}
              className={`flex flex-col gap-0.5 ${m.channel === "all" ? "" : "border-l-2 border-violet-400/70 pl-2"}`}
            >
              <span className="text-xs">
                {m.channel === "whisper" && (
                  <span className="mr-1 text-violet-300">귓속말</span>
                )}
                {m.channel === "group" && (
                  <span className="mr-1 text-violet-300">
                    [{groups.find((g) => g.id === m.group_id)?.name ?? "그룹"}]
                  </span>
                )}
                <span
                  className={`font-medium ${m.kind === "gm" ? "text-amber-300" : ""}`}
                >
                  {m.kind === "gm" ? "GM" : nameOfCharacter(m.character_id)}
                </span>
                {m.channel === "whisper" && (
                  <span className="text-muted-foreground">
                    {" → "}
                    {m.target_character_id === overview.myCharacterId
                      ? "나"
                      : nameOfCharacter(m.target_character_id)}
                  </span>
                )}
                {nicknameOfCharacter(m.character_id) && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({nicknameOfCharacter(m.character_id)})
                  </span>
                )}
              </span>
              <p className="text-sm break-words whitespace-pre-wrap">
                {m.body}
              </p>
            </div>
          ),
        )}
      </div>
      {sendError && (
        <p role="alert" className="text-destructive text-sm">
          {sendError}
        </p>
      )}
      {!overview.isGm && (
        <div role="tablist" aria-label="대화 방식" className="flex gap-1.5">
          {channels.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={active === c}
              disabled={!available(c)}
              onClick={() => setChannel(c)}
              className={`rounded-full border px-3 py-1 text-sm disabled:opacity-40 ${active === c ? "bg-primary text-primary-foreground border-transparent" : ""}`}
            >
              {CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>
      )}
      {active === "whisper" && (
        <select
          aria-label="귓속말 상대"
          className="bg-background rounded-md border px-2 py-2 text-sm"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">누구에게 말할까요?</option>
          {overview.characters
            .filter((c) => c.id !== overview.myCharacterId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || "이름 없음"}
              </option>
            ))}
        </select>
      )}
      {active === "group" && (
        <select
          aria-label="그룹 선택"
          className="bg-background rounded-md border px-2 py-2 text-sm"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          <option value="">
            {myGroups.length ? "어느 그룹에 말할까요?" : "속한 그룹이 없습니다"}
          </option>
          {myGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}
      <form onSubmit={send} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          disabled={!allowed}
          placeholder={
            blocked
              ? "GM이 대화를 잠시 멈췄습니다"
              : muted
                ? "GM이 발언을 막았습니다"
                : !allowed
                  ? "이번 라운드에서는 이 방식으로 말할 수 없습니다"
                  : overview.isGm
                    ? "GM 공지로 보냅니다"
                    : "메시지를 입력하세요"
          }
          aria-label="채팅 메시지"
        />
        <Button
          type="submit"
          disabled={!allowed || sending || !text.trim() || needsTarget}
        >
          보내기
        </Button>
      </form>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          그룹 {overview.isGm ? "보기" : "관리"}
          {myGroups.length > 0 && !overview.isGm ? ` (${myGroups.length})` : ""}
        </summary>
        <div className="mt-3">
          <GroupManager ctx={ctx} groups={groups} reload={reloadGroups} />
        </div>
      </details>
    </section>
  );
}
