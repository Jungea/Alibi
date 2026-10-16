"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <div className="flex gap-2">
        <Button type="submit" formAction={signIn} disabled={pending}>
          로그인
        </Button>
        <Button
          type="submit"
          variant="outline"
          formAction={signUp}
          disabled={pending}
        >
          회원가입
        </Button>
      </div>
    </form>
  );
}
