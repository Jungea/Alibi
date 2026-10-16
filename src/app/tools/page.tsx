import type { Metadata } from "next";
import Link from "next/link";

import { TOOLS } from "@/features/tools/tools-list";

export const metadata: Metadata = { title: "도움도구 | 알리바이" };

export default function ToolsHome() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">도움도구</h1>
        <p className="text-muted-foreground text-sm">
          로그인 없이 오프라인 모임에서 바로 쓸 수 있는 도구입니다.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="bg-card hover:bg-muted flex h-full flex-col gap-1 rounded-xl border p-4 transition-colors"
            >
              <span className="font-medium">{t.label}</span>
              <span className="text-muted-foreground text-sm">
                {t.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
