import Link from "next/link";

export default function JoinLayout({ children }: LayoutProps<"/join">) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-6">
      <header>
        <Link href="/" className="text-lg font-semibold tracking-tight">
          알리바이
        </Link>
      </header>
      <main className="flex flex-1 flex-col justify-center gap-6 pb-10">
        {children}
      </main>
    </div>
  );
}
