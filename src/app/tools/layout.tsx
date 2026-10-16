import Link from "next/link";

import { ToolsNav } from "@/features/tools/tools-nav";

export default function ToolsLayout({ children }: LayoutProps<"/tools">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          알리바이
        </Link>
        <div className="-mx-1 overflow-x-auto px-1">
          <ToolsNav />
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-6">{children}</main>
    </div>
  );
}
