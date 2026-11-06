"use client";

import { useActionState } from "react";
import { LockKeyhole, LogIn, Mail, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { signInAction, type AuthState } from "./actions";
import { AuthField } from "./auth-field";

const initial: AuthState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, signIn, pending] = useActionState(signInAction, initial);

  return (
    <form action={signIn} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <AuthField id="email" name="email" type="email" autoComplete="email" placeholder="이메일" icon={Mail} />
      <AuthField id="password" name="password" type="password" autoComplete="current-password" placeholder="비밀번호" icon={LockKeyhole} minLength={8} />
      {state.error && <p role="alert" className="text-destructive text-xs">{state.error}</p>}
      <Button type="submit" size="lg" className="mt-2 h-11" disabled={pending}>
        <LogIn />
        로그인
      </Button>
      <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
        <a href="/signup" className="text-primary inline-flex items-center gap-1 font-medium hover:underline">
          회원가입
          <UserPlus aria-hidden="true" className="size-4" />
        </a>
      </p>
    </form>
  );
}
