"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { TOOLS } from "./tools-list";

export function ToolsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="도움도구" className="flex items-center gap-1 text-sm">
      <Link
        href="/tools"
        aria-current={pathname === "/tools" ? "page" : undefined}
        className={cn(
          "rounded-lg px-3 py-1.5 transition-colors",
          pathname === "/tools"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        도구 홈
      </Link>
      {TOOLS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
