"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addSlot,
  gridKey,
  NOTES_LIMITS,
  placeClue,
  removeClueFromGrid,
  removeLastSlot,
  setCellNote,
  setEdgeLabel,
  setMemo,
  setSlotLabel,
  setSuspicion,
  TAG_LABELS,
  toggleConflict,
  toggleEdge,
  toggleTag,
  type NoteTag,
} from "@/lib/game/notes";

import { DictationButton } from "./dictation-button";
import type { RoomContext } from "./room-client";
import { fetchClues } from "./state";
import type { NotesApi } from "./use-notes";
import { useRemote } from "./use-remote";

type Section = "suspect" | "alibi" | "relations" | "memo";
const SECTIONS: [Section, string][] = [
  ["suspect", "의심도·태그"],
  ["alibi", "알리바이 표"],
  ["relations", "관계도"],
  ["memo", "메모"],
];

const STATUS_TEXT = {
  loading: "불러오는 중…",
  idle: "",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장하지 못했습니다",
} as const;

/** 발언·힌트 옆에 붙는 태그 버튼 (의심 / 모순). 누르면 노트에 모이고 다시 누르면 지워진다. */
export function TagButtons({
  notes,
  tagKey,
  label,
}: {
  notes: NotesApi;
  tagKey: string;
  label: string;
}) {
  const current = notes.notes.tags[tagKey]?.tag;
  return (
    <span className="inline-flex gap-1" role="group" aria-label="태그">
      {(Object.keys(TAG_LABELS) as NoteTag[]).map((tag) => (
        <button
          key={tag}
          type="button"
          aria-pressed={current === tag}
          disabled={notes.status === "loading"}
          onClick={() => notes.update((n) => toggleTag(n, tagKey, tag, label))}
          className={`rounded-full border px-2 py-0.5 text-xs ${
            current === tag
              ? tag === "suspect"
                ? "border-amber-400 bg-amber-400/20 text-amber-300"
                : "border-rose-400 bg-rose-400/20 text-rose-300"
              : "text-muted-foreground"
          }`}
        >
          {TAG_LABELS[tag]}
        </button>
      ))}
    </span>
  );
}

/** 구조화 추리노트: 글자 입력을 최소화하고 슬라이더·태그·칸 배치·선 연결로 정리한다. 본인만 볼 수 있다. */
export function NotesPanel({
  ctx,
  notes,
}: {
  ctx: RoomContext;
  notes: NotesApi;
}) {
  const [section, setSection] = useState<Section>("suspect");

  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">추리노트</h2>
        <span
          className={`text-xs ${notes.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
          role="status"
        >
          {notes.status === "error" && notes.error
            ? notes.error
            : STATUS_TEXT[notes.status]}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        나만 볼 수 있는 노트입니다. 자동으로 저장됩니다.
      </p>

      <div
        role="tablist"
        aria-label="노트 구역"
        className="flex flex-wrap gap-1.5"
      >
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={`rounded-full border px-3 py-1 text-sm ${section === id ? "bg-primary text-primary-foreground border-transparent" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "suspect" && <Suspicion ctx={ctx} notes={notes} />}
      {section === "alibi" && <AlibiTable ctx={ctx} notes={notes} />}
      {section === "relations" && <Relations ctx={ctx} notes={notes} />}
      {section === "memo" && <Memo notes={notes} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
function Suspicion({ ctx, notes }: { ctx: RoomContext; notes: NotesApi }) {
  const { overview } = ctx;
  const others = overview.characters.filter(
    (c) => c.id !== overview.myCharacterId,
  );
  const tagged = Object.entries(notes.notes.tags);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">용의자별 의심도</h3>
        <ul className="flex flex-col gap-2">
          {others.map((c) => {
            const value = notes.notes.suspicion[c.id] ?? 0;
            return (
              <li key={c.id} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate">
                  {c.name || "이름 없음"}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={value}
                  aria-label={`${c.name || "이름 없음"} 의심도`}
                  className="flex-1"
                  onChange={(e) =>
                    notes.update((n) =>
                      setSuspicion(n, c.id, Number(e.target.value)),
                    )
                  }
                />
                <span className="w-10 text-right tabular-nums">{value}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">태그한 발언·힌트 ({tagged.length})</h3>
        {tagged.length === 0 ? (
          <p className="text-muted-foreground">
            채팅 메시지나 증거 보관함의 힌트에서
            &ldquo;의심&rdquo;·&ldquo;모순&rdquo;을 눌러 모아 보세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tagged.map(([key, t]) => (
              <li key={key} className="flex items-center gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${t.tag === "suspect" ? "bg-amber-400/20 text-amber-300" : "bg-rose-400/20 text-rose-300"}`}
                >
                  {TAG_LABELS[t.tag]}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {key.startsWith("clue:") ? "힌트" : "발언"}
                </span>
                <span className="min-w-0 flex-1 truncate">{t.label}</span>
                <button
                  type="button"
                  aria-label="태그 지우기"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    notes.update((n) => toggleTag(n, key, t.tag, t.label))
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AlibiTable({ ctx, notes }: { ctx: RoomContext; notes: NotesApi }) {
  const { overview } = ctx;
  const n = notes.notes;
  const [selected, setSelected] = useState<string | null>(null);

  const { data: clues } = useRemote(
    () => fetchClues(ctx.supabase, ctx.roomId),
    ctx.pulse,
  );
  const clueList = clues ?? [];
  const titleOf = (id: string) =>
    clueList.find((c) => c.id === id)?.title || "제목 없음";
  const placed = new Set(Object.values(n.grid).flatMap((c) => c.clues));

  const place = (characterId: string, slot: number, clueId: string) => {
    notes.update((x) => placeClue(x, characterId, slot, clueId));
    setSelected(null);
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground text-xs">
        힌트를 끌어다 놓거나, 힌트를 누른 뒤 칸을 눌러 배치하세요. 시간 칸
        이름은 직접 적습니다. 앞뒤가 맞지 않는 칸은 &ldquo;모순&rdquo;으로
        표시하세요.
      </p>

      <div className="flex flex-col gap-1.5">
        <h3 className="font-medium">내 힌트</h3>
        {clueList.length === 0 ? (
          <p className="text-muted-foreground">아직 획득한 힌트가 없습니다.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {clueList.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  draggable
                  aria-pressed={selected === c.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => setSelected((s) => (s === c.id ? null : c.id))}
                  className={`rounded-full border px-3 py-1 text-xs ${selected === c.id ? "border-primary bg-primary/20" : ""} ${placed.has(c.id) ? "opacity-60" : ""}`}
                >
                  {c.title || "제목 없음"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-xs">
          <thead>
            <tr>
              <th className="bg-card sticky left-0 w-20 p-1 text-left font-normal">
                인물 \ 시간
              </th>
              {n.slots.map((label, i) => (
                <th key={i} className="p-1">
                  <Input
                    value={label}
                    maxLength={NOTES_LIMITS.slotLabel}
                    placeholder={`시간 ${i + 1}`}
                    aria-label={`시간 칸 ${i + 1} 이름`}
                    className="h-8 text-xs"
                    onChange={(e) =>
                      notes.update((x) => setSlotLabel(x, i, e.target.value))
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overview.characters.map((c) => (
              <tr key={c.id} className="align-top">
                <th className="bg-card sticky left-0 p-1 text-left font-medium">
                  {c.name || "이름 없음"}
                  {c.id === overview.myCharacterId && (
                    <span className="text-muted-foreground"> (나)</span>
                  )}
                </th>
                {n.slots.map((_, slot) => {
                  const key = gridKey(c.id, slot);
                  const cell = n.grid[key];
                  return (
                    <td
                      key={slot}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain");
                        if (clueList.some((x) => x.id === id))
                          place(c.id, slot, id);
                      }}
                      onClick={() => selected && place(c.id, slot, selected)}
                      className={`h-16 min-w-24 rounded-md border p-1 ${cell?.conflict ? "border-rose-400 bg-rose-400/10" : ""} ${selected ? "cursor-pointer" : ""}`}
                    >
                      <div className="flex flex-wrap gap-1">
                        {cell?.clues.map((id) => (
                          <span
                            key={id}
                            className="bg-muted flex items-center gap-1 rounded-full px-2 py-0.5"
                          >
                            {titleOf(id)}
                            <button
                              type="button"
                              aria-label={`${titleOf(id)} 빼기`}
                              onClick={(e) => {
                                e.stopPropagation();
                                notes.update((x) => removeClueFromGrid(x, id));
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div
                        className="mt-1 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-pressed={!!cell?.conflict}
                          aria-label={`${c.name} ${n.slots[slot] || slot + 1} 모순 표시`}
                          onClick={() =>
                            notes.update((x) => toggleConflict(x, key))
                          }
                          className={`rounded px-1 ${cell?.conflict ? "text-rose-300" : "text-muted-foreground"}`}
                        >
                          ⚠
                        </button>
                        <input
                          value={cell?.note ?? ""}
                          maxLength={NOTES_LIMITS.cellNote}
                          placeholder="메모"
                          aria-label={`${c.name} ${n.slots[slot] || slot + 1} 메모`}
                          className="min-w-0 flex-1 bg-transparent outline-none"
                          onChange={(e) =>
                            notes.update((x) =>
                              setCellNote(x, key, e.target.value),
                            )
                          }
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={n.slots.length >= NOTES_LIMITS.slots}
          onClick={() => notes.update(addSlot)}
        >
          시간 칸 추가
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={n.slots.length <= 1}
          onClick={() => {
            if (window.confirm("마지막 시간 칸과 그 칸의 내용을 지울까요?"))
              notes.update(removeLastSlot);
          }}
        >
          마지막 칸 지우기
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 115;

function Relations({ ctx, notes }: { ctx: RoomContext; notes: NotesApi }) {
  const { characters, myCharacterId } = ctx.overview;
  const [pick, setPick] = useState<string | null>(null);
  const edges = notes.notes.edges;

  const pos = new Map(
    characters.map((c, i) => {
      const angle =
        (2 * Math.PI * i) / Math.max(characters.length, 1) - Math.PI / 2;
      return [
        c.id,
        {
          x: CENTER + RADIUS * Math.cos(angle),
          y: CENTER + RADIUS * Math.sin(angle),
        },
      ];
    }),
  );
  const nameOf = (id: string) =>
    characters.find((c) => c.id === id)?.name || "이름 없음";

  const clickNode = (id: string) => {
    if (!pick) return setPick(id);
    if (pick === id) return setPick(null);
    notes.update((n) => toggleEdge(n, pick, id));
    setPick(null);
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground text-xs">
        인물 두 명을 차례로 누르면 선이 이어지고, 같은 둘을 다시 이으면
        지워집니다.
        {pick && (
          <span className="text-foreground">
            {" "}
            {nameOf(pick)} 선택 중 — 이을 상대를 누르세요.
          </span>
        )}
      </p>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="group"
        aria-label="인물관계도"
        className="mx-auto w-full max-w-sm"
      >
        {edges.map((e) => {
          const a = pos.get(e.a);
          const b = pos.get(e.b);
          if (!a || !b) return null;
          return (
            <g key={`${e.a}-${e.b}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="stroke-muted-foreground"
                strokeWidth={2}
              />
              {e.label && (
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 4}
                  textAnchor="middle"
                  className="fill-foreground text-[10px]"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {characters.map((c) => {
          const p = pos.get(c.id)!;
          const active = pick === c.id;
          return (
            <g
              key={c.id}
              role="button"
              tabIndex={0}
              aria-label={`${c.name || "이름 없음"} 선택`}
              aria-pressed={active}
              className="cursor-pointer outline-none"
              onClick={() => clickNode(c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  clickNode(c.id);
                }
              }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={24}
                className={
                  active
                    ? "fill-primary"
                    : c.id === myCharacterId
                      ? "fill-amber-400/30 stroke-amber-400"
                      : "fill-card stroke-border"
                }
                strokeWidth={2}
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                className={`text-[11px] ${active ? "fill-primary-foreground" : "fill-foreground"}`}
              >
                {(c.name || "?").slice(0, 4)}
              </text>
            </g>
          );
        })}
      </svg>

      {edges.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {edges.map((e) => (
            <li key={`${e.a}-${e.b}`} className="flex items-center gap-2">
              <span className="shrink-0">
                {nameOf(e.a)} — {nameOf(e.b)}
              </span>
              <Input
                value={e.label}
                maxLength={NOTES_LIMITS.edgeLabel}
                placeholder="관계 (예: 연인)"
                aria-label={`${nameOf(e.a)}와 ${nameOf(e.b)}의 관계`}
                className="h-8 flex-1 text-sm"
                onChange={(ev) =>
                  notes.update((n) =>
                    setEdgeLabel(n, e.a, e.b, ev.target.value),
                  )
                }
              />
              <button
                type="button"
                aria-label="선 지우기"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => notes.update((n) => toggleEdge(n, e.a, e.b))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Memo({ notes }: { notes: NotesApi }) {
  const memo = notes.notes.memo;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">자유 메모</h3>
        <DictationButton
          onText={(text) =>
            notes.update((n) => setMemo(n, `${n.memo} ${text}`.trim()))
          }
        />
      </div>
      <Textarea
        value={memo}
        maxLength={NOTES_LIMITS.memo}
        rows={6}
        placeholder="추리한 내용을 적어 두세요. 마이크 버튼으로 말해서 적을 수도 있습니다."
        aria-label="자유 메모"
        onChange={(e) => notes.update((n) => setMemo(n, e.target.value))}
      />
      <span className="text-muted-foreground self-end text-xs">
        {memo.length} / {NOTES_LIMITS.memo}
      </span>
    </div>
  );
}
