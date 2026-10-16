import type { SupabaseClient } from "@supabase/supabase-js";

import { z } from "zod";

import { ROOM_STATUSES } from "@/lib/game/room-state";

const rowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: z.enum(ROOM_STATUSES),
  created_at: z.string(),
});
export type ActiveRoom = z.infer<typeof rowSchema>;

/** 내가 GM 인 진행 중인 방 (링크를 잃어버렸을 때 다시 들어가기 위한 목록) */
export async function listActiveRooms(
  sb: SupabaseClient,
  userId: string,
): Promise<ActiveRoom[]> {
  const { data, error } = await sb
    .from("rooms")
    .select("id, code, status, created_at")
    .eq("gm_id", userId)
    .neq("status", "ended")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return [];
  const parsed = rowSchema.array().safeParse(data);
  return parsed.success ? parsed.data : [];
}
