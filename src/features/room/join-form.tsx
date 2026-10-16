"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NICKNAME_MAX } from "@/lib/game/room-state";

import { joinRoomAction, type JoinState } from "./actions";

const initial: JoinState = {};

export function JoinForm({ defaultCode = "" }: { defaultCode?: string }) {
  const [state, action, pending] = useActionState(joinRoomAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">초대 코드</Label>
        <Input
          id="code"
          name="code"
          defaultValue={defaultCode}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          placeholder="예: K7M2QX"
          className="font-mono tracking-widest uppercase"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nickname">닉네임</Label>
        <Input
          id="nickname"
          name="nickname"
          autoComplete="nickname"
          maxLength={NICKNAME_MAX}
          placeholder="게임 전 대기실에서 쓰는 이름"
          required
        />
        <p className="text-muted-foreground text-xs">
          게임이 시작되면 채팅에는 인물 이름이 표시됩니다.
        </p>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "입장 중…" : "입장하기"}
      </Button>
    </form>
  );
}
