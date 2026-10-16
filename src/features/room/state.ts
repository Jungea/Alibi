import type { SupabaseClient } from "@supabase/supabase-js";

import { roomErrorMessage } from "./errors";
import { parseNotes, type Notes } from "@/lib/game/notes";
import { bundleSchema, type ScenarioBundle } from "@/lib/schemas/scenario";

import {
  characterCardSchema,
  clueSchema,
  drawnClueSchema,
  endingPreviewSchema,
  endingResultSchema,
  gmMissionSchema,
  groupSchema,
  messageSchema,
  myMissionSchema,
  overviewSchema,
  playerSchema,
  tableViewSchema,
  voteStatusSchema,
  type CharacterCard,
  type EndingPreview,
  type EndingResult,
  type GmMission,
  type MyMission,
  type RoomClue,
  type RoomGroup,
  type RoomMessage,
  type RoomOverview,
  type RoomPlayer,
  type TableView,
  type VoteStatus,
} from "./types";

/** 서버·브라우저 어디서든 같은 방식으로 방 상태를 읽는다. 항상 호출자의 세션(RLS)으로 요청한다. */

export type RoomState = { overview: RoomOverview; players: RoomPlayer[] };
export type RoomStateResult =
  ({ ok: true } & RoomState) | { ok: false; error: string; forbidden: boolean };

export async function fetchRoomState(
  supabase: SupabaseClient,
  roomId: string,
): Promise<RoomStateResult> {
  const [overviewRes, playersRes] = await Promise.all([
    supabase.rpc("get_room_overview", { p_room: roomId }),
    supabase
      .from("room_players")
      .select("user_id, nickname, ready, muted")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true }),
  ]);

  if (overviewRes.error) {
    return {
      ok: false,
      error: roomErrorMessage(overviewRes.error.message),
      forbidden: /forbidden|42501/.test(
        `${overviewRes.error.message} ${overviewRes.error.code ?? ""}`,
      ),
    };
  }
  const overview = overviewSchema.safeParse(overviewRes.data);
  const players = playerSchema.array().safeParse(playersRes.data ?? []);
  if (!overview.success || !players.success || playersRes.error) {
    return { ok: false, error: roomErrorMessage(null), forbidden: false };
  }
  return { ok: true, overview: overview.data, players: players.data };
}

type Commands = {
  set_ready: { p_room: string; p_ready: boolean };
  leave_room: { p_room: string };
  kick_player: { p_room: string; p_user: string };
  assign_characters: { p_room: string };
  set_player_character: {
    p_room: string;
    p_user: string;
    p_character: string | null;
  };
  start_game: { p_room: string; p_force: boolean };
  start_round: { p_room: string };
  end_round: { p_room: string };
  start_vote: { p_room: string };
  finish_game: { p_room: string; p_ending_id?: string | null };
  advance_ending: { p_room: string };
  send_message: {
    p_room: string;
    p_body: string;
    p_channel?: "all" | "whisper" | "group";
    p_target?: string | null;
    p_group?: string | null;
  };
  set_room_mode: {
    p_room: string;
    p_mode: "chat" | "face";
    p_voice_link: string | null;
  };
  set_chat_blocked: { p_room: string; p_blocked: boolean };
  set_whisper_notice: { p_room: string; p_on: boolean };
  set_muted: { p_room: string; p_user: string; p_muted: boolean };
  create_group: {
    p_room: string;
    p_name: string;
    p_secret: boolean;
    p_characters: string[];
  };
  join_group: { p_group: string };
  leave_group: { p_group: string };
  add_group_member: { p_group: string; p_character: string };
  remove_group_member: { p_group: string; p_character: string };
  report_mission: { p_room: string; p_mission: string };
  set_mission_status: {
    p_room: string;
    p_mission: string;
    p_status: "open" | "done" | "failed";
  };
  cast_vote: { p_room: string; p_target: string };
  set_timer_paused: { p_room: string; p_paused: boolean };
  extend_timer: { p_room: string; p_seconds: number };
};
export type RoomCommandName = keyof Commands;

/** 상태를 바꾸는 RPC 호출. 권한·단계 검사는 DB 가 하고, 여기서는 오류 문구만 바꾼다. */
export async function runRoomCommand<K extends RoomCommandName>(
  supabase: SupabaseClient,
  fn: K,
  args: Commands[K],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc(fn, args);
  return error
    ? { ok: false, error: roomErrorMessage(error.message) }
    : { ok: true };
}

// ---------------------------------------------------------------------------
// 플레이 화면용 조회. 응답은 모두 Zod 로 한 번 더 검증한다.
// ---------------------------------------------------------------------------
export type Fetched<T> = { ok: true; data: T } | { ok: false; error: string };

async function rpcParsed<T>(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  parse: (data: unknown) => { success: true; data: T } | { success: false },
): Promise<Fetched<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: roomErrorMessage(error.message) };
  const parsed = parse(data);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: roomErrorMessage(null) };
}

export const fetchMyCharacter = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<CharacterCard | null>> =>
  rpcParsed(sb, "get_my_character", { p_room: room }, (d) =>
    characterCardSchema.safeParse(d),
  );

export const fetchClues = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<RoomClue[]>> =>
  rpcParsed(sb, "get_my_clues", { p_room: room }, (d) =>
    clueSchema.array().safeParse(d),
  );

export const fetchVoteStatus = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<VoteStatus>> =>
  rpcParsed(sb, "get_vote_status", { p_room: room }, (d) =>
    voteStatusSchema.safeParse(d),
  );

export const fetchEnding = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<EndingResult>> =>
  rpcParsed(sb, "get_ending", { p_room: room }, (d) =>
    endingResultSchema.safeParse(d),
  );

export const fetchGmGuide = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<ScenarioBundle>> =>
  rpcParsed(sb, "get_gm_guide", { p_room: room }, (d) =>
    bundleSchema.safeParse(d),
  );

export const fetchTableView = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<TableView>> =>
  rpcParsed(sb, "get_table_view", { p_room: room }, (d) =>
    tableViewSchema.safeParse(d),
  );

/** 내 추리노트. 서버에는 본인 것만 있고, 없거나 깨져 있으면 빈 노트로 시작한다. */
export async function fetchMyNotes(
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<Notes>> {
  const { data, error } = await sb.rpc("get_my_notes", { p_room: room });
  if (error) return { ok: false, error: roomErrorMessage(error.message) };
  return { ok: true, data: parseNotes(data) };
}

export async function saveMyNotes(
  sb: SupabaseClient,
  room: string,
  notes: Notes,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.rpc("save_my_notes", {
    p_room: room,
    p_data: notes,
  });
  return error
    ? { ok: false, error: roomErrorMessage(error.message) }
    : { ok: true };
}

export const fetchGroups = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<RoomGroup[]>> =>
  rpcParsed(sb, "get_groups", { p_room: room }, (d) =>
    groupSchema.array().safeParse(d),
  );

export const fetchMyMissions = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<MyMission[]>> =>
  rpcParsed(sb, "get_my_missions", { p_room: room }, (d) =>
    myMissionSchema.array().safeParse(d),
  );

export const fetchGmMissions = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<GmMission[]>> =>
  rpcParsed(sb, "get_gm_missions", { p_room: room }, (d) =>
    gmMissionSchema.array().safeParse(d),
  );

export const fetchEndingPreview = (
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<EndingPreview>> =>
  rpcParsed(sb, "preview_ending", { p_room: room }, (d) =>
    endingPreviewSchema.safeParse(d),
  );

export async function drawCard(
  sb: SupabaseClient,
  room: string,
): Promise<Fetched<{ id: string; title: string; body: string; kind: string }>> {
  return rpcParsed(sb, "draw_card", { p_room: room }, (d) =>
    drawnClueSchema.safeParse(d),
  );
}

export const CHAT_PAGE_SIZE = 50;

/** 채팅 기록. beforeId 가 있으면 그 이전 메시지를, 없으면 가장 최근 메시지를 돌려준다 (오래된 것이 앞). */
export async function fetchMessages(
  sb: SupabaseClient,
  room: string,
  opts: { beforeId?: number; afterId?: number } = {},
): Promise<Fetched<RoomMessage[]>> {
  let q = sb
    .from("room_messages")
    .select(
      "id, kind, channel, character_id, target_character_id, group_id, body, created_at",
    )
    .eq("room_id", room);
  if (opts.beforeId !== undefined) q = q.lt("id", opts.beforeId);
  if (opts.afterId !== undefined) q = q.gt("id", opts.afterId);
  const { data, error } = await q
    .order("id", { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  if (error) return { ok: false, error: roomErrorMessage(error.message) };
  const parsed = messageSchema.array().safeParse(data ?? []);
  if (!parsed.success) return { ok: false, error: roomErrorMessage(null) };
  return { ok: true, data: parsed.data.reverse() };
}
