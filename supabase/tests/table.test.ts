import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, type Actor } from "./helpers/db";
import { createFakeSupabase } from "./helpers/fake-supabase";

const GM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

const SCENARIO = "a0000000-0000-4000-8000-000000000001";
const VERSION = "a0000000-0000-4000-8000-0000000000a1";
const R1 = "d0000000-0000-4000-8000-000000000001";
const R2 = "d0000000-0000-4000-8000-000000000002";

const character = (n: number, name: string, role: string) => ({
  id: `c0000000-0000-4000-8000-00000000000${n}`,
  name,
  publicInfo: `PUBLIC-INFO-${name}`,
  secretInfo: `SECRET-${name}`,
  background: `BG-${name}`,
  personalGoal: `GOAL-${name}`,
  roleType: role,
  liePolicy: "none",
  lieNote: "",
  relations: [],
  roundInfos: {},
});

const snapshot = {
  formatVersion: 1,
  scenario: {
    title: "저택의 밤",
    genre: "추리",
    estimatedMinutes: 90,
    victim: "VICTIM-저택 주인",
    incidentTime: "23:00",
    incidentPlace: "서재",
    openingText: "OPENING-비가 내리는 밤",
    timeline: [{ id: "x", time: "23:00", description: "TIMELINE-SECRET" }],
  },
  characters: [
    character(1, "집사", "suspect"),
    character(2, "정원사", "culprit"),
    character(3, "하녀", "witness"),
  ],
  rounds: [
    {
      id: R1,
      name: "탐색",
      goal: "GOAL-R1",
      timeLimitSeconds: null,
      allowedActions: ["chat", "draw_card"],
      unlockContent: "UNLOCK-1",
    },
    {
      id: R2,
      name: "토론",
      goal: "GOAL-R2",
      timeLimitSeconds: null,
      allowedActions: ["chat"],
      unlockContent: "UNLOCK-2",
    },
  ],
  clues: [
    {
      id: "e0000000-0000-4000-8000-000000000001",
      title: "공개 단서",
      body: "CLUE-PUBLIC-BODY",
      kind: "evidence",
      acquireRoundId: R1,
      visibility: "everyone",
      isTrue: true,
    },
    {
      id: "e0000000-0000-4000-8000-000000000002",
      title: "비밀 단서",
      body: "CLUE-PRIVATE-BODY",
      kind: "testimony",
      acquireRoundId: R1,
      visibility: "acquirer",
      isTrue: false,
    },
  ],
  missions: [],
  endings: [
    {
      id: "f0000000-0000-4000-8000-000000000001",
      name: "결말",
      conditionKind: "default",
      conditionMissionId: null,
      resultText: "ENDING-RESULT",
      truthText: "ENDING-TRUTH",
      epilogues: {},
    },
  ],
};

let db: PGlite;
const gm: Actor = { userId: GM };
const player = (id: string): Actor => ({ userId: id, anonymous: true });

async function call<T = unknown>(
  actor: Actor,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const sb = createFakeSupabase(db, actor);
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data as Record<string, T>[])[0]?.[fn] as T;
}

async function newGame(start = true) {
  await db.query("delete from public.rooms where gm_id = $1", [GM]);
  const { roomId, code } = await call<{ roomId: string; code: string }>(
    gm,
    "create_room",
    { p_version_id: VERSION },
  );
  for (const [i, u] of [P1, P2, P3].entries())
    await call(player(u), "join_room", { p_code: code, p_nickname: `p${i}` });
  if (start) await call(gm, "start_game", { p_room: roomId, p_force: true });
  return { roomId };
}

const tableView = (roomId: string, actor: Actor = gm) =>
  call<Record<string, unknown>>(actor, "get_table_view", { p_room: roomId });

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${GM}', 'gm@test'), ('${P1}', null), ('${P2}', null), ('${P3}', null), ('${OUTSIDER}', null);
    insert into public.scenarios (id, owner_id, title) values ('${SCENARIO}', '${GM}', '저택의 밤');
    insert into public.scenario_versions (id, scenario_id, owner_id, version_no, visibility, snapshot)
      values ('${VERSION}', '${SCENARIO}', '${GM}', 1, 'private',
              '${JSON.stringify(snapshot).replaceAll("'", "''")}'::jsonb);
  `);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe("진행 방식", () => {
  it("GM 만 바꿀 수 있고 기본은 채팅형이다", async () => {
    const { roomId } = await newGame(false);
    const ov = await call<{
      room: { playMode: string; voiceLink: string | null };
    }>(player(P1), "get_room_overview", { p_room: roomId });
    expect(ov.room).toMatchObject({ playMode: "chat", voiceLink: null });
    await expect(
      call(player(P1), "set_room_mode", { p_room: roomId, p_mode: "face" }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(OUTSIDER), "set_room_mode", {
        p_room: roomId,
        p_mode: "face",
      }),
    ).rejects.toThrow(/forbidden/);
  });

  it("음성 링크는 http/https 주소만 허용한다", async () => {
    const { roomId } = await newGame(false);
    const set = (link: string | null) =>
      call(gm, "set_room_mode", {
        p_room: roomId,
        p_mode: "face",
        p_voice_link: link,
      });
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "discord.gg/abc",
      "https://a b.com",
      `https://x.com/${"a".repeat(300)}`,
    ])
      await expect(set(bad), bad).rejects.toThrow(/invalid_link/);
    await expect(
      call(gm, "set_room_mode", { p_room: roomId, p_mode: "voice" }),
    ).rejects.toThrow(/invalid_mode/);

    await set("https://discord.gg/abc123");
    const ov = await call<{ room: { playMode: string; voiceLink: string } }>(
      player(P2),
      "get_room_overview",
      { p_room: roomId },
    );
    expect(ov.room).toMatchObject({
      playMode: "face",
      voiceLink: "https://discord.gg/abc123",
    });
    await set("   "); // 비우면 링크 없음
    const ov2 = await call<{ room: { voiceLink: string | null } }>(
      player(P2),
      "get_room_overview",
      { p_room: roomId },
    );
    expect(ov2.room.voiceLink).toBeNull();
  });

  it("대면형에서는 참가자가 채팅할 수 없고 GM 공지만 가능하다", async () => {
    const { roomId } = await newGame();
    await call(gm, "start_round", { p_room: roomId });
    await call(player(P1), "send_message", {
      p_room: roomId,
      p_body: "채팅형",
    });

    await call(gm, "set_room_mode", { p_room: roomId, p_mode: "face" });
    await expect(
      call(player(P1), "send_message", { p_room: roomId, p_body: "x" }),
    ).rejects.toThrow(/chat_disabled/);
    await call(gm, "send_message", { p_room: roomId, p_body: "공지" });

    await call(gm, "set_room_mode", { p_room: roomId, p_mode: "chat" });
    await call(player(P1), "send_message", { p_room: roomId, p_body: "다시" });
  });
});

describe("테이블 화면", () => {
  it("GM 만 받을 수 있다", async () => {
    const { roomId } = await newGame();
    await expect(tableView(roomId, player(P1))).rejects.toThrow(/forbidden/);
    await expect(tableView(roomId, player(OUTSIDER))).rejects.toThrow(
      /forbidden/,
    );
  });

  it("대기실에서는 사건 개요를 숨기고 닉네임과 공개 인물 소개만 준다", async () => {
    const { roomId } = await newGame(false);
    const view = await tableView(roomId);
    const text = JSON.stringify(view);
    expect(text).not.toContain("VICTIM");
    expect(text).not.toContain("OPENING");
    expect(text).toContain("PUBLIC-INFO-집사");
    expect(view.players).toHaveLength(3);
  });

  it("비밀·배정·미공개 정보는 어떤 단계에서도 들어 있지 않다", async () => {
    const { roomId } = await newGame();
    await call(gm, "start_round", { p_room: roomId });
    await call(player(P1), "draw_card", { p_room: roomId });
    await call(player(P2), "draw_card", { p_room: roomId });
    await call(player(P1), "send_message", {
      p_room: roomId,
      p_body: "CHAT-BODY",
    });

    const view = await tableView(roomId);
    const text = JSON.stringify(view);

    // 공개된 것
    expect(text).toContain("VICTIM-저택 주인");
    expect(text).toContain("CLUE-PUBLIC-BODY");
    expect(text).toContain("UNLOCK-1");
    // 비밀과 개인 정보
    for (const secret of [
      "SECRET-",
      "BG-",
      "GOAL-집사",
      "CLUE-PRIVATE-BODY",
      "TIMELINE-SECRET",
      "UNLOCK-2",
      "GOAL-R2",
      "ENDING-",
      "CHAT-BODY",
      P1,
      P2,
      P3,
      "culprit",
    ])
      expect(text, secret).not.toContain(secret);
  });

  it("시작하지 않은 라운드는 나오지 않고, 투표는 인원 수만 나온다", async () => {
    const { roomId } = await newGame();
    await call(gm, "start_round", { p_room: roomId });
    await call(gm, "start_vote", { p_room: roomId });
    const mine = await db.query<{ character_id: string }>(
      "select character_id from public.room_assignments where room_id = $1 and user_id = $2",
      [roomId, P1],
    );
    const target = snapshot.characters.find(
      (c) => c.id !== mine.rows[0].character_id,
    )!.id;
    await call(player(P1), "cast_vote", { p_room: roomId, p_target: target });

    const view = await tableView(roomId);
    expect(view.votes).toEqual({ total: 3, voted: 1 });
    expect((view.rounds as unknown[]).length).toBe(1);
    expect(JSON.stringify(view)).not.toContain(target);
  });

  it("결말은 get_ending 의 공개 단계에 따라서만 나온다", async () => {
    const { roomId } = await newGame();
    await call(gm, "start_round", { p_room: roomId });
    await call(gm, "end_round", { p_room: roomId });
    await call(gm, "finish_game", { p_room: roomId });
    expect(JSON.stringify(await tableView(roomId))).not.toContain(
      "ENDING-TRUTH",
    );
    const step1 = await call<Record<string, unknown>>(gm, "get_ending", {
      p_room: roomId,
    });
    expect(JSON.stringify(step1)).not.toContain("ENDING-TRUTH");
  });

  it("RLS: 참가자가 직접 쓸 수 없는 값은 그대로 막혀 있다", async () => {
    const { roomId } = await newGame(false);
    const r = await as(db, player(P1), async (tx) => {
      try {
        await tx.query(
          "update public.rooms set play_mode = 'face' where id = $1",
          [roomId],
        );
        return "ok";
      } catch (e) {
        return String(e);
      }
    });
    expect(r).toMatch(/permission denied/);
  });
});
