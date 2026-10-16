import { describe, expect, it } from "vitest";

import {
  assignCharacters,
  drawCard,
  parseList,
  speakingOrder,
} from "./random-logic";

describe("parseList", () => {
  it("줄바꿈과 쉼표로 나누고 공백·빈 항목을 정리한다", () => {
    expect(parseList(" 가, 나 \n\n다,, \n")).toEqual(["가", "나", "다"]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(parseList("  \n , ")).toEqual([]);
  });
});

describe("assignCharacters", () => {
  const players = ["지아", "민수", "하늘", "도윤"];
  const characters = ["탐정", "집사", "의사", "화가"];

  it("모든 인물이 중복 없이 한 명에게 배정된다", () => {
    const r = assignCharacters(players, characters);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assignments.map((a) => a.player)).toEqual(players);
    expect(r.assignments.map((a) => a.character).sort()).toEqual(
      [...characters].sort(),
    );
  });

  it("수가 다르면 오류를 반환한다", () => {
    const r = assignCharacters(players, characters.slice(0, 3));
    expect(r.ok).toBe(false);
  });

  it("참가자가 없으면 오류를 반환한다", () => {
    expect(assignCharacters([], []).ok).toBe(false);
  });
});

describe("drawCard", () => {
  it("빈 목록이면 null", () => {
    expect(drawCard([], true)).toBeNull();
  });

  it("제외 옵션이면 뽑은 카드가 남은 목록에서 빠진다", () => {
    const pool = ["a", "b", "c"];
    const r = drawCard(pool, true);
    expect(r).not.toBeNull();
    expect(r!.remaining).toHaveLength(2);
    expect(r!.remaining).not.toContain(r!.card);
    expect(pool).toEqual(["a", "b", "c"]);
  });

  it("제외하지 않으면 목록이 그대로다", () => {
    const r = drawCard(["a", "b", "c"], false);
    expect(r!.remaining).toEqual(["a", "b", "c"]);
  });

  it("같은 이름 카드가 여러 장이면 한 장만 제거한다", () => {
    const r = drawCard(["x", "x", "x"], true);
    expect(r!.remaining).toEqual(["x", "x"]);
  });

  it("제외하며 끝까지 뽑으면 모든 카드가 정확히 한 번씩 나온다", () => {
    let pool = ["a", "b", "c", "d", "e"];
    const drawn: string[] = [];
    while (pool.length > 0) {
      const r = drawCard(pool, true)!;
      drawn.push(r.card);
      pool = r.remaining;
    }
    expect(drawn.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("speakingOrder", () => {
  it("모든 이름이 한 번씩 포함된다", () => {
    const names = ["가", "나", "다", "라"];
    expect(speakingOrder(names).sort()).toEqual([...names].sort());
  });
});
