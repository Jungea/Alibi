import Link from "next/link";

export default function RoomLayout({ children }: LayoutProps<"/room">) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
      <header>
        <Link href="/" className="text-lg font-semibold tracking-tight">
          알리바이
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-6">{children}</main>
    </div>
  );
}
