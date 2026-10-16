import type { Metadata } from "next";

import { TimerBoard } from "@/features/tools/timer/timer-board";

export const metadata: Metadata = { title: "타이머 | 알리바이" };

export default function Page() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">타이머</h1>
        <p className="text-muted-foreground text-sm">
          종료 시각 기준으로 계산하므로 다른 탭에 있다 와도 시간이 정확합니다.
        </p>
      </div>
      <TimerBoard />
    </>
  );
}
