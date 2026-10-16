"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/features/auth/session";
import { normalizeInviteCode, validateNickname } from "@/lib/game/room-state";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { JOIN_ERRORS, roomErrorMessage } from "./errors";
import { createRoomResultSchema, joinResultSchema } from "./types";

export interface JoinState {
  error?: string;
}

/** 발행된 버전으로 방을 만들고 GM 화면으로 이동한다. (정식 계정의 제작자만 가능 — DB 가 검사) */
export async function createRoomAction(formData: FormData) {
  const versionId = z.uuid().safeParse(formData.get("versionId"));
  if (!versionId.success) redirect("/builder");

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_room", {
    p_version_id: versionId.data,
  });
  const parsed = createRoomResultSchema.safeParse(data);
  if (error || !parsed.success) {
    redirect(
      `/builder?roomError=${encodeURIComponent(roomErrorMessage(error?.message))}`,
    );
  }
  redirect(`/room/${parsed.data.roomId}`);
}

/**
 * 초대 코드와 닉네임으로 입장한다. 로그인하지 않았으면 익명 로그인을 먼저 한다.
 * 익명 사용자도 RLS 가 동일하게 적용되는 일반 authenticated 사용자다.
 */
export async function joinRoomAction(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  if (!getSupabaseEnv())
    return { error: "서버에 Supabase 설정이 되어 있지 않습니다." };

  const code = normalizeInviteCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "초대 코드는 영문·숫자 6자리입니다." };
  const nickname = String(formData.get("nickname") ?? "").trim();
  const nickError = validateNickname(nickname);
  if (nickError) return { error: nickError };

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      return {
        error:
          "입장 준비에 실패했습니다. 잠시 후 다시 시도해 주세요. (계속되면 운영자에게 익명 로그인 설정을 확인해 달라고 알려 주세요.)",
      };
    }
  }

  const { data, error } = await supabase.rpc("join_room", {
    p_code: code,
    p_nickname: nickname,
  });
  const result = joinResultSchema.safeParse(data);
  if (error || !result.success)
    return { error: "입장하지 못했습니다. 잠시 후 다시 시도해 주세요." };

  if (result.data.ok && result.data.roomId)
    redirect(`/room/${result.data.roomId}`);
  // GM 이 자기 방 코드를 입력하면 GM 화면으로 보낸다.
  if (result.data.error === "is_gm" && result.data.roomId)
    redirect(`/room/${result.data.roomId}`);
  return {
    error:
      JOIN_ERRORS[result.data.error ?? ""] ??
      "입장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
