"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";

export function SiteHeader({ actions }: { actions?: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="border-primary/20 relative mx-auto flex w-full max-w-6xl items-center justify-between border-b px-5 py-4 sm:px-8">
      <Link
        href="/"
        className="text-primary font-serif text-2xl font-semibold tracking-[-0.08em] sm:text-3xl"
      >
        알리바이
      </Link>
      <nav className="text-foreground/75 hidden items-center gap-7 text-sm font-medium md:flex">
        <Link
          href="/"
          className={
            isActive("/")
              ? "text-primary underline decoration-2 underline-offset-8"
              : "hover:text-primary transition-colors"
          }
        >
          홈
        </Link>
        <Link
          href="/join"
          className={
            isActive("/join")
              ? "text-primary underline decoration-2 underline-offset-8"
              : "hover:text-primary transition-colors"
          }
        >
          시나리오 탐색
        </Link>
        <Link
          href="/builder"
          className={
            isActive("/builder")
              ? "text-primary underline decoration-2 underline-offset-8"
              : "hover:text-primary transition-colors"
          }
        >
          시나리오 제작
        </Link>
        <Link
          href="/tools"
          className={
            isActive("/tools")
              ? "text-primary underline decoration-2 underline-offset-8"
              : "hover:text-primary transition-colors"
          }
        >
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
      <button
        type="button"
        className="text-primary ml-2 inline-flex size-9 items-center justify-center rounded-lg border border-transparent md:hidden"
        aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={menuOpen}
        aria-controls="mobile-site-nav"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            id="mobile-site-nav"
            role="dialog"
            aria-modal="true"
            aria-label="사이트 메뉴"
            className="bg-background fixed inset-y-0 right-0 z-50 flex w-[min(82vw,20rem)] flex-col gap-6 p-5 shadow-2xl md:hidden"
          >
            <div className="flex justify-end border-b pb-4">
              <button
                type="button"
                className="text-primary hover:bg-muted inline-flex size-9 items-center justify-center rounded-lg"
                aria-label="메뉴 닫기"
                onClick={() => setMenuOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 text-base font-medium">
              {[
                ["/", "홈"],
                ["/join", "시나리오 탐색"],
                ["/builder", "시나리오 제작"],
                ["/tools", "도움도구"],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={
                    isActive(href)
                      ? "bg-primary/8 text-primary rounded-lg px-3 py-3 font-semibold"
                      : "hover:bg-muted rounded-lg px-3 py-3"
                  }
                >
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
        </>
      )}
    </header>
  );
}
