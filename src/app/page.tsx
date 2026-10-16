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
      <Link href="/tools" className={buttonVariants({ size: "lg" })}>
        도움도구 열기
      </Link>
    </main>
  );
}
