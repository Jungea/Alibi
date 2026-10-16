import { describe, expect, it } from "vitest";

import { pickRandom, randomInt, shuffle } from "./random";

describe("randomInt", () => {
  it("항상 0 이상 max 미만이다", () => {
    for (let i = 0; i < 2000; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("max가 1이면 항상 0이다", () => {
    expect(randomInt(1)).toBe(0);
  });

  it("잘못된 max는 거부한다", () => {
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(-3)).toThrow(RangeError);
    expect(() => randomInt(1.5)).toThrow(RangeError);
  });

  it("모든 값이 대략 고르게 나온다", () => {
    const counts = new Array(6).fill(0);
    const trials = 60000;
    for (let i = 0; i < trials; i++) counts[randomInt(6)]++;
    const expected = trials / 6;
    for (const c of counts) {
      expect(Math.abs(c - expected) / expected).toBeLessThan(0.1);
    }
  });
});

describe("shuffle", () => {
  it("원소를 보존한다 (순열)", () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffle(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it("빈 배열과 한 개짜리 배열을 처리한다", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(["a"])).toEqual(["a"]);
  });

  it("3개 원소의 6가지 순열이 대략 고르게 나온다", () => {
    const counts = new Map<string, number>();
    const trials = 60000;
    for (let i = 0; i < trials; i++) {
      const key = shuffle([1, 2, 3]).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    const expected = trials / 6;
    for (const c of counts.values()) {
      expect(Math.abs(c - expected) / expected).toBeLessThan(0.1);
    }
  });
});

describe("pickRandom", () => {
  it("빈 배열이면 undefined", () => {
    expect(pickRandom([])).toBeUndefined();
  });

  it("배열 안의 값을 반환한다", () => {
    const items = ["a", "b", "c"];
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(pickRandom(items));
    }
  });
});
