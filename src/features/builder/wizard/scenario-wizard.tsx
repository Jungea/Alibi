"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CircleAlert, Loader2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  STEPS,
  type ScenarioBundle,
  type Section,
} from "@/lib/schemas/scenario";
import { cn } from "@/lib/utils";

import { countIssues, reviewScenario } from "../review";
import {
  BasicStep,
  CharactersStep,
  CluesStep,
  EndingsStep,
  MissionsStep,
  RoundsStep,
  TimelineStep,
  WorldStep,
  type StepContext,
} from "../steps";
import { useAutoSave, type SaveStatus } from "./use-auto-save";

const STEP_COMPONENTS: Record<Section, (ctx: StepContext) => React.ReactNode> =
  {
    basic: BasicStep,
    world: WorldStep,
    characters: CharactersStep,
    timeline: TimelineStep,
    rounds: RoundsStep,
    clues: CluesStep,
    missions: MissionsStep,
    endings: EndingsStep,
  };

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "저장됨",
  dirty: "변경됨",
  saving: "저장 중…",
  invalid: "입력 확인 필요 (저장 보류)",
  error: "저장 실패 (다시 시도합니다)",
};

export function ScenarioWizard({
  scenarioId,
  userId,
  initialBundle,
  initialStep,
}: {
  scenarioId: string;
  userId: string;
  initialBundle: ScenarioBundle;
  initialStep: number;
}) {
  const [bundle, setBundle] = useState(initialBundle);
  const bundleRef = useRef(initialBundle);
  const [stepIndex, setStepIndex] = useState(
    Math.min(Math.max(initialStep, 0), STEPS.length - 1),
  );

  const getBundle = useCallback(() => bundleRef.current, []);
  const { status, message, markDirty, flush } = useAutoSave(
    scenarioId,
    getBundle,
  );

  const edit = useCallback<StepContext["edit"]>(
    (mutate, sections) => {
      const next = mutate(bundleRef.current);
      bundleRef.current = next;
      setBundle(next);
      markDirty(sections);
    },
    [markDirty],
  );

  const issues = useMemo(() => reviewScenario(bundle), [bundle]);
  const perStep = useMemo(() => {
    const map = new Map<Section, { errors: number; warnings: number }>();
    for (const s of STEPS)
      map.set(s.key, countIssues(issues.filter((i) => i.step === s.key)));
    return map;
  }, [issues]);
  const totals = countIssues(issues);

  const goTo = (index: number) => {
    setStepIndex(index);
    window.history.replaceState(null, "", `?step=${index + 1}`);
    window.scrollTo({ top: 0 });
    void flush();
  };

  const step = STEPS[stepIndex];
  const StepComponent = STEP_COMPONENTS[step.key];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Link href="/builder" className="text-muted-foreground text-sm">
            ← 내 시나리오
          </Link>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {bundle.scenario.title.trim() || "제목 없는 시나리오"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            role="status"
            className={cn(
              "flex items-center gap-1.5 text-sm",
              status === "saved" && "text-muted-foreground",
              (status === "invalid" || status === "error") && "text-amber-400",
            )}
          >
            {status === "saving" && <Loader2 className="size-4 animate-spin" />}
            {status === "saved" && <Check className="size-4" />}
            {(status === "invalid" || status === "error") && (
              <AlertTriangle className="size-4" />
            )}
            {STATUS_TEXT[status]}
          </span>
          <Link
            href={`/builder/${scenarioId}/preview`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={() => void flush()}
          >
            미리보기
          </Link>
          <Link
            href={`/builder/${scenarioId}/publish`}
            className={buttonVariants({ size: "sm" })}
            onClick={() => void flush()}
          >
            검수·발행
            {totals.errors > 0 && (
              <span className="bg-destructive/80 ml-1 rounded-full px-1.5 text-xs">
                {totals.errors}
              </span>
            )}
          </Link>
        </div>
      </header>

      {message && (status === "invalid" || status === "error") && (
        <p
          role="alert"
          className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm"
        >
          {message}
        </p>
      )}

      <nav aria-label="제작 단계" className="-mx-4 overflow-x-auto px-4">
        <ol className="flex min-w-max gap-1">
          {STEPS.map((s, i) => {
            const counts = perStep.get(s.key)!;
            const active = i === stepIndex;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => goTo(i)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/70",
                  )}
                >
                  <span className="font-medium">{i + 1}</span>
                  {s.label}
                  {counts.errors > 0 ? (
                    <CircleAlert
                      className="text-destructive size-4"
                      aria-label={`오류 ${counts.errors}건`}
                    />
                  ) : counts.warnings > 0 ? (
                    <AlertTriangle
                      className="size-4 text-amber-400"
                      aria-label={`경고 ${counts.warnings}건`}
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-labelledby="step-title" className="flex flex-col gap-4">
        <h2 id="step-title" className="text-lg font-medium">
          {stepIndex + 1}. {step.label}
        </h2>
        <StepComponent
          bundle={bundle}
          userId={userId}
          scenarioId={scenarioId}
          edit={edit}
        />
        <StepIssues issues={issues.filter((i) => i.step === step.key)} />
      </section>

      <footer className="flex justify-between border-t pt-4">
        <Button
          variant="outline"
          disabled={stepIndex === 0}
          onClick={() => goTo(stepIndex - 1)}
        >
          이전
        </Button>
        {stepIndex < STEPS.length - 1 ? (
          <Button onClick={() => goTo(stepIndex + 1)}>다음</Button>
        ) : (
          <Link
            href={`/builder/${scenarioId}/publish`}
            className={buttonVariants()}
            onClick={() => void flush()}
          >
            검수·발행으로
          </Link>
        )}
      </footer>
    </div>
  );
}

function StepIssues({ issues }: { issues: ReturnType<typeof reviewScenario> }) {
  if (issues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5 rounded-xl border p-3 text-sm">
      {issues.map((i, idx) => (
        <li key={`${i.code}-${idx}`} className="flex gap-2">
          {i.level === "error" ? (
            <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          )}
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}
