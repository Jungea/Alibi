import {
  createCharacter,
  createClue,
  createEmptyBundle,
  createEnding,
  createTimelineEntry,
} from "../../src/features/builder/bundle";
import type { ScenarioBundle } from "../../src/lib/schemas/scenario";

/** E2E 에서 가져오기 → 발행 → 방 만들기에 쓰는 3인용 시나리오. 검수 오류가 없어야 한다. */
export function buildE2eScenario(): ScenarioBundle {
  const b = createEmptyBundle();
  b.scenario.title = "E2E 저택 살인사건";
  b.scenario.genre = "추리";
  b.scenario.minPlayers = 3;
  b.scenario.maxPlayers = 3;
  b.scenario.victim = "저택 주인";
  b.scenario.incidentTime = "23:00";
  b.scenario.incidentPlace = "서재";
  b.scenario.background = "폭풍우가 치는 밤, 저택에서 사건이 일어났다.";
  b.scenario.openingText = "E2E 오프닝: 저택 주인이 서재에서 발견되었다.";

  const butler = createCharacter();
  Object.assign(butler, {
    name: "집사",
    publicInfo: "오래 일한 집사",
    secretInfo: "E2E-SECRET-집사",
    roleType: "suspect",
    personalGoal: "의심을 피한다",
  });
  const gardener = createCharacter();
  Object.assign(gardener, {
    name: "정원사",
    publicInfo: "정원을 가꾼다",
    secretInfo: "E2E-SECRET-정원사",
    roleType: "culprit",
    personalGoal: "정체를 숨긴다",
  });
  const maid = createCharacter();
  Object.assign(maid, {
    name: "하녀",
    publicInfo: "새로 온 하녀",
    secretInfo: "E2E-SECRET-하녀",
    roleType: "witness",
    personalGoal: "본 것을 알린다",
  });
  b.characters = [butler, gardener, maid];

  const entry = createTimelineEntry();
  Object.assign(entry, {
    time: "23:00",
    characterId: gardener.id,
    place: "서재",
    description: "정원사가 서재에 들어갔다.",
  });
  b.scenario.timeline = [entry];

  // 라운드: 오프닝 / 자기소개 / 탐색(채팅·카드) / 토론 / 심화 / 투표 / 결말 (기본 템플릿 그대로)
  const clue1 = createClue();
  Object.assign(clue1, {
    title: "E2E 공개 단서",
    body: "E2E-PUBLIC-BODY",
    visibility: "everyone",
  });
  const clue2 = createClue();
  Object.assign(clue2, {
    title: "E2E 비밀 단서",
    body: "E2E-PRIVATE-BODY",
    visibility: "acquirer",
  });
  b.clues = [clue1, clue2];

  const ending = createEnding();
  Object.assign(ending, {
    name: "진실 결말",
    resultText: "E2E 결과 텍스트",
    truthText: "E2E-TRUTH 범인은 정원사였다.",
    epilogues: { [butler.id]: "E2E 후일담 집사" },
  });
  b.endings = [ending];
  return b;
}
