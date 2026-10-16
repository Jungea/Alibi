import { getSupabaseEnv } from "@/lib/supabase/env";

import { JoinForm } from "./join-form";

export function JoinSection({ defaultCode }: { defaultCode?: string }) {
  if (!getSupabaseEnv()) {
    return (
      <div
        role="alert"
        className="bg-card flex flex-col gap-2 rounded-xl border p-6"
      >
        <h1 className="font-medium">입장할 수 없습니다</h1>
        <p className="text-muted-foreground text-sm">
          서버에 Supabase 설정이 되어 있지 않습니다. 운영자에게 알려 주세요.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">방 입장</h1>
        <p className="text-muted-foreground text-sm">
          GM에게 받은 초대 코드와 닉네임을 입력하세요. 로그인은 필요 없습니다.
        </p>
      </div>
      <JoinForm defaultCode={defaultCode} />
    </>
  );
}
