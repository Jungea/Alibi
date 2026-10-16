import { describe, expect, it } from "vitest";

import { tallyVotes } from "./vote-logic";

const candidates = ["A", "B", "C"];

describe("tallyVotes", () => {
  it("득표 내림차순으로 정렬하고 1위를 구한다", () => {
    const r = tallyVotes(candidates, [1, 1, 0, 2, 1]);
    expect(r.rows).toEqual([
      { name: "B", count: 3 },
      { name: "A", count: 1 },
      { name: "C", count: 1 },
    ]);
    expect(r.winners).toEqual(["B"]);
    expect(r.isTie).toBe(false);
    expect(r.totalVotes).toBe(5);
  });

  it("동점이면 공동 1위를 모두 반환하고 isTie가 true다", () => {
    const r = tallyVotes(candidates, [0, 1, 0, 1, 2]);
    expect(r.winners).toEqual(["A", "B"]);
    expect(r.isTie).toBe(true);
  });

  it("전원 동점이어도 처리한다", () => {
    const r = tallyVotes(candidates, [0, 1, 2]);
    expect(r.winners).toEqual(["A", "B", "C"]);
    expect(r.isTie).toBe(true);
  });

  it("투표가 없으면 1위가 없다", () => {
    const r = tallyVotes(candidates, []);
    expect(r.winners).toEqual([]);
    expect(r.isTie).toBe(false);
    expect(r.totalVotes).toBe(0);
  });

  it("범위를 벗어난 인덱스는 무시한다", () => {
    const r = tallyVotes(candidates, [0, 5, -1, 1.5]);
    expect(r.totalVotes).toBe(1);
    expect(r.winners).toEqual(["A"]);
  });
});
