import type { Metadata } from "next";

import { RandomTool } from "@/features/tools/random/random-tool";

export const metadata: Metadata = { title: "랜덤 뽑기 | 알리바이" };

export default function Page() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">랜덤 뽑기</h1>
        <p className="text-muted-foreground text-sm">
          암호학적 난수로 섞습니다.
        </p>
      </div>
      <RandomTool />
    </>
  );
}
