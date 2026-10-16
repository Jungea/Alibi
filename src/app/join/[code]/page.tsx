import type { Metadata } from "next";
import { Suspense } from "react";

import { JoinSection } from "@/features/room/join-section";

export const metadata: Metadata = { title: "방 입장 | 알리바이" };

export default function JoinWithCodePage({
  params,
}: PageProps<"/join/[code]">) {
  return (
    <Suspense>
      <WithCode params={params} />
    </Suspense>
  );
}

async function WithCode({ params }: Pick<PageProps<"/join/[code]">, "params">) {
  const { code } = await params;
  return <JoinSection defaultCode={code.slice(0, 12)} />;
}
