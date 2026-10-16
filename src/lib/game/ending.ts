/**
 * 결말 판정 엔진 (순수 함수). DB 의 결말 판정 함수와 같은 규칙이며,
 * 실제 판정은 투표와 미션 기록을 가진 DB 가 한다. 이 모듈은 규칙의 기준이자 테스트 대상이다.
 *
 * 규칙
 *  1. 결말 목록 순서대로 조건을 검사해 처음 맞는 결말을 고른다 ('기본 결말'은 건너뜀).
 *  2. 맞는 결말이 없으면 처음 나오는 '기본 결말', 그것도 없으면 첫 번째 결말.
 *  3. '범인을 잡았다' = 가장 많은 표를 받은 인물이 혼자이고, 그 인물이 범인이다 (동점이면 놓친 것).
 */

import type { ENDING_CONDITIONS } from "@/lib/schemas/scenario";

export type EndingConditionKind = (typeof ENDING_CONDITIONS)[number];

export interface EndingRule {
  id: string;
  conditionKind: EndingConditionKind;
  conditionMissionId: string | null;
}

export interface EndingContext {
  /** 인물 ID → 받은 표 수 */
  votes: Readonly<Record<string, number>>;
  /** 범인 역할인 인물 ID */
  culpritIds: ReadonlySet<string>;
  /** 달성한(done) 미션 ID */
  doneMissionIds: ReadonlySet<string>;
  /** 시나리오에 존재하는 미션 ID (없는 미션을 가리키는 조건은 맞지 않는다) */
  missionIds: ReadonlySet<string>;
}

export function isCulpritCaught(
  votes: EndingContext["votes"],
  culpritIds: EndingContext["culpritIds"],
): boolean {
  const ranked = Object.entries(votes)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return false;
  if (ranked.length > 1 && ranked[1][1] === ranked[0][1]) return false; // 동점
  return culpritIds.has(ranked[0][0]);
}

function matches(rule: EndingRule, ctx: EndingContext, caught: boolean) {
  switch (rule.conditionKind) {
    case "culprit_caught":
      return caught;
    case "culprit_escaped":
      return !caught;
    case "mission_done":
    case "mission_failed": {
      const id = rule.conditionMissionId;
      if (!id || !ctx.missionIds.has(id)) return false;
      return (
        ctx.doneMissionIds.has(id) === (rule.conditionKind === "mission_done")
      );
    }
    case "default":
      return false;
  }
}

/** 맞는 결말의 ID. 결말이 하나도 없으면 null. */
export function resolveEnding(
  endings: readonly EndingRule[],
  ctx: EndingContext,
): string | null {
  const caught = isCulpritCaught(ctx.votes, ctx.culpritIds);
  for (const rule of endings) {
    if (matches(rule, ctx, caught)) return rule.id;
  }
  return (
    endings.find((e) => e.conditionKind === "default")?.id ??
    endings[0]?.id ??
    null
  );
}
