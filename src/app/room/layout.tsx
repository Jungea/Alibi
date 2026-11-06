import { SiteHeader } from "@/components/site-header";

export default function RoomLayout({ children }: LayoutProps<"/room">) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
        <main className="flex flex-1 flex-col gap-6">{children}</main>
      </div>
    </>
  );
}
