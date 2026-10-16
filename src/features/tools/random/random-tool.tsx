"use client";

import { useState } from "react";
import { Eye, EyeOff, Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  assignCharacters,
  drawCard,
  parseList,
  speakingOrder,
  type Assignment,
} from "./random-logic";

const textareaClass =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-28 w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3";

export function RandomTool() {
  return (
    <Tabs defaultValue="assign">
      <TabsList>
        <TabsTrigger value="assign">인물 배정</TabsTrigger>
        <TabsTrigger value="card">카드 뽑기</TabsTrigger>
        <TabsTrigger value="order">발언 순서</TabsTrigger>
      </TabsList>
      <TabsContent value="assign" className="pt-2">
        <AssignPanel />
      </TabsContent>
      <TabsContent value="card" className="pt-2">
        <CardPanel />
      </TabsContent>
      <TabsContent value="order" className="pt-2">
        <OrderPanel />
      </TabsContent>
    </Tabs>
  );
}

function AssignPanel() {
  const [playersText, setPlayersText] = useState("");
  const [charactersText, setCharactersText] = useState("");
  const [result, setResult] = useState<Assignment[] | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const playerCount = parseList(playersText).length;
  const characterCount = parseList(charactersText).length;

  const run = () => {
    const r = assignCharacters(
      parseList(playersText),
      parseList(charactersText),
    );
    if (!r.ok) {
      setError(r.error);
      setResult(null);
      return;
    }
    setError(null);
    setResult(r.assignments);
    setRevealed(new Set());
  };

  const toggle = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assign-players">참가자 이름 ({playerCount}명)</Label>
          <textarea
            id="assign-players"
            className={textareaClass}
            placeholder={"한 줄에 한 명 (쉼표도 가능)\n지아\n민수"}
            value={playersText}
            onChange={(e) => setPlayersText(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assign-characters">
            인물 이름 ({characterCount}명)
          </Label>
          <textarea
            id="assign-characters"
            className={textareaClass}
            placeholder={"한 줄에 한 명 (쉼표도 가능)\n탐정\n집사"}
            value={charactersText}
            onChange={(e) => setCharactersText(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div>
        <Button onClick={run}>
          <Shuffle /> {result ? "다시 배정" : "배정하기"}
        </Button>
      </div>

      {result && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">배정 결과</h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRevealed(new Set(result.map((_, i) => i)))}
              >
                모두 보기
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRevealed(new Set())}
              >
                모두 가리기
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            자기 이름만 눌러서 확인하고 다시 가려 주세요.
          </p>
          <ul className="flex flex-col gap-2">
            {result.map((a, i) => {
              const shown = revealed.has(i);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={shown}
                    className="bg-card hover:bg-muted flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
                  >
                    <span className="font-medium">{a.player}</span>
                    <span className="flex items-center gap-2">
                      <span
                        className={
                          shown
                            ? "text-primary font-semibold"
                            : "text-muted-foreground"
                        }
                      >
                        {shown ? a.character : "탭하여 확인"}
                      </span>
                      {shown ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

interface DrawLog {
  card: string;
}

function CardPanel() {
  const [text, setText] = useState("");
  const [excludeDrawn, setExcludeDrawn] = useState(true);
  const [pool, setPool] = useState<string[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [history, setHistory] = useState<DrawLog[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const count = parseList(text).length;

  const start = () => {
    const cards = parseList(text);
    if (cards.length === 0) {
      setNotice("카드를 한 장 이상 입력해 주세요.");
      return;
    }
    setNotice(null);
    setPool(cards);
    setCurrent(null);
    setHistory([]);
  };

  const draw = () => {
    if (!pool) return;
    const r = drawCard(pool, excludeDrawn);
    if (!r) {
      setNotice("남은 카드가 없습니다.");
      return;
    }
    setNotice(null);
    setPool(r.remaining);
    setCurrent(r.card);
    setHistory((h) => [{ card: r.card }, ...h]);
  };

  const reset = () => {
    setPool(null);
    setCurrent(null);
    setHistory([]);
    setNotice(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {!pool ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-list">카드 목록 ({count}장)</Label>
            <textarea
              id="card-list"
              className={textareaClass}
              placeholder={"한 줄에 한 장 (쉼표도 가능)\n단서 A\n단서 B"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={excludeDrawn}
              onChange={(e) => setExcludeDrawn(e.target.checked)}
            />
            뽑은 카드는 제외하기
          </label>
          {notice && (
            <p role="alert" className="text-destructive text-sm">
              {notice}
            </p>
          )}
          <div>
            <Button onClick={start}>카드 준비</Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              남은 카드 {pool.length}장
              {excludeDrawn ? " (뽑으면 제외)" : " (뽑아도 유지)"}
            </span>
          </div>
          <div className="bg-card flex min-h-32 items-center justify-center rounded-xl border p-6 text-center">
            {current ? (
              <span className="text-3xl font-semibold break-words">
                {current}
              </span>
            ) : (
              <span className="text-muted-foreground">
                버튼을 눌러 카드를 뽑으세요.
              </span>
            )}
          </div>
          {notice && (
            <p role="alert" className="text-destructive text-sm">
              {notice}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={draw} disabled={pool.length === 0}>
              <Shuffle /> 한 장 뽑기
            </Button>
            <Button variant="outline" onClick={reset}>
              처음부터
            </Button>
          </div>
          {history.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-medium">뽑은 기록</h3>
              <ol className="text-muted-foreground flex flex-col gap-1 text-sm">
                {history.map((h, i) => (
                  <li key={history.length - i}>
                    {history.length - i}. {h.card}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function OrderPanel() {
  const [text, setText] = useState("");
  const [order, setOrder] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const names = parseList(text);

  const run = () => {
    if (names.length === 0) {
      setError("이름을 한 명 이상 입력해 주세요.");
      setOrder(null);
      return;
    }
    setError(null);
    setOrder(speakingOrder(names));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-names">참가자 이름 ({names.length}명)</Label>
        <textarea
          id="order-names"
          className={textareaClass}
          placeholder={"한 줄에 한 명 (쉼표도 가능)\n지아\n민수"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div>
        <Button onClick={run}>
          <Shuffle /> {order ? "다시 섞기" : "순서 정하기"}
        </Button>
      </div>
      {order && (
        <ol className="flex flex-col gap-2">
          {order.map((n, i) => (
            <li
              key={i}
              className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3"
            >
              <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-full text-sm font-semibold">
                {i + 1}
              </span>
              <span className="font-medium">{n}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
