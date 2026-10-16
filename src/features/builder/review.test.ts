import { describe, expect, it } from "vitest";

import type { ScenarioBundle } from "@/lib/schemas/scenario";

import {
  createCharacter,
  createEmptyBundle,
  createEnding,
  createMission,
  createTimelineEntry,
} from "./bundle";
import { countIssues, reviewScenario } from "./review";

/** 검수를 통과하는 최소한의 완성 시나리오 */
function validBundle(): ScenarioBundle {
  const b = createEmptyBundle();
  const chars = ["집사", "의사", "화가", "요리사"].map((name, i) => ({
    ...createCharacter(),
    name,
    publicInfo: "공개",
    secretInfo: "비밀",
    roleType: i === 0 ? ("culprit" as const) : ("suspect" as const),
  }));
  return {
    ...b,
    scenario: {
      ...b.scenario,
      title: "저택 살인 사건",
      minPlayers: 4,
      maxPlayers: 4,
    },
    characters: chars,
    endings: [{ ...createEnding(), name: "기본", truthText: "범인은 집사" }],
  };
}

const codes = (b: ScenarioBundle) => reviewScenario(b).map((i) => i.code);

describe("reviewScenario", () => {
  it("힌트가 없다는 경고만 있고 오류는 없는 최소 시나리오", () => {
    const issues = reviewScenario(validBundle());
    expect(countIssues(issues).errors).toBe(0);
    expect(issues.map((i) => i.code)).toEqual(["clues_missing"]);
  });

  it("범인이 없으면 오류", () => {
    const b = validBundle();
    b.characters[0].roleType = "suspect";
    expect(codes(b)).toContain("culprit_missing");
  });

  it("범인이 둘 이상이면 경고", () => {
    const b = validBundle();
    b.characters[1].roleType = "culprit";
    const issue = reviewScenario(b).find((i) => i.code === "culprit_multiple");
    expect(issue?.level).toBe("warning");
  });

  it("인물 수가 최소 인원보다 적으면 오류, 최대 인원보다 적으면 경고", () => {
    const b = validBundle();
    b.scenario.minPlayers = 5;
    b.scenario.maxPlayers = 6;
    expect(codes(b)).toContain("characters_lack");
    b.scenario.minPlayers = 3;
    const issues = reviewScenario(b);
    expect(issues.map((i) => i.code)).not.toContain("characters_lack");
    expect(issues.find((i) => i.code === "characters_lack_max")?.level).toBe(
      "warning",
    );
  });

  it("제목이 없으면 오류", () => {
    const b = validBundle();
    b.scenario.title = "  ";
    expect(codes(b)).toContain("title_missing");
  });

  it("라운드나 결말이 없으면 오류", () => {
    const b = validBundle();
    b.rounds = [];
    b.endings = [];
    expect(codes(b)).toEqual(
      expect.arrayContaining(["rounds_missing", "endings_missing"]),
    );
  });

  it("기본 결말이 없으면 경고", () => {
    const b = validBundle();
    b.endings[0].conditionKind = "culprit_caught";
    expect(codes(b)).toContain("ending_default_missing");
  });

  it("미션 결말 조건에 미션이 없으면 오류", () => {
    const b = validBundle();
    b.endings[0].conditionKind = "mission_done";
    expect(codes(b)).toContain("ending_mission");
  });

  describe("자동 모드 호환", () => {
    const withSelfReport = (runMode: ScenarioBundle["scenario"]["runMode"]) => {
      const b = validBundle();
      b.scenario.runMode = runMode;
      b.missions = [
        {
          ...createMission(),
          title: "고백",
          scope: "common",
          judgeType: "self_report",
        },
      ];
      return b;
    };

    it("자동 진행 가능/둘 다 가능 모드에서 자가 보고 미션은 오류", () => {
      expect(codes(withSelfReport("auto_possible"))).toContain(
        "mission_auto_incompatible",
      );
      expect(codes(withSelfReport("both"))).toContain(
        "mission_auto_incompatible",
      );
    });

    it("GM 필요 모드에서는 자가 보고 미션이 괜찮다", () => {
      expect(codes(withSelfReport("gm_required"))).not.toContain(
        "mission_auto_incompatible",
      );
    });
  });

  it("개인 미션에 대상 인물이 없으면 오류", () => {
    const b = validBundle();
    b.missions = [
      {
        ...createMission(),
        title: "미션",
        scope: "personal",
        characterId: null,
      },
    ];
    expect(codes(b)).toContain("mission_character");
  });

  describe("타임라인 정합성", () => {
    const entry = (characterId: string, time: string, place: string) => ({
      ...createTimelineEntry(),
      characterId,
      time,
      place,
    });

    it("같은 인물이 같은 시각에 두 장소에 있으면 경고", () => {
      const b = validBundle();
      const id = b.characters[0].id;
      b.scenario.timeline = [
        entry(id, "21:00", "서재"),
        entry(id, "21:00", "주방"),
      ];
      const issue = reviewScenario(b).find(
        (i) => i.code === "timeline_conflict",
      );
      expect(issue?.level).toBe("warning");
      expect(issue?.message).toContain("집사");
      expect(issue?.message).toContain("서재");
      expect(issue?.message).toContain("주방");
    });

    it("같은 장소이거나 시각이 다르면 경고하지 않는다", () => {
      const b = validBundle();
      const id = b.characters[0].id;
      b.scenario.timeline = [
        entry(id, "21:00", "서재"),
        entry(id, "21:00", "서재"),
        entry(id, "21:30", "주방"),
      ];
      expect(codes(b)).not.toContain("timeline_conflict");
    });

    it("다른 인물끼리는 충돌이 아니다", () => {
      const b = validBundle();
      b.scenario.timeline = [
        entry(b.characters[0].id, "21:00", "서재"),
        entry(b.characters[1].id, "21:00", "주방"),
      ];
      expect(codes(b)).not.toContain("timeline_conflict");
    });

    it("시각 형식이 HH:mm 이 아니면 경고", () => {
      const b = validBundle();
      b.scenario.timeline = [entry(b.characters[0].id, "9시", "서재")];
      expect(codes(b)).toContain("timeline_time_format");
    });
  });
});

describe("countIssues", () => {
  it("오류와 경고 수를 센다", () => {
    const b = createEmptyBundle();
    const { errors, warnings } = countIssues(reviewScenario(b));
    expect(errors).toBeGreaterThan(0);
    expect(warnings).toBeGreaterThan(0);
  });
});
