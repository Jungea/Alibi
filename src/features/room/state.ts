import type { SupabaseClient } from "@supabase/supabase-js";

import { roomErrorMessage } from "./errors";
import {
  overviewSchema,
  playerSchema,
  type RoomOverview,
  type RoomPlayer,
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
      .select("user_id, nickname, ready")
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
  finish_game: { p_room: string };
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
