import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          알리바이
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg">
          머더미스터리를 만들고, 진행하고, 함께 플레이하세요.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/join" className={buttonVariants({ size: "lg" })}>
          방 입장
        </Link>
        <Link
          href="/tools"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          도움도구 열기
        </Link>
        <Link
          href="/builder"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          시나리오 제작
        </Link>
      </div>
    </main>
  );
}
