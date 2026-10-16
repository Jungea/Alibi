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

describe("추리노트", () => {
  const note = (memo: string) => ({ v: 1, memo });

  it("저장하고 다시 읽으면 같은 내용이다", async () => {
    const { roomId } = await newGame();
    expect(
      await call(player(P1), "get_my_notes", { p_room: roomId }),
    ).toBeNull();
    await call(player(P1), "save_my_notes", {
      p_room: roomId,
      p_data: note("첫 메모"),
    });
    expect(await call(player(P1), "get_my_notes", { p_room: roomId })).toEqual(
      note("첫 메모"),
    );

    await call(player(P1), "save_my_notes", {
      p_room: roomId,
      p_data: note("고친 메모"),
    });
    expect(await call(player(P1), "get_my_notes", { p_room: roomId })).toEqual(
      note("고친 메모"),
    );
  });

  it("다른 참가자·GM·방 밖 사용자는 내 노트를 읽지 못한다", async () => {
    const { roomId } = await newGame();
    await call(player(P1), "save_my_notes", {
      p_room: roomId,
      p_data: note("NOTE-SECRET"),
    });

    // 각자 자기 노트만 본다 (P2 는 아직 없음)
    expect(
      await call(player(P2), "get_my_notes", { p_room: roomId }),
    ).toBeNull();
    await expect(call(gm, "get_my_notes", { p_room: roomId })).rejects.toThrow(
      /forbidden/,
    );
    await expect(
      call(player(OUTSIDER), "get_my_notes", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);

    // P2 가 저장해도 P1 의 노트는 그대로다
    await call(player(P2), "save_my_notes", {
      p_room: roomId,
      p_data: note("P2"),
    });
    expect(await call(player(P1), "get_my_notes", { p_room: roomId })).toEqual(
      note("NOTE-SECRET"),
    );
  });

  it("테이블은 직접 읽거나 쓸 수 없다", async () => {
    const { roomId } = await newGame();
    await call(player(P1), "save_my_notes", {
      p_room: roomId,
      p_data: note("x"),
    });
    for (const actor of [player(P2), player(P1), gm]) {
      const r = await as(db, actor, async (tx) => {
        try {
          await tx.query("select * from public.room_notes");
          return "ok";
        } catch (e) {
          return String(e);
        }
      });
      expect(r).toMatch(/permission denied/);
    }
  });

  it("GM·방 밖 사용자는 저장할 수 없다", async () => {
    const { roomId } = await newGame();
    for (const actor of [gm, player(OUTSIDER)])
      await expect(
        call(actor, "save_my_notes", { p_room: roomId, p_data: note("x") }),
      ).rejects.toThrow(/forbidden/);
  });

  it("대기실에서는 쓸 수 없다", async () => {
    const { roomId } = await newGame(false);
    await expect(
      call(player(P1), "save_my_notes", { p_room: roomId, p_data: note("x") }),
    ).rejects.toThrow(/invalid_state/);
    await expect(
      call(player(P1), "get_my_notes", { p_room: roomId }),
    ).rejects.toThrow(/invalid_state/);
  });

  it("객체가 아니거나 버전이 다르거나 너무 크면 거부한다", async () => {
    const { roomId } = await newGame();
    const save = (p_data: unknown) =>
      call(player(P1), "save_my_notes", { p_room: roomId, p_data });
    for (const bad of [null, [], 5, { memo: "no version" }, { v: 2 }])
      await expect(save(bad), JSON.stringify(bad)).rejects.toThrow(
        /invalid_notes/,
      );
    await expect(save(note("가".repeat(40000)))).rejects.toThrow(
      /invalid_notes/,
    );
  });

  it("방이 사라지면 노트도 함께 사라진다", async () => {
    const { roomId } = await newGame();
    await call(player(P1), "save_my_notes", {
      p_room: roomId,
      p_data: note("x"),
    });
    await db.query("delete from public.rooms where id = $1", [roomId]);
    const left = await db.query(
      "select count(*)::int as n from public.room_notes",
    );
    expect((left.rows[0] as { n: number }).n).toBe(0);
  });
});
