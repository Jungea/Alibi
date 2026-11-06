import { SiteHeader } from "@/components/site-header";
import { ToolsNav } from "@/features/tools/tools-nav";

export default function ToolsLayout({ children }: LayoutProps<"/tools">) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
        <div className="-mx-1 overflow-x-auto px-1">
          <ToolsNav />
        </div>
        <main className="flex flex-1 flex-col gap-6">{children}</main>
      </div>
    </>
  );
}
