import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="border-primary/20 mx-auto flex w-full max-w-6xl items-center justify-between border-b px-5 py-4 sm:px-8">
      <Link
        href="/"
        className="text-primary font-serif text-2xl font-semibold tracking-[-0.08em] sm:text-3xl"
      >
        알리바이
      </Link>
      <nav className="text-foreground/75 hidden items-center gap-7 text-sm font-medium md:flex">
        <Link
          href="/"
          className="text-primary underline decoration-2 underline-offset-8"
        >
          홈
        </Link>
        <Link href="/join" className="hover:text-primary transition-colors">
          시나리오 탐색
        </Link>
        <Link href="/builder" className="hover:text-primary transition-colors">
          시나리오 제작
        </Link>
        <Link href="/tools" className="hover:text-primary transition-colors">
          도움도구
        </Link>
      </nav>
      {actions ?? (
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "border-primary/40 text-primary hidden sm:inline-flex",
            })}
          >
            로그인
          </Link>
          <Link
            href="/signup"
            className={buttonVariants({ size: "sm", className: "shadow-sm" })}
          >
            회원가입
          </Link>
        </div>
      )}
    </header>
  );
}
