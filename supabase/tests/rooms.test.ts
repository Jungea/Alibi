import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, errorOf, type Actor } from "./helpers/db";
import { createFakeSupabase } from "./helpers/fake-supabase";

const GM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

const SCENARIO = "a0000000-0000-4000-8000-000000000001";
const VERSION = "a0000000-0000-4000-8000-0000000000a1";
const OTHER_VERSION = "b0000000-0000-4000-8000-0000000000b1";

const C_CULPRIT = "c0000000-0000-4000-8000-000000000001";
const C_BUTLER = "c0000000-0000-4000-8000-000000000002";
const C_MAID = "c0000000-0000-4000-8000-000000000003";

const snapshot = {
  formatVersion: 1,
  scenario: {
    title: "저택의 밤",
    genre: "추리",
    estimatedMinutes: 90,
    victim: "저택 주인",
    incidentTime: "23:00",
    incidentPlace: "서재",
    openingText: "비가 내리는 밤이었다.",
    timeline: [{ description: "TRUTH-타임라인" }],
  },
  characters: [
    {
      id: C_BUTLER,
      name: "집사",
      publicInfo: "오래 일한 집사",
      secretInfo: "SECRET-집사",
      roleType: "suspect",
    },
    {
      id: C_CULPRIT,
      name: "정원사",
      publicInfo: "정원을 가꾼다",
      secretInfo: "SECRET-범인",
      roleType: "culprit",
    },
    {
      id: C_MAID,
      name: "하녀",
      publicInfo: "새로 온 하녀",
      secretInfo: "SECRET-하녀",
      roleType: "witness",
    },
  ],
  rounds: [
    {
      id: "d0000000-0000-4000-8000-000000000001",
      name: "탐색",
      goal: "단서를 찾는다",
      timeLimitSeconds: 600,
      allowedActions: ["chat"],
      unlockContent: "SECRET-해금",
    },
    {
      id: "d0000000-0000-4000-8000-000000000002",
      name: "토론",
      goal: "",
      timeLimitSeconds: null,
      allowedActions: ["chat"],
      unlockContent: "",
    },
    {
      id: "d0000000-0000-4000-8000-000000000003",
      name: "투표",
      goal: "",
      timeLimitSeconds: 180,
      allowedActions: ["vote"],
      unlockContent: "",
    },
  ],
  clues: [{ id: "e0000000-0000-4000-8000-000000000001", title: "SECRET-힌트" }],
  endings: [
    { id: "f0000000-0000-4000-8000-000000000001", truthText: "SECRET-진실" },
  ],
};

let db: PGlite;

const gm: Actor = { userId: GM };
const player = (id: string): Actor => ({ userId: id, anonymous: true });

/** RPC 를 해당 사용자로 호출하고 커밋한다. 오류면 예외. */
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

async function rows(actor: Actor, sql: string, params: unknown[] = []) {
  const r = await as(db, actor, (tx) => tx.query(sql, params));
  return r.rows as Record<string, unknown>[];
}

/** RLS 를 우회해 방 상태를 확인한다 (슈퍼유저 연결). */
async function roomRow(id: string) {
  const r = await db.query<Record<string, unknown>>(
    "select * from public.rooms where id = $1",
    [id],
  );
  return r.rows[0];
}

/** beforeAll 에서 만들어 여러 테스트가 함께 쓰는 방. 정리 대상에서 제외한다. */
const keptRooms = new Set<string>();

/** 방 수 제한(10개)에 걸리지 않도록 쓰고 난 방은 새 방을 만들 때 정리한다. */
async function newRoom(
  keep = false,
): Promise<{ roomId: string; code: string }> {
  const kept = [...keptRooms];
  await db.query(
    "delete from public.rooms where gm_id = $1 and not (id = any($2::uuid[]))",
    [GM, kept],
  );
  const created = await call<{ roomId: string; code: string }>(
    gm,
    "create_room",
    { p_version_id: VERSION },
  );
  if (keep) keptRooms.add(created.roomId);
  return created;
}

async function join(actor: Actor, code: string, nickname: string) {
  return call<{ ok: boolean; error?: string; roomId?: string }>(
    actor,
    "join_room",
    { p_code: code, p_nickname: nickname },
  );
}

beforeAll(async () => {
  const { createTestDb } = await import("./helpers/db");
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${GM}', 'gm@test'), ('${OTHER_OWNER}', 'o@test'),
      ('${P1}', null), ('${P2}', null), ('${P3}', null), ('${OUTSIDER}', null);
    insert into public.scenarios (id, owner_id, title) values
      ('${SCENARIO}', '${GM}', '저택의 밤'),
      ('b0000000-0000-4000-8000-000000000001', '${OTHER_OWNER}', '남의 시나리오');
    insert into public.scenario_versions (id, scenario_id, owner_id, version_no, visibility, snapshot)
      values ('${VERSION}', '${SCENARIO}', '${GM}', 1, 'private', '${JSON.stringify(snapshot).replaceAll("'", "''")}'::jsonb),
             ('${OTHER_VERSION}', 'b0000000-0000-4000-8000-000000000001', '${OTHER_OWNER}', 1, 'private', '${JSON.stringify(snapshot).replaceAll("'", "''")}'::jsonb);
  `);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe("방 만들기", () => {
  it("제작자는 본인 발행본으로 방과 6자리 초대 코드를 만든다", async () => {
    const { roomId, code } = await newRoom();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const room = await roomRow(roomId);
    expect(room.status).toBe("lobby");
    expect(room.max_players).toBe(3);
    expect(room.gm_id).toBe(GM);
  });

  it("다른 사람의 발행본으로는 만들 수 없다", async () => {
    await expect(
      call(gm, "create_room", { p_version_id: OTHER_VERSION }),
    ).rejects.toThrow(/version not found/);
  });

  it("익명 로그인 사용자는 방을 만들 수 없다", async () => {
    await expect(
      call(player(P1), "create_room", { p_version_id: VERSION }),
    ).rejects.toThrow(/forbidden/);
  });

  it("로그인하지 않은 요청은 RPC 를 실행할 수 없다", async () => {
    const msg = await errorOf(db, { userId: null }, (tx) =>
      tx.query("select public.create_room($1)", [VERSION]),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("진행 중인 방은 최대 10개까지만 만들 수 있다", async () => {
    await db.query("delete from public.rooms where gm_id = $1", [GM]);
    const create = () => call(gm, "create_room", { p_version_id: VERSION });
    for (let i = 0; i < 10; i++) await create();
    await expect(create()).rejects.toThrow(/too_many_rooms/);
    // 종료된 방은 세지 않는다
    await db.query(
      "update public.rooms set status = 'ended' where id = (select id from public.rooms where gm_id = $1 limit 1)",
      [GM],
    );
    await create();
  });
});

describe("입장", () => {
  it("코드와 닉네임으로 입장하고, 코드는 소문자·공백도 허용한다", async () => {
    const { roomId, code } = await newRoom();
    const r = await join(player(P1), ` ${code.toLowerCase()} `, " 탐정 ");
    expect(r).toEqual({ ok: true, roomId });
    const players = await db.query(
      "select nickname from public.room_players where room_id = $1",
      [roomId],
    );
    expect(players.rows).toEqual([{ nickname: "탐정" }]);
  });

  it("없는 코드는 not_found", async () => {
    expect(await join(player(P1), "ZZZZZZ", "탐정")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("닉네임이 비었거나 길거나 제어문자가 있으면 거부한다", async () => {
    const { code } = await newRoom();
    for (const nick of ["  ", "가".repeat(21), "탐정\u0007"]) {
      expect(await join(player(P1), code, nick)).toEqual({
        ok: false,
        error: "invalid_nickname",
      });
    }
  });

  it("같은 방에서 닉네임은 대소문자 구분 없이 중복될 수 없다", async () => {
    const { code } = await newRoom();
    await join(player(P1), code, "Holmes");
    expect(await join(player(P2), code, "holmes")).toEqual({
      ok: false,
      error: "nickname_taken",
    });
  });

  it("GM 은 자기 방에 참가자로 들어갈 수 없다", async () => {
    const { code } = await newRoom();
    const r = await join(gm, code, "GM");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("is_gm");
  });

  it("최대 인원을 넘으면 full", async () => {
    const { code } = await newRoom();
    await join(player(P1), code, "a");
    await join(player(P2), code, "b");
    await join(player(P3), code, "c");
    expect(await join(player(OUTSIDER), code, "d")).toEqual({
      ok: false,
      error: "full",
    });
  });

  it("이미 참가 중이면 다시 입장(재접속)할 수 있다", async () => {
    const { roomId, code } = await newRoom();
    await join(player(P1), code, "a");
    expect(await join(player(P1), code, "다른이름")).toEqual({
      ok: true,
      roomId,
    });
  });

  it("틀린 코드를 10번 시도하면 올바른 코드도 잠시 막힌다", async () => {
    const { code } = await newRoom();
    for (let i = 0; i < 10; i++) {
      expect((await join(player(OUTSIDER), "ZZZZZZ", "x")).error).toBe(
        "not_found",
      );
    }
    expect(await join(player(OUTSIDER), code, "x")).toEqual({
      ok: false,
      error: "rate_limited",
    });
    // 다른 사용자는 영향이 없다
    expect((await join(player(P2), code, "y")).ok).toBe(true);
    await db.exec(`delete from public.join_attempts`);
  });

  it("게임이 시작된 방에는 새로 들어올 수 없지만 기존 참가자는 재접속한다", async () => {
    const { roomId, code } = await newRoom();
    await join(player(P1), code, "a");
    await call(gm, "start_game", { p_room: roomId, p_force: true });
    expect((await join(player(P2), code, "b")).error).toBe("already_started");
    expect((await join(player(P1), code, "a")).ok).toBe(true);
  });
});

describe("조회 격리 (RLS)", () => {
  let roomId: string;
  let code: string;

  beforeAll(async () => {
    ({ roomId, code } = await newRoom(true));
    await join(player(P1), code, "a");
    await join(player(P2), code, "b");
  });

  it("방 참가자와 GM 은 방과 참가자 목록을 본다", async () => {
    for (const actor of [gm, player(P1)]) {
      const ps = await rows(
        actor,
        "select nickname from public.room_players where room_id = $1",
        [roomId],
      );
      expect(ps.map((p) => p.nickname).sort()).toEqual(["a", "b"]);
      expect(
        await rows(actor, "select id from public.rooms where id = $1", [
          roomId,
        ]),
      ).toHaveLength(1);
    }
  });

  it("방에 속하지 않은 사용자는 방·참가자·배정을 볼 수 없다", async () => {
    for (const table of ["rooms", "room_players", "room_assignments"]) {
      expect(
        await rows(player(OUTSIDER), `select 1 from public.${table}`),
        table,
      ).toHaveLength(0);
    }
  });

  it("로그인하지 않은 요청은 어떤 테이블도 읽을 수 없다", async () => {
    for (const table of ["rooms", "room_players", "room_assignments"]) {
      const msg = await errorOf(db, { userId: null }, (tx) =>
        tx.query(`select 1 from public.${table}`),
      );
      expect(msg, table).toMatch(/permission denied/);
    }
  });

  it("join_attempts 는 누구도 직접 읽을 수 없다", async () => {
    const msg = await errorOf(db, player(P1), (tx) =>
      tx.query("select 1 from public.join_attempts"),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("참가자가 직접 INSERT / UPDATE / DELETE 할 수 없다", async () => {
    const stmts = [
      `update public.rooms set status = 'ended' where id = '${roomId}'`,
      `delete from public.rooms where id = '${roomId}'`,
      `update public.room_players set nickname = 'hack' where room_id = '${roomId}'`,
      `delete from public.room_players where room_id = '${roomId}'`,
      `insert into public.room_players (room_id, user_id, nickname) values ('${roomId}', '${OUTSIDER}', 'x')`,
      `insert into public.room_assignments (room_id, user_id, character_id) values ('${roomId}', '${P1}', '${C_CULPRIT}')`,
    ];
    for (const sql of stmts) {
      for (const actor of [player(P1), gm]) {
        const msg = await errorOf(db, actor, (tx) => tx.query(sql));
        expect(msg, sql).toMatch(/permission denied/);
      }
    }
    expect((await roomRow(roomId)).status).toBe("lobby");
  });

  it("GM 이 아니면 진행 RPC 가 거부된다", async () => {
    await expect(
      call(player(P1), "start_game", { p_room: roomId, p_force: true }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(OUTSIDER), "assign_characters", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(P1), "kick_player", { p_room: roomId, p_user: P2 }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(P1), "start_round", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(P1), "extend_timer", { p_room: roomId, p_seconds: 60 }),
    ).rejects.toThrow(/forbidden/);
  });

  it("방에 속하지 않은 사용자는 준비·나가기·개요 조회가 거부된다", async () => {
    await expect(
      call(player(OUTSIDER), "set_ready", { p_room: roomId, p_ready: true }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(OUTSIDER), "leave_room", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(OUTSIDER), "get_room_overview", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
  });
});

describe("대기실", () => {
  it("준비 표시를 바꾸고, 나가기와 내보내기를 한다", async () => {
    const { roomId, code } = await newRoom();
    await join(player(P1), code, "a");
    await join(player(P2), code, "b");

    await call(player(P1), "set_ready", { p_room: roomId, p_ready: true });
    const ps = await rows(
      gm,
      "select nickname, ready from public.room_players where room_id = $1 order by nickname",
      [roomId],
    );
    expect(ps).toEqual([
      { nickname: "a", ready: true },
      { nickname: "b", ready: false },
    ]);

    await call(player(P2), "leave_room", { p_room: roomId });
    await call(gm, "kick_player", { p_room: roomId, p_user: P1 });
    expect(
      await rows(gm, "select 1 from public.room_players where room_id = $1", [
        roomId,
      ]),
    ).toHaveLength(0);
  });

  it("시작한 뒤에는 준비·나가기가 거부된다", async () => {
    const { roomId, code } = await newRoom();
    await join(player(P1), code, "a");
    await call(gm, "start_game", { p_room: roomId, p_force: true });
    await expect(
      call(player(P1), "leave_room", { p_room: roomId }),
    ).rejects.toThrow(/invalid_state/);
    await expect(
      call(player(P1), "set_ready", { p_room: roomId, p_ready: true }),
    ).rejects.toThrow(/invalid_state/);
  });
});

describe("인물 배정", () => {
  async function lobbyWith(...users: string[]) {
    const { roomId, code } = await newRoom();
    for (const [i, u] of users.entries())
      await join(player(u), code, `p${i + 1}`);
    return roomId;
  }

  const assignedCharacters = async (roomId: string) =>
    (
      await db.query<{ user_id: string; character_id: string }>(
        "select user_id, character_id from public.room_assignments where room_id = $1",
        [roomId],
      )
    ).rows;

  it("랜덤 배정은 서로 다른 인물을 모두에게 준다", async () => {
    const roomId = await lobbyWith(P1, P2, P3);
    await call(gm, "assign_characters", { p_room: roomId });
    const a = await assignedCharacters(roomId);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((x) => x.character_id)).size).toBe(3);
  });

  it("인원이 인물보다 적어도 범인은 항상 배정에 포함된다", async () => {
    for (let i = 0; i < 15; i++) {
      const roomId = await lobbyWith(P1);
      await call(gm, "assign_characters", { p_room: roomId });
      const a = await assignedCharacters(roomId);
      expect(a.map((x) => x.character_id)).toContain(C_CULPRIT);
      await db.exec(`delete from public.rooms where id = '${roomId}'`);
    }
  });

  it("랜덤 배정은 매번 같은 결과가 아니다", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const roomId = await lobbyWith(P1, P2, P3);
      await call(gm, "assign_characters", { p_room: roomId });
      const a = await assignedCharacters(roomId);
      seen.add(
        a
          .sort((x, y) => x.user_id.localeCompare(y.user_id))
          .map((x) => x.character_id)
          .join(),
      );
      await db.exec(`delete from public.rooms where id = '${roomId}'`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("GM 이 직접 지정하고 해제하며, 같은 인물을 두 명에게 줄 수 없다", async () => {
    const roomId = await lobbyWith(P1, P2);
    await call(gm, "set_player_character", {
      p_room: roomId,
      p_user: P1,
      p_character: C_CULPRIT,
    });
    await expect(
      call(gm, "set_player_character", {
        p_room: roomId,
        p_user: P2,
        p_character: C_CULPRIT,
      }),
    ).rejects.toThrow(/character_taken/);
    await expect(
      call(gm, "set_player_character", {
        p_room: roomId,
        p_user: P2,
        p_character: "c0000000-0000-4000-8000-0000000000ff",
      }),
    ).rejects.toThrow(/character not found/);
    // 같은 사람의 인물을 바꾼다
    await call(gm, "set_player_character", {
      p_room: roomId,
      p_user: P1,
      p_character: C_MAID,
    });
    expect(await assignedCharacters(roomId)).toEqual([
      { user_id: P1, character_id: C_MAID },
    ]);
    await call(gm, "set_player_character", {
      p_room: roomId,
      p_user: P1,
      p_character: null,
    });
    expect(await assignedCharacters(roomId)).toHaveLength(0);
  });

  it("참가자가 아닌 사람에게는 지정할 수 없다", async () => {
    const roomId = await lobbyWith(P1);
    await expect(
      call(gm, "set_player_character", {
        p_room: roomId,
        p_user: OUTSIDER,
        p_character: C_MAID,
      }),
    ).rejects.toThrow(/player not found/);
  });
});

describe("배정 정보 공개 범위", () => {
  let roomId: string;

  beforeAll(async () => {
    const created = await newRoom(true);
    roomId = created.roomId;
    await join(player(P1), created.code, "a");
    await join(player(P2), created.code, "b");
    await call(gm, "assign_characters", { p_room: roomId });
  });

  it("시작 전에는 참가자가 자기 배정도 볼 수 없고 GM 은 전부 본다", async () => {
    expect(
      await rows(player(P1), "select 1 from public.room_assignments"),
    ).toHaveLength(0);
    expect(
      await rows(gm, "select 1 from public.room_assignments"),
    ).toHaveLength(2);
  });

  it("시작 후에는 본인 배정만 보이고 다른 사람의 것은 보이지 않는다", async () => {
    await call(gm, "start_game", { p_room: roomId, p_force: true });
    const mine = await rows(
      player(P1),
      "select user_id from public.room_assignments",
    );
    expect(mine).toEqual([{ user_id: P1 }]);
    expect(
      await rows(player(OUTSIDER), "select 1 from public.room_assignments"),
    ).toHaveLength(0);
    expect(
      await rows(gm, "select 1 from public.room_assignments"),
    ).toHaveLength(2);
  });
});

describe("진행 상태 전환", () => {
  async function started(users = [P1, P2]) {
    const { roomId, code } = await newRoom();
    for (const [i, u] of users.entries())
      await join(player(u), code, `p${i + 1}`);
    return { roomId, code };
  }

  it("일반 시작은 전원 준비·전원 배정이 필요하다", async () => {
    const { roomId } = await started();
    await expect(call(gm, "start_game", { p_room: roomId })).rejects.toThrow(
      /players_not_ready/,
    );
    for (const u of [P1, P2])
      await call(player(u), "set_ready", { p_room: roomId, p_ready: true });
    await expect(call(gm, "start_game", { p_room: roomId })).rejects.toThrow(
      /unassigned_players/,
    );
    await call(gm, "assign_characters", { p_room: roomId });
    await call(gm, "start_game", { p_room: roomId });
    expect((await roomRow(roomId)).status).toBe("intro");
  });

  it("일반 시작은 2명 미만이면 거부되고 강제 시작은 1명도 된다", async () => {
    const { roomId } = await started([P1]);
    await call(player(P1), "set_ready", { p_room: roomId, p_ready: true });
    await expect(call(gm, "start_game", { p_room: roomId })).rejects.toThrow(
      /not_enough_players/,
    );
    await call(gm, "start_game", { p_room: roomId, p_force: true });
    expect((await roomRow(roomId)).status).toBe("intro");
    // 강제 시작은 남은 사람을 자동 배정한다
    expect(
      (
        await db.query(
          "select 1 from public.room_assignments where room_id = $1",
          [roomId],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("참가자가 없으면 강제로도 시작할 수 없다", async () => {
    const { roomId } = await newRoom();
    await expect(
      call(gm, "start_game", { p_room: roomId, p_force: true }),
    ).rejects.toThrow(/not_enough_players/);
  });

  it("단계에 맞지 않는 전환은 거부된다", async () => {
    const { roomId } = await started();
    await expect(call(gm, "start_round", { p_room: roomId })).rejects.toThrow(
      /invalid_state/,
    );
    await expect(call(gm, "end_round", { p_room: roomId })).rejects.toThrow(
      /invalid_state/,
    );
    await expect(call(gm, "finish_game", { p_room: roomId })).rejects.toThrow(
      /invalid_state/,
    );
    await call(gm, "start_game", { p_room: roomId, p_force: true });
    await expect(
      call(gm, "start_game", { p_room: roomId, p_force: true }),
    ).rejects.toThrow(/invalid_state/);
    await expect(
      call(gm, "assign_characters", { p_room: roomId }),
    ).rejects.toThrow(/invalid_state/);
    await expect(call(gm, "finish_game", { p_room: roomId })).rejects.toThrow(
      /invalid_state/,
    );
  });

  it("라운드를 순서대로 진행하고 타이머 종료 시각을 저장한다", async () => {
    const { roomId } = await started();
    await call(gm, "start_game", { p_room: roomId, p_force: true });

    await call(gm, "start_round", { p_room: roomId });
    let room = await roomRow(roomId);
    expect(room.status).toBe("round");
    expect(room.current_round_index).toBe(0);
    const ends = new Date(room.timer_ends_at as string).getTime();
    const started0 = new Date(room.round_started_at as string).getTime();
    expect(Math.round((ends - started0) / 1000)).toBe(600);

    await call(gm, "end_round", { p_room: roomId });
    room = await roomRow(roomId);
    expect(room.status).toBe("break");
    expect(room.timer_ends_at).toBeNull();

    // 시간 제한이 없는 라운드
    await call(gm, "start_round", { p_room: roomId });
    room = await roomRow(roomId);
    expect(room.current_round_index).toBe(1);
    expect(room.timer_ends_at).toBeNull();
    await call(gm, "end_round", { p_room: roomId });

    // 투표가 허용된 라운드는 voting 단계
    await call(gm, "start_round", { p_room: roomId });
    room = await roomRow(roomId);
    expect(room.status).toBe("voting");
    expect(room.current_round_index).toBe(2);
    await call(gm, "end_round", { p_room: roomId });

    await expect(call(gm, "start_round", { p_room: roomId })).rejects.toThrow(
      /no_more_rounds/,
    );
    await call(gm, "finish_game", { p_room: roomId });
    expect((await roomRow(roomId)).status).toBe("ended");
    await expect(call(gm, "start_round", { p_room: roomId })).rejects.toThrow(
      /invalid_state/,
    );
  });

  it("라운드와 상관없이 투표를 시작할 수 있다", async () => {
    const { roomId } = await started();
    await call(gm, "start_game", { p_room: roomId, p_force: true });
    await call(gm, "start_round", { p_room: roomId });
    await call(gm, "start_vote", { p_room: roomId });
    const room = await roomRow(roomId);
    expect(room.status).toBe("voting");
    expect(room.timer_ends_at).toBeNull();
    await call(gm, "finish_game", { p_room: roomId });
    expect((await roomRow(roomId)).status).toBe("ended");
  });
});

describe("타이머", () => {
  async function inRound() {
    const created = await newRoom();
    await join(player(P1), created.code, "a");
    await call(gm, "start_game", { p_room: created.roomId, p_force: true });
    await call(gm, "start_round", { p_room: created.roomId });
    return created.roomId;
  }

  it("일시정지하면 남은 초를 저장하고 재개하면 새 종료 시각을 만든다", async () => {
    const roomId = await inRound();
    await call(gm, "set_timer_paused", { p_room: roomId, p_paused: true });
    let room = await roomRow(roomId);
    expect(room.timer_ends_at).toBeNull();
    const remaining = room.timer_paused_remaining as number;
    expect(remaining).toBeGreaterThan(590);
    expect(remaining).toBeLessThanOrEqual(600);

    // 이미 정지된 상태에서 다시 정지해도 값이 바뀌지 않는다
    await call(gm, "set_timer_paused", { p_room: roomId, p_paused: true });
    expect((await roomRow(roomId)).timer_paused_remaining).toBe(remaining);

    await call(gm, "set_timer_paused", { p_room: roomId, p_paused: false });
    room = await roomRow(roomId);
    expect(room.timer_paused_remaining).toBeNull();
    const left = new Date(room.timer_ends_at as string).getTime() - Date.now();
    expect(Math.abs(left - remaining * 1000)).toBeLessThan(5000);
  });

  it("실행 중·정지 중 모두 시간을 늘리고 줄일 수 있다", async () => {
    const roomId = await inRound();
    const before = new Date(
      (await roomRow(roomId)).timer_ends_at as string,
    ).getTime();
    await call(gm, "extend_timer", { p_room: roomId, p_seconds: 120 });
    const after = new Date(
      (await roomRow(roomId)).timer_ends_at as string,
    ).getTime();
    expect(after - before).toBe(120_000);

    await call(gm, "set_timer_paused", { p_room: roomId, p_paused: true });
    const paused = (await roomRow(roomId)).timer_paused_remaining as number;
    await call(gm, "extend_timer", { p_room: roomId, p_seconds: -30 });
    expect((await roomRow(roomId)).timer_paused_remaining).toBe(paused - 30);
    await call(gm, "extend_timer", { p_room: roomId, p_seconds: -3600 });
    expect((await roomRow(roomId)).timer_paused_remaining).toBe(0);
  });

  it("시간 제한이 없던 라운드에 타이머를 새로 걸 수 있다", async () => {
    const roomId = await inRound();
    await call(gm, "end_round", { p_room: roomId });
    await call(gm, "start_round", { p_room: roomId }); // 제한 없는 라운드
    await expect(
      call(gm, "set_timer_paused", { p_room: roomId, p_paused: true }),
    ).rejects.toThrow(/no_timer/);
    await expect(
      call(gm, "extend_timer", { p_room: roomId, p_seconds: -10 }),
    ).rejects.toThrow(/no_timer/);
    await call(gm, "extend_timer", { p_room: roomId, p_seconds: 90 });
    expect((await roomRow(roomId)).timer_ends_at).not.toBeNull();
  });

  it("라운드가 아닌 단계와 잘못된 값은 거부된다", async () => {
    const roomId = await inRound();
    await expect(
      call(gm, "extend_timer", { p_room: roomId, p_seconds: 0 }),
    ).rejects.toThrow(/invalid seconds/);
    await expect(
      call(gm, "extend_timer", { p_room: roomId, p_seconds: 99999 }),
    ).rejects.toThrow(/invalid seconds/);
    await call(gm, "end_round", { p_room: roomId });
    await expect(
      call(gm, "extend_timer", { p_room: roomId, p_seconds: 10 }),
    ).rejects.toThrow(/invalid_state/);
  });
});

describe("방 개요 (get_room_overview)", () => {
  let roomId: string;
  let code: string;

  beforeAll(async () => {
    ({ roomId, code } = await newRoom(true));
    await join(player(P1), code, "a");
    await join(player(P2), code, "b");
  });

  it("참가자에게는 범인·진실·비밀 정보·해금 내용이 포함되지 않는다", async () => {
    const overview = await call<Record<string, unknown>>(
      player(P1),
      "get_room_overview",
      { p_room: roomId },
    );
    const text = JSON.stringify(overview);
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("TRUTH");
    expect(text).not.toContain("culprit");
    expect(text).not.toContain("roleType");
    expect((overview.characters as unknown[]).length).toBe(3);
    expect(overview.isGm).toBe(false);
  });

  it("시작 전에는 세계관(오프닝)을 숨기고 GM 에게는 보여준다", async () => {
    const asPlayer = await call<{ scenario: Record<string, unknown> }>(
      player(P1),
      "get_room_overview",
      { p_room: roomId },
    );
    expect(asPlayer.scenario.openingText).toBeUndefined();
    expect(asPlayer.scenario.title).toBe("저택의 밤");

    const asGm = await call<{
      scenario: Record<string, unknown>;
      assignments: unknown[];
    }>(gm, "get_room_overview", { p_room: roomId });
    expect(asGm.scenario.openingText).toBe("비가 내리는 밤이었다.");
    expect(asGm.assignments).toEqual([]);
  });

  it("시작하면 본인 인물 ID 와 오프닝만 주고 다른 사람 배정은 주지 않는다", async () => {
    await call(gm, "assign_characters", { p_room: roomId });
    await call(gm, "start_game", { p_room: roomId, p_force: true });

    const o1 = await call<Record<string, unknown>>(
      player(P1),
      "get_room_overview",
      { p_room: roomId },
    );
    const o2 = await call<Record<string, unknown>>(
      player(P2),
      "get_room_overview",
      { p_room: roomId },
    );
    expect((o1.scenario as Record<string, unknown>).openingText).toBe(
      "비가 내리는 밤이었다.",
    );
    expect(o1.assignments).toBeUndefined();
    expect(o1.myCharacterId).toBeTruthy();
    expect(o1.myCharacterId).not.toBe(o2.myCharacterId);
    expect(JSON.stringify(o1)).not.toContain("SECRET");

    const g = await call<{ assignments: unknown[] }>(gm, "get_room_overview", {
      p_room: roomId,
    });
    expect(g.assignments).toHaveLength(2);
  });
});
