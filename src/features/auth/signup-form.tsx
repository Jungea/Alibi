"use client";

import { useActionState } from "react";
import {
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
  UserPlus,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { NICKNAME_MAX } from "@/lib/game/room-state";

import { signUpAction, type AuthState } from "./actions";
import { AuthField } from "./auth-field";

const initial: AuthState = {};

export function SignupForm({ next }: { next: string }) {
  const [state, signUp, pending] = useActionState(signUpAction, initial);

  return (
    <form action={signUp} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <AuthField id="email" name="email" type="email" autoComplete="email" placeholder="이메일" icon={Mail} />
      <AuthField id="password" name="password" type="password" autoComplete="new-password" placeholder="비밀번호" icon={LockKeyhole} minLength={8} />
      <AuthField id="password-confirm" name="passwordConfirm" type="password" autoComplete="new-password" placeholder="비밀번호 확인" icon={ShieldCheck} minLength={8} />
      <AuthField id="nickname" name="nickname" autoComplete="nickname" placeholder="닉네임" icon={UserRound} maxLength={NICKNAME_MAX} />
      {state.error && <p role="alert" className="text-destructive text-xs">{state.error}</p>}
      {state.message && (
        <p role="status" className="text-emerald-600 text-xs">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" className="mt-2 h-11" disabled={pending}>
        <UserPlus />
        회원가입
      </Button>
      <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
        <a href="/login" className="text-primary inline-flex items-center gap-1 font-medium hover:underline">
          <LogIn aria-hidden="true" className="size-4" />
          로그인
        </a>
      </p>
    </form>
  );
}
