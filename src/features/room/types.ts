import { z } from "zod";

import { ROOM_STATUSES } from "@/lib/game/room-state";

/** get_room_overview RPC 응답. DB 가 돌려주는 값도 화면에 쓰기 전에 한 번 더 검증한다. */
const optionalText = z.string().nullish();

export const overviewSchema = z.object({
  serverNow: z.string(),
  isGm: z.boolean(),
  room: z.object({
    id: z.uuid(),
    code: z.string(),
    status: z.enum(ROOM_STATUSES),
    maxPlayers: z.number().int(),
    currentRoundIndex: z.number().int(),
    roundStartedAt: z.string().nullable(),
    timerEndsAt: z.string().nullable(),
    timerPausedRemaining: z.number().int().nullable(),
    endingStep: z.number().int().min(0).max(3),
    chatBlocked: z.boolean().default(false),
    whisperNotice: z.boolean().default(false),
  }),
  scenario: z.object({
    title: z.string().nullable(),
    genre: z.string().nullable(),
    estimatedMinutes: z.number().nullable(),
    victim: optionalText,
    incidentTime: optionalText,
    incidentPlace: optionalText,
    openingText: optionalText,
  }),
  characters: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      publicInfo: z.string(),
    }),
  ),
  rounds: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      goal: z.string(),
      timeLimitSeconds: z.number().int().nullable(),
      allowedActions: z.array(z.string()),
      /** 이미 시작한 라운드만 (GM 은 전부) */
      unlockContent: z.string().nullish(),
    }),
  ),
  /** GM 에게만: 종료할 때 고를 결말 */
  endings: z.array(z.object({ id: z.uuid(), name: z.string() })).optional(),
  /** GM 에게만 */
  assignments: z
    .array(z.object({ userId: z.uuid(), characterId: z.uuid() }))
    .optional(),
  /** GM 에게만: 승인을 기다리는 미션 보고 수 */
  missionReports: z.number().int().optional(),
  /** 게임이 시작된 뒤 참가자 본인에게만 */
  myCharacterId: z.uuid().nullish(),
});
export type RoomOverview = z.infer<typeof overviewSchema>;

export const playerSchema = z.object({
  user_id: z.uuid(),
  nickname: z.string(),
  ready: z.boolean(),
  muted: z.boolean(),
});
export type RoomPlayer = z.infer<typeof playerSchema>;

export const joinResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  roomId: z.uuid().optional(),
});

export const createRoomResultSchema = z.object({
  roomId: z.uuid(),
  code: z.string(),
});

/** 내 인물 카드 (본인 것만 내려온다) */
export const characterCardSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    publicInfo: z.string(),
    secretInfo: z.string(),
    background: z.string(),
    personalGoal: z.string(),
    roleType: z.string(),
    liePolicy: z.string(),
    lieNote: z.string(),
    relations: z.array(
      z.object({
        targetName: z.string().nullable(),
        description: z.string(),
      }),
    ),
    roundInfos: z.array(z.object({ roundName: z.string(), text: z.string() })),
  })
  .nullable();
export type CharacterCard = NonNullable<z.infer<typeof characterCardSchema>>;

export const clueSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  kind: z.string(),
  isPublic: z.boolean(),
  mine: z.boolean(),
  roundIndex: z.number().int(),
  holderName: z.string().nullable(),
  /** GM 에게만 */
  isTrue: z.boolean().optional(),
});
export type RoomClue = z.infer<typeof clueSchema>;

export const drawnClueSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  kind: z.string(),
});

export const messageSchema = z.object({
  id: z.number(),
  kind: z.enum(["chat", "system", "gm"]),
  channel: z.enum(["all", "whisper", "group"]),
  character_id: z.uuid().nullable(),
  /** 귓속말일 때 받는 인물 */
  target_character_id: z.uuid().nullable(),
  group_id: z.uuid().nullable(),
  body: z.string(),
  created_at: z.string(),
});
export type RoomMessage = z.infer<typeof messageSchema>;

export const groupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isSecret: z.boolean(),
  isMember: z.boolean(),
  isOwner: z.boolean(),
  /** 멤버 인물 ID */
  members: z.array(z.uuid()),
});
export type RoomGroup = z.infer<typeof groupSchema>;

export const MISSION_STATUSES = ["open", "reported", "done", "failed"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const myMissionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  scope: z.enum(["personal", "common"]),
  judgeType: z.enum(["auto", "self_report", "gm"]),
  status: z.enum(MISSION_STATUSES),
});
export type MyMission = z.infer<typeof myMissionSchema>;

export const gmMissionSchema = myMissionSchema.extend({
  hidden: z.boolean(),
  characterName: z.string().nullable(),
});
export type GmMission = z.infer<typeof gmMissionSchema>;

export const endingPreviewSchema = z.object({
  endingId: z.uuid().nullable(),
  endingName: z.string().nullable(),
  culpritCaught: z.boolean(),
});
export type EndingPreview = z.infer<typeof endingPreviewSchema>;

export const voteStatusSchema = z.object({
  total: z.number().int(),
  voted: z.number().int(),
  myVote: z.uuid().nullable(),
  /** GM 에게만: 아직 투표하지 않은 참가자 닉네임 */
  pending: z.array(z.string()).nullable(),
});
export type VoteStatus = z.infer<typeof voteStatusSchema>;

/** 결말은 GM 이 공개한 단계까지의 항목만 들어 있다. */
export const endingResultSchema = z.object({
  step: z.number().int(),
  tally: z
    .array(z.object({ name: z.string().nullable(), count: z.number() }))
    .optional(),
  ballots: z
    .array(
      z.object({ voter: z.string().nullable(), target: z.string().nullable() }),
    )
    .optional(),
  culprits: z.array(z.string()).optional(),
  culpritCaught: z.boolean().optional(),
  missions: z
    .array(
      z.object({
        title: z.string(),
        scope: z.enum(["personal", "common"]),
        character: z.string().nullable(),
        status: z.enum(MISSION_STATUSES),
      }),
    )
    .optional(),
  ending: z
    .object({
      name: z.string(),
      resultText: z.string(),
      truthText: z.string(),
    })
    .nullable()
    .optional(),
  epilogues: z
    .array(z.object({ name: z.string(), text: z.string() }))
    .optional(),
});
export type EndingResult = z.infer<typeof endingResultSchema>;
