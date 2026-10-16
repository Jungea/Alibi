import type { Metadata } from "next";

import { VoteTool } from "@/features/tools/vote/vote-tool";

export const metadata: Metadata = { title: "투표 | 알리바이" };

export default function Page() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">투표</h1>
        <p className="text-muted-foreground text-sm">
          후보를 정하고 한 기기를 돌려가며 투표합니다.
        </p>
      </div>
      <VoteTool />
    </>
  );
}
