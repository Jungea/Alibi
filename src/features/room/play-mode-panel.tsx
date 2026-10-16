"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { InviteQr } from "./invite-qr";
import type { RoomContext } from "./room-client";

/** GM: 진행 방식(채팅형/대면형), 외부 음성 링크, 테이블 화면과 QR. */
export function PlayModePanel({ ctx }: { ctx: RoomContext }) {
  const { overview, busy, run, roomId } = ctx;
  const { playMode, voiceLink, code, status } = overview.room;
  const [link, setLink] = useState(voiceLink ?? "");
  const [showQr, setShowQr] = useState(status === "lobby");

  const save = (mode: "chat" | "face", nextLink: string) =>
    void run("set_room_mode", {
      p_mode: mode,
      p_voice_link: nextLink.trim() || null,
    });

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">진행 방식</h3>
      <div role="radiogroup" aria-label="진행 방식" className="flex gap-2">
        {(
          [
            ["chat", "채팅형", "앱 안에서 채팅하며 진행"],
            ["face", "대면형", "모여서 말로 진행, 채팅 숨김"],
          ] as const
        ).map(([mode, label, hint]) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={playMode === mode}
            disabled={busy}
            onClick={() => save(mode, link)}
            className={`flex flex-1 flex-col items-start rounded-lg border p-3 text-left text-sm ${playMode === mode ? "border-primary bg-primary/10" : ""}`}
          >
            <span className="font-medium">{label}</span>
            <span className="text-muted-foreground text-xs">{hint}</span>
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(playMode, link);
        }}
      >
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          maxLength={300}
          placeholder="음성 대화 링크 (디스코드 등, https://…)"
          aria-label="음성 대화 링크"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={busy || link.trim() === (voiceLink ?? "")}
        >
          저장
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/room/${roomId}/table`}
          target="_blank"
          rel="noopener"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink /> 테이블 화면 열기
        </Link>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowQr((v) => !v)}
        >
          {showQr ? "QR 숨기기" : "QR 보기"}
        </Button>
        <span className="text-muted-foreground text-xs">
          TV·PC에 띄우는 공용 화면입니다. 비밀 정보는 나오지 않습니다.
        </span>
      </div>
      {showQr && <InviteQr code={code} />}
    </div>
  );
}
