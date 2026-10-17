"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NICKNAME_MAX } from "@/lib/game/room-state";

import { signInAction, signUpAction, type AuthState } from "./actions";

const initial: AuthState = {};

export function LoginForm({ next }: { next: string }) {
  const [signInState, signIn, signInPending] = useActionState(
    signInAction,
    initial,
  );
  const [signUpState, signUp, signUpPending] = useActionState(
    signUpAction,
    initial,
  );
  const pending = signInPending || signUpPending;
  const state =
    signUpState.error || signUpState.message ? signUpState : signInState;

  return (
    <form className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
        <p className="text-muted-foreground text-xs">8자 이상</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nickname">닉네임 (회원가입할 때만)</Label>
        <Input
          id="nickname"
          name="nickname"
          autoComplete="nickname"
          maxLength={NICKNAME_MAX}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-emerald-400">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" formAction={signIn} disabled={pending}>
        로그인
      </Button>
      <p className="text-muted-foreground flex items-center justify-center gap-1 text-sm">
        계정이 없으신가요?
        <Button
          type="submit"
          variant="link"
          size="sm"
          className="px-1"
          formAction={signUp}
          disabled={pending}
        >
          회원가입
        </Button>
      </p>
    </form>
  );
}
