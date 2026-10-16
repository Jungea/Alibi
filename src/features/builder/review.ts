import type { ScenarioBundle, Section } from "@/lib/schemas/scenario";

/**
 * 발행 전 검수 규칙. 순수 함수이며 UI(마법사 배지, 발행 화면)와 서버(발행 차단)가 같은 규칙을 쓴다.
 * error 가 하나라도 있으면 발행할 수 없고, warning 은 확인만 요청한다.
 */

export type IssueLevel = "error" | "warning";

export interface Issue {
  level: IssueLevel;
  step: Section;
  code: string;
  message: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function reviewScenario(bundle: ScenarioBundle): Issue[] {
  const issues: Issue[] = [];
  const add = (
    level: IssueLevel,
    step: Section,
    code: string,
    message: string,
  ) => issues.push({ level, step, code, message });

  const { scenario: s, characters, rounds, clues, missions, endings } = bundle;
  const label = (name: string, i: number, fallback: string) =>
    name.trim() || `${fallback} ${i + 1}`;

  // --- 기본 정보 ---
  if (!s.title.trim())
    add("error", "basic", "title_missing", "시나리오 제목을 입력해 주세요.");
  if (!s.onlineSupported && !s.offlineSupported) {
    add(
      "error",
      "basic",
      "no_play_mode",
      "온라인/오프라인 중 하나 이상을 지원해야 합니다.",
    );
  }
  if (s.minPlayers > s.maxPlayers) {
    add("error", "basic", "players_range", "최소 인원이 최대 인원보다 큽니다.");
  }

  // --- 인물 ---
  const culprits = characters.filter((c) => c.roleType === "culprit");
  if (culprits.length === 0)
    add(
      "error",
      "characters",
      "culprit_missing",
      "범인이 지정되지 않았습니다.",
    );
  if (culprits.length > 1) {
    add(
      "warning",
      "characters",
      "culprit_multiple",
      `범인이 ${culprits.length}명으로 지정되어 있습니다. 의도한 것인지 확인해 주세요.`,
    );
  }
  if (characters.length < s.minPlayers) {
    add(
      "error",
      "characters",
      "characters_lack",
      `인물이 ${characters.length}명이라 최소 인원(${s.minPlayers}명)을 채울 수 없습니다.`,
    );
  } else if (characters.length < s.maxPlayers) {
    add(
      "warning",
      "characters",
      "characters_lack_max",
      `인물이 ${characters.length}명이라 최대 인원(${s.maxPlayers}명)으로는 진행할 수 없습니다.`,
    );
  }
  characters.forEach((c, i) => {
    const name = label(c.name, i, "인물");
    if (!c.name.trim())
      add(
        "error",
        "characters",
        "character_name",
        `${name}: 이름을 입력해 주세요.`,
      );
    if (!c.publicInfo.trim())
      add(
        "warning",
        "characters",
        "character_public",
        `${name}: 공개 정보가 비어 있습니다.`,
      );
    if (!c.secretInfo.trim())
      add(
        "warning",
        "characters",
        "character_secret",
        `${name}: 비밀 정보가 비어 있습니다.`,
      );
  });

  // --- 타임라인 ---
  s.timeline.forEach((t, i) => {
    if (t.time && !TIME_RE.test(t.time)) {
      add(
        "warning",
        "timeline",
        "timeline_time_format",
        `타임라인 ${i + 1}번: 시각은 HH:mm 형식으로 입력해 주세요. (예: 21:30)`,
      );
    }
  });
  const byKey = new Map<string, Map<string, string>>(); // `${characterId}|${time}` → 장소 →
  for (const t of s.timeline) {
    if (!t.characterId || !TIME_RE.test(t.time) || !t.place.trim()) continue;
    const key = `${t.characterId}|${t.time}`;
    const places = byKey.get(key) ?? new Map<string, string>();
    places.set(t.place.trim(), t.place.trim());
    byKey.set(key, places);
  }
  for (const [key, places] of byKey) {
    if (places.size < 2) continue;
    const [characterId, time] = key.split("|");
    const idx = characters.findIndex((c) => c.id === characterId);
    const name =
      idx >= 0 ? label(characters[idx].name, idx, "인물") : "알 수 없는 인물";
    add(
      "warning",
      "timeline",
      "timeline_conflict",
      `${name}: ${time}에 ${[...places.keys()].join(", ")} 두 곳에 있는 것으로 되어 있습니다.`,
    );
  }

  // --- 라운드 ---
  if (rounds.length === 0)
    add("error", "rounds", "rounds_missing", "라운드가 하나도 없습니다.");
  rounds.forEach((r, i) => {
    if (!r.name.trim())
      add(
        "error",
        "rounds",
        "round_name",
        `라운드 ${i + 1}: 이름을 입력해 주세요.`,
      );
  });

  // --- 힌트카드 ---
  if (clues.length === 0)
    add("warning", "clues", "clues_missing", "힌트카드가 하나도 없습니다.");
  clues.forEach((c, i) => {
    if (!c.title.trim())
      add(
        "error",
        "clues",
        "clue_title",
        `힌트카드 ${i + 1}: 제목을 입력해 주세요.`,
      );
  });

  // --- 미션 ---
  const autoCapable = s.runMode !== "gm_required";
  missions.forEach((m, i) => {
    const name = label(m.title, i, "미션");
    if (!m.title.trim())
      add(
        "error",
        "missions",
        "mission_title",
        `미션 ${i + 1}: 제목을 입력해 주세요.`,
      );
    if (m.scope === "personal" && !m.characterId) {
      add(
        "error",
        "missions",
        "mission_character",
        `${name}: 개인 미션은 대상 인물을 지정해야 합니다.`,
      );
    }
    if (autoCapable && m.judgeType === "self_report") {
      add(
        "error",
        "missions",
        "mission_auto_incompatible",
        `${name}: 자가 보고 미션은 자동 진행과 호환되지 않습니다. 판정 방식을 바꾸거나 진행 방식을 'GM 필요'로 바꿔 주세요.`,
      );
    }
  });

  // --- 결말 ---
  if (endings.length === 0)
    add("error", "endings", "endings_missing", "결말이 하나도 없습니다.");
  else if (!endings.some((e) => e.conditionKind === "default")) {
    add(
      "warning",
      "endings",
      "ending_default_missing",
      "어떤 조건에도 해당하지 않을 때 보여줄 '기본 결말'이 없습니다.",
    );
  }
  endings.forEach((e, i) => {
    const name = label(e.name, i, "결말");
    if (!e.name.trim())
      add(
        "error",
        "endings",
        "ending_name",
        `결말 ${i + 1}: 이름을 입력해 주세요.`,
      );
    if (
      (e.conditionKind === "mission_done" ||
        e.conditionKind === "mission_failed") &&
      !e.conditionMissionId
    ) {
      add(
        "error",
        "endings",
        "ending_mission",
        `${name}: 조건에 쓸 미션을 지정해 주세요.`,
      );
    }
    if (!e.truthText.trim())
      add(
        "warning",
        "endings",
        "ending_truth",
        `${name}: 진실 공개 텍스트가 비어 있습니다.`,
      );
  });

  return issues;
}

export function countIssues(issues: Issue[]) {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
  };
}
