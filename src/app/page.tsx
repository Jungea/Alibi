import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  FilePenLine,
  Fingerprint,
  MapPinned,
  Puzzle,
  UsersRound,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

const features = [
  {
    icon: FilePenLine,
    title: "직접 만드는 사건",
    description: "나만의 머더미스터리 시나리오를 기획하고 제작하세요.",
  },
  {
    icon: UsersRound,
    title: "간편한 진행",
    description:
      "온라인에서 방을 만들고, 자료를 공유하며 부드럽게 진행할 수 있어요.",
  },
  {
    icon: Puzzle,
    title: "더 깊은 플레이",
    description:
      "자료, 메모, 단서 정리까지 몰입을 돕는 도구들이 준비되어 있어요.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-12 sm:px-8">
      <header className="border-primary/20 flex items-center justify-between border-b py-4">
        <Link
          href="/"
          className="text-primary font-serif text-2xl font-semibold tracking-[-0.08em] sm:text-3xl"
        >
          알리바이
        </Link>
        <nav className="text-foreground/75 hidden items-center gap-7 text-sm font-medium md:flex">
          <Link
            href="/"
            className="text-primary underline decoration-2 underline-offset-8"
          >
            홈
          </Link>
          <Link href="/join" className="hover:text-primary transition-colors">
            시나리오 탐색
          </Link>
          <Link
            href="/builder"
            className="hover:text-primary transition-colors"
          >
            시나리오 제작
          </Link>
          <Link href="/tools" className="hover:text-primary transition-colors">
            도움도구
          </Link>
        </nav>
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
            href="/login?mode=signup"
            className={buttonVariants({ size: "sm", className: "shadow-sm" })}
          >
            회원가입
          </Link>
        </div>
      </header>

      <section className="grid items-center gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
        <div className="flex flex-col items-start">
          <div className="text-primary mb-5 flex items-center gap-2 text-sm font-semibold tracking-[0.16em] uppercase">
            <Fingerprint className="text-accent-foreground size-4" />
            <span>Case files for curious minds</span>
          </div>
          <h1 className="text-primary max-w-xl font-serif text-5xl leading-[1.06] font-semibold tracking-[-0.055em] sm:text-7xl">
            알리바이
            <span className="text-foreground relative mt-3 block">
              머더미스터리를
              <span className="relative inline-block">
                <span className="relative z-10"> 만들고</span>
                <span className="bg-accent/70 absolute right-0 bottom-1 left-0 -z-0 h-2 rounded-full" />
              </span>
              ,
              <br />
              함께 플레이하세요.
            </span>
          </h1>
          <p className="text-muted-foreground mt-7 max-w-lg text-base leading-7 sm:text-lg">
            이야기를 설계하고, 친구들과 사건을 추적하며, 마지막 진실까지 함께
            밝혀보세요.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/join"
              className={buttonVariants({
                size: "lg",
                className: "h-11 px-5 shadow-md",
              })}
            >
              <UsersRound />
              방 입장
              <ArrowRight className="ml-1" />
            </Link>
            <Link
              href="/tools"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className: "border-foreground/20 bg-background/70 h-11 px-5",
              })}
            >
              <BriefcaseBusiness />
              도움도구
            </Link>
            <Link
              href="/builder"
              className={buttonVariants({
                size: "lg",
                variant: "secondary",
                className:
                  "border-accent/50 bg-accent/35 text-foreground hover:bg-accent/55 h-11 border px-5",
              })}
            >
              <FilePenLine />
              시나리오 제작
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:justify-self-end">
          <div className="bg-accent/20 absolute -top-7 right-8 size-20 rounded-full blur-2xl" />
          <div className="border-primary/15 bg-card/85 relative rotate-[1.5deg] rounded-[2rem] border p-4 shadow-[0_24px_70px_-28px_oklch(0.3_0.12_12/0.45)] backdrop-blur-sm sm:p-6">
            <div className="border-primary/15 flex items-center justify-between border-b pb-4">
              <div>
                <p className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">
                  Case file 014
                </p>
                <p className="text-foreground mt-1 font-serif text-xl font-semibold">
                  저택의 마지막 밤
                </p>
              </div>
              <MapPinned className="text-accent-foreground size-7" />
            </div>
            <div className="relative mt-5 grid grid-cols-2 gap-3 sm:gap-4">
              <div className="border-border bg-secondary relative aspect-[1.3] rotate-[-5deg] overflow-hidden rounded-lg border p-3 shadow-sm">
                <div className="border-primary/10 flex h-full flex-col justify-between rounded border bg-[linear-gradient(145deg,oklch(0.9_0.04_90),oklch(0.78_0.07_70))] p-3">
                  <span className="text-primary/70 text-[10px] font-bold tracking-widest uppercase">
                    Evidence
                  </span>
                  <div className="border-primary/30 bg-background/50 mx-auto size-14 rounded-full border-2" />
                  <span className="text-foreground/80 text-center font-serif text-sm">
                    낡은 초대장
                  </span>
                </div>
                <span className="bg-primary absolute top-2 right-2 size-3 rounded-full shadow-sm" />
              </div>
              <div className="border-border bg-secondary relative aspect-[1.3] rotate-[4deg] overflow-hidden rounded-lg border p-3 shadow-sm">
                <div className="border-primary/10 flex h-full flex-col justify-between rounded border bg-[linear-gradient(145deg,oklch(0.96_0.02_88),oklch(0.89_0.03_100))] p-3">
                  <span className="text-primary/70 text-[10px] font-bold tracking-widest uppercase">
                    Suspect
                  </span>
                  <div className="bg-primary/10 text-primary mx-auto flex size-14 items-center justify-center rounded-full">
                    <UsersRound className="size-8" />
                  </div>
                  <span className="text-foreground/80 text-center font-serif text-sm">
                    용의자 목록
                  </span>
                </div>
                <span className="bg-accent-foreground absolute top-2 left-2 size-3 rounded-full shadow-sm" />
              </div>
              <div className="border-primary/15 bg-background/75 col-span-2 rounded-xl border p-4 shadow-sm">
                <div className="text-primary flex items-center justify-between text-xs font-semibold">
                  <span>진실 타임라인</span>
                  <span>ROUND 03</span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="bg-secondary h-1.5 flex-1 rounded-full">
                    <div className="bg-accent-foreground h-full w-2/3 rounded-full" />
                  </div>
                  <span className="text-muted-foreground text-xs">
                    단서 6 / 9
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-primary text-primary-foreground mt-5 flex items-center justify-between rounded-lg px-4 py-3">
              <span className="text-sm font-medium">
                사건을 시작할 준비가 되었나요?
              </span>
              <ArrowRight className="size-4" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-primary/15 grid gap-4 border-t pt-8 md:grid-cols-3 md:gap-0">
        {features.map(({ icon: Icon, title, description }, index) => (
          <article
            key={title}
            className={`flex gap-4 px-1 py-3 md:px-7 ${index > 0 ? "border-primary/15 md:border-l" : ""}`}
          >
            <Icon
              className="text-primary mt-1 size-7 shrink-0"
              strokeWidth={1.8}
            />
            <div>
              <h2 className="text-foreground font-serif text-lg font-semibold">
                {title}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                {description}
              </p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
