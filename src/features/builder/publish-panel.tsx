"use client";

import { AlertTriangle, CircleAlert, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  LABELS,
  STEPS,
  VISIBILITIES,
  type Visibility,
} from "@/lib/schemas/scenario";

import { publishAction } from "./actions";
import type { Issue } from "./review";
import type { VersionItem } from "./server/db";

export function PublishPanel({
  scenarioId,
  issues,
  versions,
}: {
  scenarioId: string;
  issues: Issue[];
  versions: VersionItem[];
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [ackWarnings, setAckWarnings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const canPublish =
    errors.length === 0 && (warnings.length === 0 || ackWarnings) && !busy;
  const stepIndex = (key: Issue["step"]) =>
    STEPS.findIndex((s) => s.key === key) + 1;
  const stepLabel = (key: Issue["step"]) =>
    STEPS.find((s) => s.key === key)?.label ?? key;

  const publish = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await publishAction(scenarioId, visibility);
      if (r.ok) {
        setResult({ ok: true, text: `v${r.versionNo}으로 발행했습니다.` });
        router.refresh();
      } else {
        setResult({ ok: false, text: r.error });
      }
    } catch {
      setResult({
        ok: false,
        text: "발행하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setBusy(false);
    }
  };

  const renderIssues = (list: Issue[], kind: "error" | "warning") =>
    list.length > 0 && (
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          {kind === "error" ? (
            <CircleAlert className="text-destructive size-4" />
          ) : (
            <AlertTriangle className="size-4 text-amber-400" />
          )}
          {kind === "error"
            ? `해결해야 할 오류 ${list.length}건`
            : `확인이 필요한 경고 ${list.length}건`}
        </h3>
        <ul className="flex flex-col gap-1.5">
          {list.map((i, idx) => (
            <li
              key={`${i.code}-${idx}`}
              className="bg-card flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <span>
                <span className="text-muted-foreground mr-2 text-xs">
                  {stepLabel(i.step)}
                </span>
                {i.message}
              </span>
              <Link
                href={`/builder/${scenarioId}/edit?step=${stepIndex(i.step)}`}
                className="text-primary shrink-0 text-xs hover:underline"
              >
                고치러 가기
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="flex flex-col gap-6">
      {issues.length === 0 && (
        <p className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm">
          검수에서 문제가 발견되지 않았습니다.
        </p>
      )}
      {renderIssues(errors, "error")}
      {renderIssues(warnings, "warning")}

      <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
        <h3 className="font-medium">발행</h3>
        <p className="text-muted-foreground text-sm">
          발행하면 지금 내용이 스냅샷(버전)으로 저장됩니다. 이후 시나리오를
          고쳐도 이미 만든 방에는 영향이 없습니다.
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">공개 범위</legend>
          {VISIBILITIES.map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={visibility === v}
                onChange={() => setVisibility(v)}
              />
              {LABELS.visibility[v]}
            </label>
          ))}
        </fieldset>
        {warnings.length > 0 && errors.length === 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ackWarnings}
              onChange={(e) => setAckWarnings(e.target.checked)}
            />
            위 경고를 확인했고 그대로 발행합니다.
          </label>
        )}
        <div className="flex items-center gap-3">
          <Button disabled={!canPublish} onClick={() => void publish()}>
            {busy ? "발행 중…" : "발행하기"}
          </Button>
          {errors.length > 0 && (
            <span className="text-muted-foreground text-xs">
              오류를 모두 해결하면 발행할 수 있습니다.
            </span>
          )}
        </div>
        {result && (
          <p
            role={result.ok ? "status" : "alert"}
            className={
              result.ok
                ? "text-sm text-emerald-400"
                : "text-destructive text-sm"
            }
          >
            {result.text}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">발행 이력</h3>
        {versions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            아직 발행한 적이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="bg-card flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <span>
                  <span className="font-medium">v{v.versionNo}</span>
                  <span className="text-muted-foreground ml-2">
                    {v.visibility === "public" ? "공개" : "비공개"} ·{" "}
                    {new Date(v.createdAt).toLocaleString("ko-KR")}
                  </span>
                </span>
                <Link
                  href={`/builder/${scenarioId}/export?version=${v.versionNo}`}
                  prefetch={false}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <Download /> JSON
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
