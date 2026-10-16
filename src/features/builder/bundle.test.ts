import { describe, expect, it } from "vitest";

import { bundleSchema, type ScenarioBundle } from "@/lib/schemas/scenario";

import {
  createCharacter,
  createClue,
  createEmptyBundle,
  createEnding,
  createMission,
  createTimelineEntry,
  remapIds,
  removeCharacter,
  removeMission,
  removeRound,
  sanitizeImagePaths,
} from "./bundle";

function sampleBundle(): ScenarioBundle {
  const b = createEmptyBundle();
  const c1 = {
    ...createCharacter(),
    name: "집사",
    roleType: "culprit" as const,
  };
  const c2 = { ...createCharacter(), name: "의사" };
  c1.relations = [{ targetId: c2.id, description: "오랜 친구" }];
  c1.roundInfos = { [b.rounds[2].id]: "탐색 라운드 정보" };
  const mission = {
    ...createMission(),
    title: "진실을 밝혀라",
    characterId: c2.id,
  };
  const clue = {
    ...createClue(),
    title: "칼",
    acquireRoundId: b.rounds[2].id,
    linkedCharacterId: c1.id,
  };
  const ending = {
    ...createEnding(),
    name: "해피",
    conditionKind: "mission_done" as const,
    conditionMissionId: mission.id,
    epilogues: { [c1.id]: "체포되었다", [c2.id]: "은퇴했다" },
  };
  return {
    ...b,
    scenario: {
      ...b.scenario,
      title: "저택 살인 사건",
      timeline: [
        {
          ...createTimelineEntry(),
          time: "21:00",
          characterId: c1.id,
          place: "서재",
        },
      ],
    },
    characters: [c1, c2],
    clues: [clue],
    missions: [mission],
    endings: [ending],
  };
}

describe("createEmptyBundle", () => {
  it("스키마를 통과하고 기본 라운드 템플릿 7개를 가진다", () => {
    const b = createEmptyBundle();
    expect(bundleSchema.safeParse(b).success).toBe(true);
    expect(b.rounds.map((r) => r.name)).toEqual([
      "오프닝",
      "자기소개",
      "탐색",
      "토론",
      "심화",
      "투표",
      "결말",
    ]);
  });

  it("호출할 때마다 새 id 를 만든다", () => {
    expect(createEmptyBundle().rounds[0].id).not.toBe(
      createEmptyBundle().rounds[0].id,
    );
  });
});

describe("remapIds", () => {
  it("모든 id 를 새로 발급하고 결과가 스키마를 통과한다", () => {
    const original = sampleBundle();
    const next = remapIds(original);
    expect(bundleSchema.safeParse(next).success).toBe(true);

    const oldIds = new Set([
      ...original.characters.map((c) => c.id),
      ...original.rounds.map((r) => r.id),
      ...original.clues.map((c) => c.id),
      ...original.missions.map((m) => m.id),
      ...original.endings.map((e) => e.id),
      ...original.scenario.timeline.map((t) => t.id),
    ]);
    const newIds = [
      ...next.characters.map((c) => c.id),
      ...next.rounds.map((r) => r.id),
      ...next.clues.map((c) => c.id),
      ...next.missions.map((m) => m.id),
      ...next.endings.map((e) => e.id),
      ...next.scenario.timeline.map((t) => t.id),
    ];
    for (const id of newIds) expect(oldIds.has(id)).toBe(false);
    expect(new Set(newIds).size).toBe(newIds.length);
  });

  it("참조를 새 id 로 일관되게 바꾼다", () => {
    const next = remapIds(sampleBundle());
    const [c1, c2] = next.characters;
    expect(c1.relations[0].targetId).toBe(c2.id);
    expect(Object.keys(c1.roundInfos)).toEqual([next.rounds[2].id]);
    expect(next.clues[0].acquireRoundId).toBe(next.rounds[2].id);
    expect(next.clues[0].linkedCharacterId).toBe(c1.id);
    expect(next.missions[0].characterId).toBe(c2.id);
    expect(next.endings[0].conditionMissionId).toBe(next.missions[0].id);
    expect(Object.keys(next.endings[0].epilogues).sort()).toEqual(
      [c1.id, c2.id].sort(),
    );
    expect(next.scenario.timeline[0].characterId).toBe(c1.id);
  });

  it("번들에 없는 대상을 가리키는 참조는 버린다", () => {
    const b = sampleBundle();
    const ghost = crypto.randomUUID();
    b.clues[0].linkedCharacterId = ghost;
    b.characters[0].relations.push({ targetId: ghost, description: "유령" });
    b.endings[0].epilogues[ghost] = "없는 인물";
    const next = remapIds(b);
    expect(next.clues[0].linkedCharacterId).toBeNull();
    expect(next.characters[0].relations).toHaveLength(1);
    expect(Object.keys(next.endings[0].epilogues)).toHaveLength(2);
  });

  it("원본 번들을 바꾸지 않는다", () => {
    const b = sampleBundle();
    const snapshot = JSON.stringify(b);
    remapIds(b);
    expect(JSON.stringify(b)).toBe(snapshot);
  });
});

describe("removeCharacter / removeRound / removeMission", () => {
  it("인물을 지우면 참조가 정리된다", () => {
    const b = sampleBundle();
    const [c1, c2] = b.characters;
    const next = removeCharacter(b, c1.id);
    expect(next.characters.map((c) => c.id)).toEqual([c2.id]);
    expect(next.clues[0].linkedCharacterId).toBeNull();
    expect(next.scenario.timeline[0].characterId).toBeNull();
    expect(Object.keys(next.endings[0].epilogues)).toEqual([c2.id]);
    const next2 = removeCharacter(b, c2.id);
    expect(next2.characters[0].relations).toEqual([]);
    expect(next2.missions[0].characterId).toBeNull();
  });

  it("라운드를 지우면 힌트의 획득 라운드와 인물별 라운드 정보가 정리된다", () => {
    const b = sampleBundle();
    const next = removeRound(b, b.rounds[2].id);
    expect(next.rounds).toHaveLength(6);
    expect(next.clues[0].acquireRoundId).toBeNull();
    expect(next.characters[0].roundInfos).toEqual({});
  });

  it("미션을 지우면 그 미션을 조건으로 쓰던 결말은 기본 결말로 돌아간다", () => {
    const b = sampleBundle();
    const next = removeMission(b, b.missions[0].id);
    expect(next.missions).toHaveLength(0);
    expect(next.endings[0].conditionKind).toBe("default");
    expect(next.endings[0].conditionMissionId).toBeNull();
  });
});

describe("sanitizeImagePaths", () => {
  it("본인 폴더가 아닌 이미지 경로는 비운다", () => {
    const b = sampleBundle();
    b.characters[0].imagePath = "me/s1/a.webp";
    b.characters[1].imagePath = "other/s1/b.webp";
    const next = sanitizeImagePaths(b, "me");
    expect(next.characters[0].imagePath).toBe("me/s1/a.webp");
    expect(next.characters[1].imagePath).toBeNull();
  });

  it("사용자 id 가 접두사만 겹치는 경로는 허용하지 않는다", () => {
    const b = sampleBundle();
    b.characters[0].imagePath = "me2/s1/a.webp";
    expect(sanitizeImagePaths(b, "me").characters[0].imagePath).toBeNull();
  });
});
