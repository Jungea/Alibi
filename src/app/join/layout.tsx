import { SiteHeader } from "@/components/site-header";

export default function JoinLayout({ children }: LayoutProps<"/join">) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-6">
        <main className="flex flex-1 flex-col justify-center gap-6 pb-10">
          {children}
        </main>
      </div>
    </>
  );
}
