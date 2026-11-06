import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { SiteHeaderClient } from "./site-header-client";

export function SiteHeader({ actions }: { actions?: ReactNode }) {
  return (
    <Suspense fallback={<SiteHeaderFallback />}>
      <SiteHeaderClient actions={actions} />
    </Suspense>
  );
}

function SiteHeaderFallback() {
  return (
    <header className="border-primary/20 relative mx-auto flex h-[73px] w-full max-w-6xl items-center justify-between border-b px-5 py-4 sm:px-8">
      <Link href="/" className="inline-flex items-center">
        <Image
          src="/alibi-logo-libi.png"
          alt="A 로고 LIBI"
          width={2172}
          height={724}
          priority
          className="h-9 w-auto sm:h-10"
        />
      </Link>
    </header>
  );
}
