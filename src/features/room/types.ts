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
    }),
  ),
  /** GM 에게만 */
  assignments: z
    .array(z.object({ userId: z.uuid(), characterId: z.uuid() }))
    .optional(),
  /** 게임이 시작된 뒤 참가자 본인에게만 */
  myCharacterId: z.uuid().nullish(),
});
export type RoomOverview = z.infer<typeof overviewSchema>;

export const playerSchema = z.object({
  user_id: z.uuid(),
  nickname: z.string(),
  ready: z.boolean(),
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
