import { describe, expect, it } from "vitest";

import {
  isCulpritCaught,
  resolveEnding,
  type EndingContext,
  type EndingRule,
} from "./ending";

const rule = (
  id: string,
  conditionKind: EndingRule["conditionKind"],
  conditionMissionId: string | null = null,
): EndingRule => ({ id, conditionKind, conditionMissionId });

const ctx = (over: Partial<EndingContext> = {}): EndingContext => ({
  votes: {},
  culpritIds: new Set(["culprit"]),
  doneMissionIds: new Set(),
  missionIds: new Set(["m1", "m2"]),
  ...over,
});

describe("isCulpritCaught", () => {
  const culprits = new Set(["culprit"]);

  it("가장 많은 표를 받은 사람이 혼자이고 범인이면 잡은 것이다", () => {
    expect(isCulpritCaught({ culprit: 3, maid: 1 }, culprits)).toBe(true);
    expect(isCulpritCaught({ culprit: 1 }, culprits)).toBe(true);
  });

  it("무고한 사람이 가장 많은 표를 받으면 놓친 것이다", () => {
    expect(isCulpritCaught({ culprit: 1, maid: 3 }, culprits)).toBe(false);
  });

  it("동점이면 범인이 포함돼도 놓친 것이다", () => {
    expect(isCulpritCaught({ culprit: 2, maid: 2 }, culprits)).toBe(false);
    expect(isCulpritCaught({ culprit: 2, maid: 2, butler: 1 }, culprits)).toBe(
      false,
    );
  });

  it("투표가 없으면 놓친 것이다", () => {
    expect(isCulpritCaught({}, culprits)).toBe(false);
    expect(isCulpritCaught({ culprit: 0 }, culprits)).toBe(false);
  });
});

describe("resolveEnding", () => {
  it("결말이 없으면 null", () => {
    expect(resolveEnding([], ctx())).toBeNull();
  });

  it("범인을 잡았는지에 따라 결말이 갈린다", () => {
    const endings = [
      rule("caught", "culprit_caught"),
      rule("escaped", "culprit_escaped"),
    ];
    expect(resolveEnding(endings, ctx({ votes: { culprit: 2 } }))).toBe(
      "caught",
    );
    expect(resolveEnding(endings, ctx({ votes: { maid: 2 } }))).toBe("escaped");
  });

  it("미션을 달성했는지에 따라 결말이 갈린다", () => {
    const endings = [
      rule("ok", "mission_done", "m1"),
      rule("bad", "mission_failed", "m1"),
    ];
    expect(
      resolveEnding(endings, ctx({ doneMissionIds: new Set(["m1"]) })),
    ).toBe("ok");
    expect(resolveEnding(endings, ctx())).toBe("bad");
  });

  it("목록 순서대로 처음 맞는 결말을 고른다", () => {
    const endings = [
      rule("mission", "mission_done", "m1"),
      rule("caught", "culprit_caught"),
    ];
    const both = ctx({
      votes: { culprit: 2 },
      doneMissionIds: new Set(["m1"]),
    });
    expect(resolveEnding(endings, both)).toBe("mission");
    expect(resolveEnding([...endings].reverse(), both)).toBe("caught");
  });

  it("맞는 결말이 없으면 기본 결말, 그것도 없으면 첫 번째 결말", () => {
    const withDefault = [
      rule("caught", "culprit_caught"),
      rule("fallback", "default"),
    ];
    expect(resolveEnding(withDefault, ctx())).toBe("fallback");

    const noDefault = [
      rule("caught", "culprit_caught"),
      rule("m", "mission_done", "m1"),
    ];
    expect(resolveEnding(noDefault, ctx())).toBe("caught");
  });

  it("기본 결말은 목록 앞에 있어도 다른 조건보다 먼저 뽑히지 않는다", () => {
    const endings = [
      rule("fallback", "default"),
      rule("caught", "culprit_caught"),
    ];
    expect(resolveEnding(endings, ctx({ votes: { culprit: 1 } }))).toBe(
      "caught",
    );
  });

  it("없는 미션이나 비어 있는 미션을 가리키는 조건은 맞지 않는다", () => {
    const endings = [
      rule("ghost", "mission_failed", "nope"),
      rule("empty", "mission_done", null),
      rule("fallback", "default"),
    ];
    expect(resolveEnding(endings, ctx())).toBe("fallback");
  });
});
