import { z } from "zod";

/**
 * 시나리오 제작 데이터의 Zod 스키마 (클라이언트·서버 공통).
 * 여기의 길이/범위 제한은 DB 체크 제약과 같게 유지한다.
 * "저장용" 스키마는 작성 중인 미완성 값도 허용하고, 발행 가능 여부는 review.ts 의 규칙으로 따로 검사한다.
 */

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export const RUN_MODES = ["gm_required", "auto_possible", "both"] as const;
export const ROLE_TYPES = [
  "culprit",
  "accomplice",
  "suspect",
  "witness",
] as const;
export const LIE_POLICIES = ["none", "partial", "free"] as const;
export const ALLOWED_ACTIONS = [
  "chat",
  "whisper",
  "draw_card",
  "vote",
] as const;
export const CLUE_KINDS = [
  "evidence",
  "testimony",
  "document",
  "other",
] as const;
export const CLUE_VISIBILITIES = ["acquirer", "everyone"] as const;
export const MISSION_SCOPES = ["personal", "common"] as const;
export const JUDGE_TYPES = ["auto", "self_report", "gm"] as const;
export const ENDING_CONDITIONS = [
  "default",
  "culprit_caught",
  "culprit_escaped",
  "mission_done",
  "mission_failed",
] as const;
export const VISIBILITIES = ["private", "public"] as const;

export const LABELS = {
  difficulty: { easy: "쉬움", normal: "보통", hard: "어려움" },
  runMode: {
    gm_required: "GM 필요",
    auto_possible: "자동 진행 가능",
    both: "둘 다 가능",
  },
  roleType: {
    culprit: "범인",
    accomplice: "공범",
    suspect: "용의자",
    witness: "목격자",
  },
  liePolicy: {
    none: "거짓말 금지",
    partial: "일부 허용",
    free: "자유롭게 허용",
  },
  allowedAction: {
    chat: "전체 대화",
    whisper: "귓속말",
    draw_card: "카드 뽑기",
    vote: "투표",
  },
  clueKind: {
    evidence: "물증",
    testimony: "증언",
    document: "문서",
    other: "기타",
  },
  clueVisibility: { acquirer: "획득한 사람만", everyone: "전체 공개" },
  missionScope: { personal: "개인 미션", common: "공통 미션" },
  judgeType: { auto: "자동 판정", self_report: "자가 보고", gm: "GM 판정" },
  endingCondition: {
    default: "기본 결말",
    culprit_caught: "범인을 잡았을 때",
    culprit_escaped: "범인을 놓쳤을 때",
    mission_done: "미션 달성 시",
    mission_failed: "미션 실패 시",
  },
  visibility: {
    private: "비공개 (내가 연 방에 초대된 사람만)",
    public: "공개",
  },
} as const;

const uuid = z.uuid();
const text = (max: number) => z.string().max(max);

// ---------------------------------------------------------------------------
// 시나리오 본문 (1·2단계) + 타임라인 (4단계)
// ---------------------------------------------------------------------------
export const basicSchema = z
  .object({
    title: text(100),
    genre: text(50),
    minPlayers: z.number().int().min(1).max(20),
    maxPlayers: z.number().int().min(1).max(20),
    estimatedMinutes: z.number().int().min(5).max(1440),
    difficulty: z.enum(DIFFICULTIES),
    onlineSupported: z.boolean(),
    offlineSupported: z.boolean(),
    runMode: z.enum(RUN_MODES),
  })
  .refine((v) => v.minPlayers <= v.maxPlayers, {
    message: "최소 인원은 최대 인원보다 클 수 없습니다.",
    path: ["minPlayers"],
  });

export const worldSchema = z.object({
  background: text(10000),
  victim: text(500),
  incidentTime: text(100),
  incidentPlace: text(200),
  openingText: text(10000),
});

export const timelineEntrySchema = z.object({
  id: uuid,
  /** HH:mm (검수 단계에서 형식을 확인한다) */
  time: text(20),
  characterId: uuid.nullable(),
  place: text(100),
  description: text(1000),
});
export const timelineSchema = z.array(timelineEntrySchema).max(200);

// ---------------------------------------------------------------------------
// 목록형 항목 (3·5·6·7·8단계)
// ---------------------------------------------------------------------------
export const characterSchema = z.object({
  id: uuid,
  name: text(50),
  publicInfo: text(5000),
  secretInfo: text(10000),
  background: text(10000),
  relations: z
    .array(z.object({ targetId: uuid, description: text(500) }))
    .max(30),
  roleType: z.enum(ROLE_TYPES),
  personalGoal: text(2000),
  liePolicy: z.enum(LIE_POLICIES),
  lieNote: text(2000),
  roundInfos: z.record(uuid, text(5000)),
  imagePath: text(300).nullable(),
});

export const roundSchema = z.object({
  id: uuid,
  name: text(50),
  goal: text(2000),
  /** null 이면 시간 제한 없음 */
  timeLimitSeconds: z.number().int().min(0).max(86400).nullable(),
  allowedActions: z.array(z.enum(ALLOWED_ACTIONS)).max(ALLOWED_ACTIONS.length),
  unlockContent: text(5000),
});

export const clueSchema = z.object({
  id: uuid,
  title: text(100),
  body: text(5000),
  kind: z.enum(CLUE_KINDS),
  acquireCondition: text(1000),
  acquireRoundId: uuid.nullable(),
  visibility: z.enum(CLUE_VISIBILITIES),
  isTrue: z.boolean(),
  linkedCharacterId: uuid.nullable(),
});

export const missionSchema = z.object({
  id: uuid,
  title: text(100),
  description: text(2000),
  scope: z.enum(MISSION_SCOPES),
  characterId: uuid.nullable(),
  judgeType: z.enum(JUDGE_TYPES),
  hidden: z.boolean(),
});

export const endingSchema = z.object({
  id: uuid,
  name: text(100),
  conditionKind: z.enum(ENDING_CONDITIONS),
  conditionMissionId: uuid.nullable(),
  resultText: text(10000),
  truthText: text(10000),
  epilogues: z.record(uuid, text(5000)),
});

export const LIST_LIMITS = {
  characters: 30,
  rounds: 30,
  clues: 200,
  missions: 100,
  endings: 20,
} as const;

// ---------------------------------------------------------------------------
// 번들: 내보내기 / 가져오기 / 발행 스냅샷이 모두 같은 형식을 쓴다.
// ---------------------------------------------------------------------------
export const BUNDLE_FORMAT_VERSION = 1;

export const bundleSchema = z.object({
  formatVersion: z.literal(BUNDLE_FORMAT_VERSION),
  scenario: z.object({
    ...basicSchema.shape,
    ...worldSchema.shape,
    timeline: timelineSchema,
  }),
  characters: z.array(characterSchema).max(LIST_LIMITS.characters),
  rounds: z.array(roundSchema).max(LIST_LIMITS.rounds),
  clues: z.array(clueSchema).max(LIST_LIMITS.clues),
  missions: z.array(missionSchema).max(LIST_LIMITS.missions),
  endings: z.array(endingSchema).max(LIST_LIMITS.endings),
});

export type Basic = z.infer<typeof basicSchema>;
export type World = z.infer<typeof worldSchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type Character = z.infer<typeof characterSchema>;
export type Round = z.infer<typeof roundSchema>;
export type Clue = z.infer<typeof clueSchema>;
export type Mission = z.infer<typeof missionSchema>;
export type Ending = z.infer<typeof endingSchema>;
export type ScenarioBundle = z.infer<typeof bundleSchema>;
export type Visibility = (typeof VISIBILITIES)[number];

// ---------------------------------------------------------------------------
// 저장 단위 (자동 임시저장은 이 단위로 서버에 보낸다)
// ---------------------------------------------------------------------------
export const SECTIONS = [
  "basic",
  "world",
  "timeline",
  "rounds",
  "characters",
  "clues",
  "missions",
  "endings",
] as const;
export type Section = (typeof SECTIONS)[number];

/** 마법사 화면 순서 (계획서 R2-B 의 1~8단계) */
export const STEPS = [
  { key: "basic", label: "기본 정보" },
  { key: "world", label: "세계관·사건" },
  { key: "characters", label: "인물" },
  { key: "timeline", label: "진실 타임라인" },
  { key: "rounds", label: "라운드" },
  { key: "clues", label: "힌트카드" },
  { key: "missions", label: "미션" },
  { key: "endings", label: "결말" },
] as const satisfies readonly { key: Section; label: string }[];

export function validateSection(
  section: Section,
  value: unknown,
): { ok: true; data: unknown } | { ok: false; error: string } {
  const schema = SECTION_SCHEMAS[section];
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  const first = r.error.issues[0];
  const where = first.path.length > 0 ? ` (${first.path.join(".")})` : "";
  return { ok: false, error: `${first.message}${where}` };
}

export const SECTION_SCHEMAS: Record<Section, z.ZodType> = {
  basic: basicSchema,
  world: worldSchema,
  timeline: timelineSchema,
  rounds: z.array(roundSchema).max(LIST_LIMITS.rounds),
  characters: z.array(characterSchema).max(LIST_LIMITS.characters),
  clues: z.array(clueSchema).max(LIST_LIMITS.clues),
  missions: z.array(missionSchema).max(LIST_LIMITS.missions),
  endings: z.array(endingSchema).max(LIST_LIMITS.endings),
};
