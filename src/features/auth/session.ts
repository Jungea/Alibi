import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * 현재 로그인한 정식 사용자를 돌려준다. 없으면 /login 으로 보낸다.
 * 페이지 보호는 proxy.ts 만 믿지 않고, 데이터를 읽기 전에 여기서 다시 확인한다.
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || claims.is_anonymous === true) redirect("/login");
  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    nickname:
      typeof claims.user_metadata?.nickname === "string"
        ? claims.user_metadata.nickname
        : "",
  };
}
