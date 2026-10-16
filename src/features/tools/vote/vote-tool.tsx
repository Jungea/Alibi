"use client";

import { useState } from "react";
import { Check, RotateCcw, Vote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { parseList } from "../random/random-logic";
import { tallyVotes } from "./vote-logic";

type Phase =
  | { kind: "setup" }
  | { kind: "voting"; voter: number }
  | { kind: "handoff"; nextVoter: number }
  | { kind: "result" };

const textareaClass =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-28 w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3";

export function VoteTool() {
  const [candidatesText, setCandidatesText] = useState("");
  const [voterCount, setVoterCount] = useState("6");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [votes, setVotes] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    const list = parseList(candidatesText);
    const n = Number(voterCount);
    if (list.length < 2) {
      setError("후보를 두 명 이상 입력해 주세요.");
      return;
    }
    if (new Set(list).size !== list.length) {
      setError("후보 이름이 중복되었습니다.");
      return;
    }
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      setError("투표 인원은 1~50명 사이로 입력해 주세요.");
      return;
    }
    setError(null);
    setCandidates(list);
    setTotal(n);
    setVotes([]);
    setSelected(null);
    setPhase({ kind: "voting", voter: 1 });
  };

  const confirmVote = (voter: number) => {
    if (selected === null) return;
    setVotes((prev) => [...prev, selected]);
    setSelected(null);
    // 다음 사람에게 넘기는 가림 화면을 거쳐서, 앞사람의 선택이 보이지 않게 한다.
    setPhase(
      voter >= total
        ? { kind: "result" }
        : { kind: "handoff", nextVoter: voter + 1 },
    );
  };

  const restart = () => {
    setPhase({ kind: "setup" });
    setVotes([]);
    setSelected(null);
  };

  if (phase.kind === "setup") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vote-candidates">
            후보 ({parseList(candidatesText).length}명)
          </Label>
          <textarea
            id="vote-candidates"
            className={textareaClass}
            placeholder={"한 줄에 한 명 (쉼표도 가능)\n지아\n민수\n하늘"}
            value={candidatesText}
            onChange={(e) => setCandidatesText(e.target.value)}
          />
        </div>
        <div className="flex w-32 flex-col gap-1.5">
          <Label htmlFor="vote-voters">투표 인원</Label>
          <Input
            id="vote-voters"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={voterCount}
            onChange={(e) => setVoterCount(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div>
          <Button onClick={start}>
            <Vote /> 투표 시작
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          한 기기를 돌려가며 익명으로 투표합니다. 결과는 마지막 사람이 끝난
          뒤에만 보입니다.
        </p>
      </div>
    );
  }

  if (phase.kind === "handoff") {
    return (
      <div className="bg-card flex flex-col items-center gap-4 rounded-xl border p-8 text-center">
        <p className="text-muted-foreground text-sm">
          투표가 기록되었습니다. 화면을 가리고 다음 사람에게 기기를 넘겨 주세요.
        </p>
        <p className="text-2xl font-semibold">
          {phase.nextVoter}번째 투표자 ({phase.nextVoter}/{total})
        </p>
        <Button
          size="lg"
          onClick={() => setPhase({ kind: "voting", voter: phase.nextVoter })}
        >
          내 차례입니다
        </Button>
      </div>
    );
  }

  if (phase.kind === "voting") {
    const voter = phase.voter;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium">
          {voter}번째 투표자 ({voter}/{total}) — 범인이라고 생각하는 사람을
          고르세요
        </p>
        <ul className="flex flex-col gap-2">
          {candidates.map((c, i) => {
            const on = selected === i;
            return (
              <li key={c}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                    on
                      ? "border-primary bg-primary/10"
                      : "bg-card hover:bg-muted",
                  )}
                >
                  <span className="font-medium">{c}</span>
                  {on && <Check className="text-primary size-5" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div>
          <Button
            size="lg"
            disabled={selected === null}
            onClick={() => confirmVote(voter)}
          >
            투표 확정
          </Button>
        </div>
      </div>
    );
  }

  const result = tallyVotes(candidates, votes);
  const max = result.rows[0]?.count ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-xl border p-4">
        {result.isTie ? (
          <p className="text-lg font-semibold">
            동점입니다: {result.winners.join(", ")} (각 {max}표)
          </p>
        ) : (
          <p className="text-lg font-semibold">
            최다 득표: {result.winners[0]} ({max}표)
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          총 {result.totalVotes}표
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {result.rows.map((r) => {
          const isWinner = result.winners.includes(r.name);
          return (
            <li key={r.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className={cn("font-medium", isWinner && "text-primary")}>
                  {r.name}
                  {isWinner && result.isTie && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      공동 1위
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{r.count}표</span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full",
                    isWinner ? "bg-primary" : "bg-muted-foreground/50",
                  )}
                  style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div>
        <Button variant="outline" onClick={restart}>
          <RotateCcw /> 새 투표
        </Button>
      </div>
    </div>
  );
}
