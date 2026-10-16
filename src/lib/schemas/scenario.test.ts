import { describe, expect, it } from "vitest";

import { createEmptyBundle } from "@/features/builder/bundle";

import {
  basicSchema,
  bundleSchema,
  characterSchema,
  validateSection,
} from "./scenario";

describe("basicSchema", () => {
  const valid = createEmptyBundle().scenario;

  it("기본값은 통과한다", () => {
    expect(basicSchema.safeParse(valid).success).toBe(true);
  });

  it("최소 인원이 최대 인원보다 크면 실패한다", () => {
    const r = basicSchema.safeParse({ ...valid, minPlayers: 8, maxPlayers: 4 });
    expect(r.success).toBe(false);
  });

  it("범위를 벗어난 숫자와 NaN 을 거부한다", () => {
    expect(basicSchema.safeParse({ ...valid, maxPlayers: 21 }).success).toBe(
      false,
    );
    expect(
      basicSchema.safeParse({ ...valid, estimatedMinutes: 1 }).success,
    ).toBe(false);
    expect(
      basicSchema.safeParse({ ...valid, minPlayers: Number.NaN }).success,
    ).toBe(false);
  });

  it("허용되지 않은 진행 방식을 거부한다", () => {
    expect(basicSchema.safeParse({ ...valid, runMode: "robot" }).success).toBe(
      false,
    );
  });

  it("너무 긴 제목을 거부한다", () => {
    expect(
      basicSchema.safeParse({ ...valid, title: "가".repeat(101) }).success,
    ).toBe(false);
  });
});

describe("bundleSchema", () => {
  it("알 수 없는 formatVersion 을 거부한다", () => {
    expect(
      bundleSchema.safeParse({ ...createEmptyBundle(), formatVersion: 2 })
        .success,
    ).toBe(false);
  });

  it("목록 크기 제한을 둔다", () => {
    const b = createEmptyBundle();
    const many = Array.from({ length: 31 }, () => b.rounds[0]);
    expect(bundleSchema.safeParse({ ...b, rounds: many }).success).toBe(false);
  });

  it("필수 필드가 빠지면 거부한다", () => {
    const { characters, ...rest } = createEmptyBundle();
    void characters;
    expect(bundleSchema.safeParse(rest).success).toBe(false);
  });
});

describe("characterSchema", () => {
  it("uuid 가 아닌 id 를 거부한다", () => {
    const c = {
      id: "not-a-uuid",
      name: "x",
      publicInfo: "",
      secretInfo: "",
      background: "",
      relations: [],
      roleType: "suspect",
      personalGoal: "",
      liePolicy: "partial",
      lieNote: "",
      roundInfos: {},
      imagePath: null,
    };
    expect(characterSchema.safeParse(c).success).toBe(false);
  });
});

describe("validateSection", () => {
  it("검증 오류를 읽기 쉬운 문자열로 돌려준다", () => {
    const r = validateSection("basic", {
      ...createEmptyBundle().scenario,
      minPlayers: 9,
      maxPlayers: 3,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("최소 인원");
  });

  it("통과하면 파싱된 데이터를 돌려준다", () => {
    expect(validateSection("rounds", createEmptyBundle().rounds).ok).toBe(true);
  });
});
