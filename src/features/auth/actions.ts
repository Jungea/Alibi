"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

const credentialsSchema = z.object({
  email: z.email("올바른 이메일 주소를 입력해 주세요.").max(254),
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다.")
    .max(72, "비밀번호는 72자 이하여야 합니다."),
});

/** 로그인 후 돌아갈 내부 경로만 허용한다 (오픈 리다이렉트 방지). */
function safeNext(value: FormDataEntryValue | null): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
  )
    return value;
  return "/builder";
}

function parseCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!getSupabaseEnv())
    return { error: "서버에 Supabase 설정이 되어 있지 않습니다." };
  const parsed = parseCredentials(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };

  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!getSupabaseEnv())
    return { error: "서버에 Supabase 설정이 되어 있지 않습니다." };
  const parsed = parseCredentials(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/builder` },
  });
  if (error)
    return {
      error: "가입에 실패했습니다. 이미 가입된 이메일인지 확인해 주세요.",
    };

  // 이메일 확인이 꺼져 있으면 바로 세션이 생긴다.
  if (data.session) redirect(safeNext(formData.get("next")));
  return {
    message: "확인 메일을 보냈습니다. 메일의 링크를 누르면 가입이 완료됩니다.",
  };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
