/**
 * Supabase 연결 정보. 값이 없으면 null 을 돌려주고, 호출하는 쪽에서 안내 화면을 보여준다.
 * (환경변수가 없어도 홈과 도움도구(/tools)는 그대로 동작해야 한다.)
 * NEXT_PUBLIC_* 값은 리터럴로 참조해야 브라우저 번들에 포함된다.
 */
export function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.",
    );
    this.name = "SupabaseNotConfiguredError";
  }
}
