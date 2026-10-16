import type {
  Character,
  Clue,
  Ending,
  Mission,
  Round,
  ScenarioBundle,
} from "@/lib/schemas/scenario";
import { BUNDLE_FORMAT_VERSION } from "@/lib/schemas/scenario";

/** 시나리오 번들을 다루는 순수 함수 모음 (UI·DB와 무관). */

const newId = () => crypto.randomUUID();

/** 새 시나리오에 기본으로 넣는 라운드 템플릿 (계획서 R2-B-5) */
const DEFAULT_ROUNDS: Omit<Round, "id">[] = [
  {
    name: "오프닝",
    goal: "사건의 개요를 듣는다.",
    timeLimitSeconds: null,
    allowedActions: [],
    unlockContent: "",
  },
  {
    name: "자기소개",
    goal: "각자 자신의 인물을 소개한다.",
    timeLimitSeconds: 120,
    allowedActions: ["chat"],
    unlockContent: "",
  },
  {
    name: "탐색",
    goal: "단서를 찾는다.",
    timeLimitSeconds: 600,
    allowedActions: ["chat", "draw_card"],
    unlockContent: "",
  },
  {
    name: "토론",
    goal: "의견을 나누고 용의자를 좁힌다.",
    timeLimitSeconds: 900,
    allowedActions: ["chat"],
    unlockContent: "",
  },
  {
    name: "심화",
    goal: "추가 단서를 바탕으로 추리를 심화한다.",
    timeLimitSeconds: 600,
    allowedActions: ["chat", "draw_card"],
    unlockContent: "",
  },
  {
    name: "투표",
    goal: "범인을 지목한다.",
    timeLimitSeconds: 180,
    allowedActions: ["vote"],
    unlockContent: "",
  },
  {
    name: "결말",
    goal: "진실이 공개된다.",
    timeLimitSeconds: null,
    allowedActions: [],
    unlockContent: "",
  },
];

export function createEmptyBundle(): ScenarioBundle {
  return {
    formatVersion: BUNDLE_FORMAT_VERSION,
    scenario: {
      title: "",
      genre: "",
      minPlayers: 4,
      maxPlayers: 6,
      estimatedMinutes: 120,
      difficulty: "normal",
      onlineSupported: true,
      offlineSupported: true,
      runMode: "gm_required",
      background: "",
      victim: "",
      incidentTime: "",
      incidentPlace: "",
      openingText: "",
      timeline: [],
    },
    characters: [],
    rounds: DEFAULT_ROUNDS.map((r) => ({ id: newId(), ...r })),
    clues: [],
    missions: [],
    endings: [],
  };
}

export function createCharacter(): Character {
  return {
    id: newId(),
    name: "",
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
}

export function createRound(): Round {
  return {
    id: newId(),
    name: "",
    goal: "",
    timeLimitSeconds: null,
    allowedActions: [],
    unlockContent: "",
  };
}

export function createClue(): Clue {
  return {
    id: newId(),
    title: "",
    body: "",
    kind: "evidence",
    acquireCondition: "",
    acquireRoundId: null,
    visibility: "acquirer",
    isTrue: true,
    linkedCharacterId: null,
  };
}

export function createMission(): Mission {
  return {
    id: newId(),
    title: "",
    description: "",
    scope: "personal",
    characterId: null,
    judgeType: "gm",
    hidden: false,
  };
}

export function createEnding(): Ending {
  return {
    id: newId(),
    name: "",
    conditionKind: "default",
    conditionMissionId: null,
    resultText: "",
    truthText: "",
    epilogues: {},
  };
}

export function createTimelineEntry() {
  return {
    id: newId(),
    time: "",
    characterId: null,
    place: "",
    description: "",
  };
}

function omitKey<V>(record: Record<string, V>, key: string): Record<string, V> {
  const { [key]: removed, ...rest } = record;
  void removed;
  return rest;
}

/** 인물을 지우고 이를 가리키던 참조(타임라인, 관계, 힌트, 미션, 후일담)를 정리한다. */
export function removeCharacter(
  bundle: ScenarioBundle,
  id: string,
): ScenarioBundle {
  return {
    ...bundle,
    scenario: {
      ...bundle.scenario,
      timeline: bundle.scenario.timeline.map((t) =>
        t.characterId === id ? { ...t, characterId: null } : t,
      ),
    },
    characters: bundle.characters
      .filter((c) => c.id !== id)
      .map((c) => ({
        ...c,
        relations: c.relations.filter((r) => r.targetId !== id),
      })),
    clues: bundle.clues.map((c) =>
      c.linkedCharacterId === id ? { ...c, linkedCharacterId: null } : c,
    ),
    missions: bundle.missions.map((m) =>
      m.characterId === id ? { ...m, characterId: null } : m,
    ),
    endings: bundle.endings.map((e) => ({
      ...e,
      epilogues: omitKey(e.epilogues, id),
    })),
  };
}

/** 라운드를 지우고 이를 가리키던 참조(힌트 획득 라운드, 인물별 라운드 정보)를 정리한다. */
export function removeRound(
  bundle: ScenarioBundle,
  id: string,
): ScenarioBundle {
  return {
    ...bundle,
    rounds: bundle.rounds.filter((r) => r.id !== id),
    characters: bundle.characters.map((c) => ({
      ...c,
      roundInfos: omitKey(c.roundInfos, id),
    })),
    clues: bundle.clues.map((c) =>
      c.acquireRoundId === id ? { ...c, acquireRoundId: null } : c,
    ),
  };
}

/** 미션을 지우고 이를 가리키던 결말 조건을 기본 결말로 되돌린다. */
export function removeMission(
  bundle: ScenarioBundle,
  id: string,
): ScenarioBundle {
  return {
    ...bundle,
    missions: bundle.missions.filter((m) => m.id !== id),
    endings: bundle.endings.map((e) =>
      e.conditionMissionId === id
        ? { ...e, conditionMissionId: null, conditionKind: "default" as const }
        : e,
    ),
  };
}

/**
 * 모든 id 를 새로 발급하고 참조를 새 id 로 바꾼다. 복제·가져오기에서 쓴다.
 * 번들 안에 존재하지 않는 대상을 가리키는 참조는 버린다.
 */
export function remapIds(bundle: ScenarioBundle): ScenarioBundle {
  const chars = new Map(bundle.characters.map((c) => [c.id, newId()]));
  const rounds = new Map(bundle.rounds.map((r) => [r.id, newId()]));
  const missions = new Map(bundle.missions.map((m) => [m.id, newId()]));

  const ref = (map: Map<string, string>, id: string | null) =>
    id ? (map.get(id) ?? null) : null;
  const remapRecord = (
    record: Record<string, string>,
    map: Map<string, string>,
  ) =>
    Object.fromEntries(
      Object.entries(record).flatMap(([k, v]) => {
        const next = map.get(k);
        return next ? [[next, v]] : [];
      }),
    );

  return {
    ...bundle,
    scenario: {
      ...bundle.scenario,
      timeline: bundle.scenario.timeline.map((t) => ({
        ...t,
        id: newId(),
        characterId: ref(chars, t.characterId),
      })),
    },
    characters: bundle.characters.map((c) => ({
      ...c,
      id: chars.get(c.id)!,
      relations: c.relations.flatMap((r) => {
        const targetId = chars.get(r.targetId);
        return targetId ? [{ ...r, targetId }] : [];
      }),
      roundInfos: remapRecord(c.roundInfos, rounds),
    })),
    rounds: bundle.rounds.map((r) => ({ ...r, id: rounds.get(r.id)! })),
    clues: bundle.clues.map((c) => ({
      ...c,
      id: newId(),
      acquireRoundId: ref(rounds, c.acquireRoundId),
      linkedCharacterId: ref(chars, c.linkedCharacterId),
    })),
    missions: bundle.missions.map((m) => ({
      ...m,
      id: missions.get(m.id)!,
      characterId: ref(chars, m.characterId),
    })),
    endings: bundle.endings.map((e) => ({
      ...e,
      id: newId(),
      conditionMissionId: ref(missions, e.conditionMissionId),
      epilogues: remapRecord(e.epilogues, chars),
    })),
  };
}

/** 본인 폴더(`{userId}/`)가 아닌 이미지 경로는 가져올 수 없으므로 비운다. */
export function sanitizeImagePaths(
  bundle: ScenarioBundle,
  userId: string,
): ScenarioBundle {
  const prefix = `${userId}/`;
  return {
    ...bundle,
    characters: bundle.characters.map((c) =>
      c.imagePath && !c.imagePath.startsWith(prefix)
        ? { ...c, imagePath: null }
        : c,
    ),
  };
}
