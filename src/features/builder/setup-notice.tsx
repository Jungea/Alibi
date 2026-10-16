export function SetupNotice() {
  return (
    <div
      role="alert"
      className="bg-card flex flex-col gap-2 rounded-xl border p-6"
    >
      <h2 className="font-medium">Supabase 설정이 필요합니다</h2>
      <p className="text-muted-foreground text-sm">
        시나리오 제작에는 Supabase 연결이 필요합니다. README의 &quot;수동
        설정&quot; 순서대로 환경변수(
        <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>)를 입력한 뒤 다시 열어
        주세요.
      </p>
    </div>
  );
}
