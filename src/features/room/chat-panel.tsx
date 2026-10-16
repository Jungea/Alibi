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

import type { RoomContext } from "./room-client";
import { CHAT_PAGE_SIZE, fetchMessages, runRoomCommand } from "./state";
import { messageSchema, type RoomMessage } from "./types";

const POLL_MS = 10_000;

function merge(prev: RoomMessage[], incoming: RoomMessage[]): RoomMessage[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/**
 * 전체 채팅. 말한 사람은 닉네임이 아니라 인물 이름으로 표시한다 (GM 화면에만 닉네임을 덧붙임).
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
  const allowed =
    overview.isGm ||
    status === "intro" ||
    status === "break" ||
    status === "ended" ||
    !!round?.allowedActions.includes("chat");

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
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    const res = await runRoomCommand(supabase, "send_message", {
      p_room: roomId,
      p_body: body,
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
      <h2 className="font-medium">채팅</h2>
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
            <div key={m.id} className="flex flex-col gap-0.5">
              <span className="text-xs">
                <span
                  className={`font-medium ${m.kind === "gm" ? "text-amber-300" : ""}`}
                >
                  {m.kind === "gm" ? "GM" : nameOfCharacter(m.character_id)}
                </span>
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
      <form onSubmit={send} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          disabled={!allowed}
          placeholder={
            allowed
              ? overview.isGm
                ? "GM 공지로 보냅니다"
                : "메시지를 입력하세요"
              : "이번 라운드에서는 채팅을 할 수 없습니다"
          }
          aria-label="채팅 메시지"
        />
        <Button type="submit" disabled={!allowed || sending || !text.trim()}>
          보내기
        </Button>
      </form>
    </section>
  );
}
