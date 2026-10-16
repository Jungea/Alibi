import { describe, expect, it } from "vitest";

import {
  addSlot,
  emptyNotes,
  gridKey,
  NOTES_LIMITS,
  notesSchema,
  parseNotes,
  placeClue,
  pruneNotes,
  removeClueFromGrid,
  removeLastSlot,
  setCellNote,
  setEdgeLabel,
  setMemo,
  setSlotLabel,
  setSuspicion,
  toggleConflict,
  toggleEdge,
  toggleTag,
} from "./notes";

const A = "c0000000-0000-4000-8000-000000000001";
const B = "c0000000-0000-4000-8000-000000000002";
const C = "c0000000-0000-4000-8000-000000000003";
const K1 = "e0000000-0000-4000-8000-000000000001";
const K2 = "e0000000-0000-4000-8000-000000000002";

describe("parseNotes", () => {
  it("올바른 값은 그대로, 깨진 값은 빈 노트로 읽는다", () => {
    const n = setSuspicion(emptyNotes(), A, 70);
    expect(parseNotes(JSON.parse(JSON.stringify(n)))).toEqual(n);
    expect(parseNotes(null)).toEqual(emptyNotes());
    expect(parseNotes({ v: 2 })).toEqual(emptyNotes());
    expect(parseNotes({ ...n, suspicion: { [A]: 500 } })).toEqual(emptyNotes());
  });

  it("편집 함수가 만든 노트는 항상 스키마를 통과한다", () => {
    let n = emptyNotes();
    n = setSuspicion(n, A, 30);
    n = toggleTag(n, `clue:${K1}`, "suspect", "열쇠");
    n = toggleTag(n, "msg:15", "contradiction", "발언");
    n = placeClue(n, A, 1, K1);
    n = toggleConflict(n, gridKey(A, 1));
    n = setCellNote(n, gridKey(A, 1), "메모");
    n = toggleEdge(n, A, B);
    n = setEdgeLabel(n, B, A, "연인");
    n = setMemo(n, "추리");
    expect(notesSchema.safeParse(n).success).toBe(true);
  });
});

describe("의심도", () => {
  it("0~100 정수로 맞춘다", () => {
    expect(setSuspicion(emptyNotes(), A, 150).suspicion[A]).toBe(100);
    expect(setSuspicion(emptyNotes(), A, -5).suspicion[A]).toBe(0);
    expect(setSuspicion(emptyNotes(), A, 42.6).suspicion[A]).toBe(43);
  });
});

describe("태그", () => {
  it("같은 태그를 다시 누르면 지워지고 다른 태그는 바뀐다", () => {
    let n = toggleTag(emptyNotes(), "msg:1", "suspect", "수상한 말");
    expect(n.tags["msg:1"]).toEqual({ tag: "suspect", label: "수상한 말" });
    n = toggleTag(n, "msg:1", "contradiction", "수상한 말");
    expect(n.tags["msg:1"].tag).toBe("contradiction");
    n = toggleTag(n, "msg:1", "contradiction", "수상한 말");
    expect(n.tags).toEqual({});
  });

  it("라벨은 잘리고 개수 한도를 넘는 새 태그는 무시한다", () => {
    const long = toggleTag(emptyNotes(), "msg:1", "suspect", "가".repeat(200));
    expect(long.tags["msg:1"].label).toHaveLength(NOTES_LIMITS.tagLabel);

    let n = emptyNotes();
    for (let i = 0; i < NOTES_LIMITS.tags + 5; i++)
      n = toggleTag(n, `msg:${i}`, "suspect", "x");
    expect(Object.keys(n.tags)).toHaveLength(NOTES_LIMITS.tags);
    // 이미 있는 항목은 한도 안에서도 바꿀 수 있다
    expect(toggleTag(n, "msg:0", "contradiction", "x").tags["msg:0"].tag).toBe(
      "contradiction",
    );
  });
});

describe("알리바이 표", () => {
  it("힌트를 놓으면 다른 칸에서 옮겨 온다", () => {
    let n = placeClue(emptyNotes(), A, 0, K1);
    n = placeClue(n, B, 2, K1);
    expect(n.grid[gridKey(A, 0)]).toBeUndefined();
    expect(n.grid[gridKey(B, 2)].clues).toEqual([K1]);
  });

  it("같은 칸에 두 번 놓거나 없는 시간 칸에는 놓이지 않는다", () => {
    let n = placeClue(emptyNotes(), A, 0, K1);
    n = placeClue(n, A, 0, K1);
    expect(n.grid[gridKey(A, 0)].clues).toEqual([K1]);
    expect(placeClue(emptyNotes(), A, 3, K1)).toEqual(emptyNotes());
    expect(placeClue(emptyNotes(), A, -1, K1)).toEqual(emptyNotes());
  });

  it("칸당 힌트 수 한도를 넘기지 않는다", () => {
    let n = emptyNotes();
    for (let i = 0; i < NOTES_LIMITS.cellClues + 2; i++)
      n = placeClue(
        n,
        A,
        0,
        `e0000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`,
      );
    expect(n.grid[gridKey(A, 0)].clues).toHaveLength(NOTES_LIMITS.cellClues);
  });

  it("비어 있는 칸은 저장하지 않는다", () => {
    let n = placeClue(emptyNotes(), A, 0, K1);
    n = removeClueFromGrid(n, K1);
    expect(n.grid).toEqual({});
    n = toggleConflict(emptyNotes(), gridKey(A, 0));
    expect(n.grid[gridKey(A, 0)].conflict).toBe(true);
    n = toggleConflict(n, gridKey(A, 0));
    expect(n.grid).toEqual({});
    expect(setCellNote(emptyNotes(), gridKey(A, 0), "").grid).toEqual({});
  });

  it("시간 칸을 늘리고 줄이며, 줄이면 그 칸의 내용도 사라진다", () => {
    let n = emptyNotes();
    n = setSlotLabel(n, 0, "20:00");
    n = placeClue(n, A, 2, K1);
    n = removeLastSlot(n);
    expect(n.slots).toHaveLength(2);
    expect(n.grid).toEqual({});
    for (let i = 0; i < 20; i++) n = addSlot(n);
    expect(n.slots).toHaveLength(NOTES_LIMITS.slots);
    let one = emptyNotes();
    for (let i = 0; i < 10; i++) one = removeLastSlot(one);
    expect(one.slots).toHaveLength(1);
  });
});

describe("인물관계도", () => {
  it("선은 순서와 상관없이 하나만 있고, 같은 선을 다시 누르면 지워진다", () => {
    let n = toggleEdge(emptyNotes(), A, B);
    n = toggleEdge(n, B, A);
    expect(n.edges).toEqual([]);
    n = toggleEdge(n, A, B);
    n = setEdgeLabel(n, B, A, "원수");
    expect(n.edges).toEqual([{ a: A, b: B, label: "원수" }]);
  });

  it("자기 자신과는 연결하지 않는다", () => {
    expect(toggleEdge(emptyNotes(), A, A)).toEqual(emptyNotes());
  });
});

describe("메모와 정리", () => {
  it("메모는 한도에서 잘린다", () => {
    expect(setMemo(emptyNotes(), "가".repeat(5000)).memo).toHaveLength(
      NOTES_LIMITS.memo,
    );
  });

  it("없어진 인물·힌트를 가리키는 항목을 지운다", () => {
    let n = emptyNotes();
    n = setSuspicion(n, A, 10);
    n = setSuspicion(n, C, 90);
    n = toggleEdge(n, A, B);
    n = toggleEdge(n, A, C);
    n = placeClue(n, A, 0, K1);
    n = placeClue(n, A, 0, K2);
    const pruned = pruneNotes(n, new Set([A, B]), new Set([K1]));
    expect(pruned.suspicion).toEqual({ [A]: 10 });
    expect(pruned.edges).toEqual([{ a: A, b: B, label: "" }]);
    expect(pruned.grid[gridKey(A, 0)].clues).toEqual([K1]);
  });
});
