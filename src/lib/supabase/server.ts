import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv, SupabaseNotConfiguredError } from "./env";

/**
 * 서버(서버 컴포넌트, 서버 액션, 라우트 핸들러)용 클라이언트.
 * 사용자의 세션 쿠키로 요청하므로 RLS 가 그대로 적용된다.
 * cookies() 를 읽으므로 호출하는 컴포넌트는 <Suspense> 안에 있어야 한다.
 */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new SupabaseNotConfiguredError();
  const cookieStore = await cookies();

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts 가 담당한다.
        }
      },
    },
  });
}
