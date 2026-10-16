import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * 모든 /builder 요청 전에 Supabase 세션 쿠키를 갱신하고, 로그인하지 않았으면 /login 으로 보낸다.
 * 이것은 편의를 위한 1차 확인일 뿐이며, 실제 권한은 DB 의 RLS 와 서버 코드의 사용자 확인이 담당한다.
 */
export async function proxy(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env) return NextResponse.next(); // 설정 전에는 각 페이지가 안내 화면을 보여준다.

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const loggedIn = !!claims && claims.is_anonymous !== true;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/builder") && !loggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && loggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/builder";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/builder/:path*", "/login"],
};
