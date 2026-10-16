import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveEnding, type EndingRule } from "../../src/lib/game/ending";
import { as, createTestDb, errorOf, type Actor } from "./helpers/db";
import { createFakeSupabase } from "./helpers/fake-supabase";

const GM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
const PLAYERS = [P1, P2, P3];

const SCENARIO = "a0000000-0000-4000-8000-000000000001";
const VERSION = "a0000000-0000-4000-8000-0000000000a1";

const C_BUTLER = "c0000000-0000-4000-8000-000000000002";
const C_CULPRIT = "c0000000-0000-4000-8000-000000000001";
const C_MAID = "c0000000-0000-4000-8000-000000000003";

const R1 = "d0000000-0000-4000-8000-000000000001"; // 전체 + 귓속말
const R2 = "d0000000-0000-4000-8000-000000000002"; // 전체만
const R3 = "d0000000-0000-4000-8000-000000000003"; // 귓속말만

const M_PERSONAL = "b0000000-0000-4000-8000-000000000001"; // 집사, 자가 보고
const M_COMMON = "b0000000-0000-4000-8000-000000000002"; // 공통, 자가 보고
const M_HIDDEN = "b0000000-0000-4000-8000-000000000003"; // 하녀, 숨김, GM 판정
const M_GM = "b0000000-0000-4000-8000-000000000004"; // 공통, GM 판정

const E_HIDDEN = "f0000000-0000-4000-8000-000000000001";
const E_COMMON_FAILED = "f0000000-0000-4000-8000-000000000002";
const E_CAUGHT = "f0000000-0000-4000-8000-000000000003";
const E_ESCAPED = "f0000000-0000-4000-8000-000000000004";
const E_DEFAULT = "f0000000-0000-4000-8000-000000000005";

const endings = [
  {
    id: E_HIDDEN,
    name: "숨은 미션 결말",
    conditionKind: "mission_done",
    conditionMissionId: M_HIDDEN,
    resultText: "RESULT-HIDDEN",
    truthText: "TRUTH",
    epilogues: { [C_MAID]: "EPI-하녀-숨은" },
  },
  {
    id: E_COMMON_FAILED,
    name: "공통 미션 실패 결말",
    conditionKind: "mission_failed",
    conditionMissionId: M_COMMON,
    resultText: "RESULT-COMMON-FAILED",
    truthText: "TRUTH",
    epilogues: {},
  },
  {
    id: E_CAUGHT,
    name: "검거 결말",
    conditionKind: "culprit_caught",
    conditionMissionId: null,
    resultText: "RESULT-CAUGHT",
    truthText: "TRUTH",
    epilogues: { [C_CULPRIT]: "EPI-정원사-검거" },
  },
  {
    id: E_ESCAPED,
    name: "도주 결말",
    conditionKind: "culprit_escaped",
    conditionMissionId: null,
    resultText: "RESULT-ESCAPED",
    truthText: "TRUTH",
    epilogues: { [C_CULPRIT]: "EPI-정원사-도주" },
  },
  {
    id: E_DEFAULT,
    name: "기본 결말",
    conditionKind: "default",
    conditionMissionId: null,
    resultText: "RESULT-DEFAULT",
    truthText: "TRUTH",
    epilogues: {},
  },
];

const character = (
  id: string,
  name: string,
  roleType: string,
  secret: string,
) => ({
  id,
  name,
  publicInfo: `${name} 소개`,
  secretInfo: secret,
  background: "",
  personalGoal: "",
  roleType,
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
    victim: "저택 주인",
    incidentTime: "23:00",
    incidentPlace: "서재",
    openingText: "비가 내리는 밤이었다.",
  },
  characters: [
    character(C_BUTLER, "집사", "suspect", "SECRET-집사"),
    character(C_CULPRIT, "정원사", "culprit", "SECRET-범인"),
    character(C_MAID, "하녀", "witness", "SECRET-하녀"),
  ],
  rounds: [
    {
      id: R1,
      name: "탐색",
      goal: "",
      timeLimitSeconds: null,
      allowedActions: ["chat", "whisper", "draw_card"],
      unlockContent: "",
    },
    {
      id: R2,
      name: "토론",
      goal: "",
      timeLimitSeconds: null,
      allowedActions: ["chat"],
      unlockContent: "",
    },
    {
      id: R3,
      name: "밀담",
      goal: "",
      timeLimitSeconds: null,
      allowedActions: ["whisper"],
      unlockContent: "",
    },
  ],
  clues: [],
  missions: [
    {
      id: M_PERSONAL,
      title: "집사의 미션",
      description: "DESC-집사",
      scope: "personal",
      characterId: C_BUTLER,
      judgeType: "self_report",
      hidden: false,
    },
    {
      id: M_COMMON,
      title: "공통 미션",
      description: "DESC-공통",
      scope: "common",
      characterId: null,
      judgeType: "self_report",
      hidden: false,
    },
    {
      id: M_HIDDEN,
      title: "숨겨진 미션",
      description: "DESC-숨김",
      scope: "personal",
      characterId: C_MAID,
      judgeType: "gm",
      hidden: true,
    },
    {
      id: M_GM,
      title: "GM 판정 미션",
      description: "DESC-GM",
      scope: "common",
      characterId: null,
      judgeType: "gm",
      hidden: false,
    },
  ],
  endings,
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

async function rows(actor: Actor, sql: string, params: unknown[] = []) {
  const r = await as(db, actor, (tx) => tx.query(sql, params));
  return r.rows as Record<string, unknown>[];
}

/** 3명이 입장해 강제 시작(인물 확인 단계)까지 진행한 방 */
async function newGame() {
  await db.query("delete from public.rooms where gm_id = $1", [GM]);
  const { roomId, code } = await call<{ roomId: string; code: string }>(
    gm,
    "create_room",
    { p_version_id: VERSION },
  );
  for (const [i, u] of PLAYERS.entries()) {
    await call(player(u), "join_room", { p_code: code, p_nickname: `p${i}` });
  }
  await call(gm, "start_game", { p_room: roomId, p_force: true });
  const a = await db.query<{ user_id: string; character_id: string }>(
    "select user_id, character_id from public.room_assignments where room_id = $1",
    [roomId],
  );
  const charOf = (u: string) =>
    a.rows.find((x) => x.user_id === u)!.character_id;
  const userOf = (c: string) =>
    a.rows.find((x) => x.character_id === c)!.user_id;
  return { roomId, charOf, userOf };
}

const startRound = (roomId: string) =>
  call(gm, "start_round", { p_room: roomId });
const nextRound = async (roomId: string) => {
  await call(gm, "end_round", { p_room: roomId });
  await startRound(roomId);
};

const say = (
  actor: Actor,
  roomId: string,
  body: string,
  extra: Record<string, unknown> = {},
) => call(actor, "send_message", { p_room: roomId, p_body: body, ...extra });

async function bodiesFor(actor: Actor, roomId: string) {
  const r = await rows(
    actor,
    "select body from public.room_messages where room_id = $1 and kind = 'chat' order by id",
    [roomId],
  );
  return r.map((x) => x.body as string);
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

// ---------------------------------------------------------------------------
describe("귓속말", () => {
  it("보낸 사람, 받는 사람, GM 만 읽고 나머지는 어떤 경로로도 읽지 못한다", async () => {
    const { roomId, charOf, userOf } = await newGame();
    await startRound(roomId);
    const [a, b, c] = PLAYERS;
    await say(player(a), roomId, "비밀 이야기", {
      p_channel: "whisper",
      p_target: charOf(b),
    });
    await say(player(a), roomId, "공개 이야기");

    expect(await bodiesFor(player(a), roomId)).toContain("비밀 이야기");
    expect(await bodiesFor(player(b), roomId)).toContain("비밀 이야기");
    expect(await bodiesFor(gm, roomId)).toContain("비밀 이야기");
    expect(await bodiesFor(player(c), roomId)).toEqual(["공개 이야기"]);
    expect(await bodiesFor(player(OUTSIDER), roomId)).toEqual([]);

    // 받는 사람 목록도 본인 행만 보인다
    expect(
      (await rows(player(c), "select * from public.room_message_audience"))
        .length,
    ).toBe(0);
    expect(
      (
        await rows(
          player(b),
          "select user_id from public.room_message_audience",
        )
      ).map((r) => r.user_id),
    ).toEqual([b]);
    expect(userOf(charOf(b))).toBe(b);
  });

  it("메시지에는 대상 인물만 남고 보낸 계정은 남지 않는다", async () => {
    const { roomId, charOf } = await newGame();
    await startRound(roomId);
    await say(player(P1), roomId, "속닥", {
      p_channel: "whisper",
      p_target: charOf(P2),
    });
    const [m] = await rows(
      player(P2),
      "select * from public.room_messages where channel = 'whisper'",
    );
    expect(m.character_id).toBe(charOf(P1));
    expect(m.target_character_id).toBe(charOf(P2));
    expect(JSON.stringify(m)).not.toContain(P1);
  });

  it("자기 자신·없는 인물에게는 보낼 수 없고, GM 은 귓속말을 할 수 없다", async () => {
    const { roomId, charOf } = await newGame();
    await startRound(roomId);
    await expect(
      say(player(P1), roomId, "x", {
        p_channel: "whisper",
        p_target: charOf(P1),
      }),
    ).rejects.toThrow(/invalid_target/);
    await expect(
      say(player(P1), roomId, "x", {
        p_channel: "whisper",
        p_target: "99999999-9999-4999-8999-999999999999",
      }),
    ).rejects.toThrow(/invalid_target/);
    await expect(
      say(gm, roomId, "x", { p_channel: "whisper", p_target: charOf(P1) }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      say(player(OUTSIDER), roomId, "x", {
        p_channel: "whisper",
        p_target: charOf(P1),
      }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      say(player(P1), roomId, "x", { p_channel: "secret" }),
    ).rejects.toThrow(/invalid_message/);
  });

  it("라운드가 허용한 채팅 방식만 쓸 수 있다", async () => {
    const { roomId, charOf } = await newGame();
    await startRound(roomId); // R1: 전체 + 귓속말
    await say(player(P1), roomId, "전체 OK");

    await nextRound(roomId); // R2: 전체만
    await say(player(P1), roomId, "전체 OK 2");
    await expect(
      say(player(P1), roomId, "귓속말", {
        p_channel: "whisper",
        p_target: charOf(P2),
      }),
    ).rejects.toThrow(/whisper_not_allowed/);

    await nextRound(roomId); // R3: 귓속말만
    await expect(say(player(P1), roomId, "전체")).rejects.toThrow(
      /chat_not_allowed/,
    );
    await say(player(P1), roomId, "귓속말 OK", {
      p_channel: "whisper",
      p_target: charOf(P2),
    });
  });

  it("직접 쓰거나 고칠 수 없다", async () => {
    const { roomId } = await newGame();
    expect(
      await errorOf(db, player(P1), (tx) =>
        tx.query(
          "insert into public.room_message_audience (message_id, user_id) values (1, $1)",
          [P1],
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await errorOf(db, player(P1), (tx) =>
        tx.query(
          "insert into public.room_messages (room_id, kind, channel, body) values ($1, 'system', 'all', 'x')",
          [roomId],
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await errorOf(db, player(P1), (tx) =>
        tx.query("update public.room_players set muted = false"),
      ),
    ).toMatch(/permission denied/);
  });
});

// ---------------------------------------------------------------------------
describe("그룹 채팅", () => {
  async function groupGame() {
    const g = await newGame();
    await startRound(g.roomId);
    return g;
  }

  it("멤버와 GM 만 그룹 메시지를 읽는다", async () => {
    const { roomId, charOf } = await groupGame();
    const gid = await call<string>(player(P1), "create_group", {
      p_room: roomId,
      p_name: "작전회의",
      p_secret: true,
      p_characters: [charOf(P2)],
    });
    await say(player(P2), roomId, "그룹 이야기", {
      p_channel: "group",
      p_group: gid,
    });

    expect(await bodiesFor(player(P1), roomId)).toContain("그룹 이야기");
    expect(await bodiesFor(player(P2), roomId)).toContain("그룹 이야기");
    expect(await bodiesFor(gm, roomId)).toContain("그룹 이야기");
    expect(await bodiesFor(player(P3), roomId)).toEqual([]);
    expect(await bodiesFor(player(OUTSIDER), roomId)).toEqual([]);
  });

  it("멤버가 아니면 그 그룹으로 말할 수 없다", async () => {
    const { roomId, charOf } = await groupGame();
    const gid = await call<string>(player(P1), "create_group", {
      p_room: roomId,
      p_name: "둘만",
      p_secret: false,
      p_characters: [charOf(P2)],
    });
    await expect(
      say(player(P3), roomId, "끼어들기", { p_channel: "group", p_group: gid }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      say(player(P3), roomId, "x", { p_channel: "group" }),
    ).rejects.toThrow(/forbidden/);
  });

  it("비밀 그룹은 멤버와 GM 에게만 보이고, 공개 그룹은 모두에게 보인다", async () => {
    const { roomId, charOf } = await groupGame();
    await call(player(P1), "create_group", {
      p_room: roomId,
      p_name: "비밀",
      p_secret: true,
      p_characters: [charOf(P2)],
    });
    await call(player(P1), "create_group", {
      p_room: roomId,
      p_name: "공개",
      p_secret: false,
      p_characters: [charOf(P2)],
    });
    const names = async (a: Actor) =>
      (await call<{ name: string }[]>(a, "get_groups", { p_room: roomId })).map(
        (g) => g.name,
      );

    expect(await names(player(P1))).toEqual(["비밀", "공개"]);
    expect(await names(player(P2))).toEqual(["비밀", "공개"]);
    expect(await names(player(P3))).toEqual(["공개"]);
    expect(await names(gm)).toEqual(["비밀", "공개"]);
    await expect(
      call(player(OUTSIDER), "get_groups", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
    // 그룹 테이블은 직접 읽을 수 없다
    expect(
      await errorOf(db, player(P3), (tx) =>
        tx.query("select * from public.room_groups"),
      ),
    ).toMatch(/permission denied/);
    expect(
      await errorOf(db, player(P3), (tx) =>
        tx.query("select * from public.room_group_members"),
      ),
    ).toMatch(/permission denied/);
  });

  it("공개 그룹은 스스로 들어갈 수 있지만 비밀 그룹은 들어갈 수 없다", async () => {
    const { roomId, charOf } = await groupGame();
    const open = await call<string>(player(P1), "create_group", {
      p_room: roomId,
      p_name: "공개",
      p_secret: false,
      p_characters: [charOf(P2)],
    });
    const secret = await call<string>(player(P1), "create_group", {
      p_room: roomId,
      p_name: "비밀",
      p_secret: true,
      p_characters: [charOf(P2)],
    });
    await expect(
      call(player(P3), "join_group", { p_group: secret }),
    ).rejects.toThrow(/forbidden/);
    await call(player(P3), "join_group", { p_group: open });
    await say(player(P3), roomId, "합류", {
      p_channel: "group",
      p_group: open,
    });
    expect(await bodiesFor(player(P1), roomId)).toContain("합류");
  });

  it("멤버 관리는 만든 사람만 하고, 빠진 사람은 이후 메시지를 읽지 못한다", async () => {
    const { roomId, charOf } = await groupGame();
    const gid = await call<string>(player(P1), "create_group", {
      p_room: roomId,
      p_name: "모임",
      p_secret: true,
      p_characters: [charOf(P2)],
    });
    await expect(
      call(player(P2), "add_group_member", {
        p_group: gid,
        p_character: charOf(P3),
      }),
    ).rejects.toThrow(/forbidden/);

    await call(player(P1), "add_group_member", {
      p_group: gid,
      p_character: charOf(P3),
    });
    await say(player(P1), roomId, "셋이서", {
      p_channel: "group",
      p_group: gid,
    });
    expect(await bodiesFor(player(P3), roomId)).toContain("셋이서");

    await expect(
      call(player(P2), "remove_group_member", {
        p_group: gid,
        p_character: charOf(P3),
      }),
    ).rejects.toThrow(/forbidden/);
    await call(player(P1), "remove_group_member", {
      p_group: gid,
      p_character: charOf(P3),
    });
    await say(player(P1), roomId, "둘만 남음", {
      p_channel: "group",
      p_group: gid,
    });
    expect(await bodiesFor(player(P3), roomId)).not.toContain("둘만 남음");
    await expect(
      say(player(P3), roomId, "다시", { p_channel: "group", p_group: gid }),
    ).rejects.toThrow(/forbidden/);
  });

  it("만든 사람이 나가면 다른 멤버가 관리자가 된다", async () => {
    const { roomId, charOf } = await groupGame();
    const gid = await call<string>(player(P1), "create_group", {
      p_room: roomId,
      p_name: "모임",
      p_secret: false,
      p_characters: [charOf(P2)],
    });
    await call(player(P1), "leave_group", { p_group: gid });
    await call(player(P2), "add_group_member", {
      p_group: gid,
      p_character: charOf(P3),
    });
    const [g] = await call<{ isOwner: boolean; members: string[] }[]>(
      player(P2),
      "get_groups",
      { p_room: roomId },
    );
    expect(g.isOwner).toBe(true);
    expect(g.members).toHaveLength(2);
  });

  it("잘못된 그룹은 만들 수 없다", async () => {
    const { roomId, charOf } = await groupGame();
    const create = (over: Record<string, unknown>) =>
      call(player(P1), "create_group", {
        p_room: roomId,
        p_name: "그룹",
        p_secret: false,
        p_characters: [charOf(P2)],
        ...over,
      });
    await expect(create({ p_characters: [] })).rejects.toThrow(/invalid_group/);
    await expect(create({ p_characters: [charOf(P1)] })).rejects.toThrow(
      /invalid_group/,
    );
    await expect(
      create({ p_characters: ["99999999-9999-4999-8999-999999999999"] }),
    ).rejects.toThrow(/invalid_group/);
    await expect(create({ p_name: "  " })).rejects.toThrow(/invalid_group/);
    await expect(create({ p_name: "가".repeat(21) })).rejects.toThrow(
      /invalid_group/,
    );
    await expect(
      call(player(OUTSIDER), "create_group", {
        p_room: roomId,
        p_name: "x",
        p_secret: false,
        p_characters: [charOf(P2)],
      }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(gm, "create_group", {
        p_room: roomId,
        p_name: "x",
        p_secret: false,
        p_characters: [charOf(P2)],
      }),
    ).rejects.toThrow(/forbidden/);
  });

  it("한 사람이 만들 수 있는 그룹은 3개까지다", async () => {
    const { roomId } = await groupGame();
    const { charOf } = await (async () => {
      const a = await db.query<{ user_id: string; character_id: string }>(
        "select user_id, character_id from public.room_assignments where room_id = $1",
        [roomId],
      );
      return {
        charOf: (u: string) =>
          a.rows.find((x) => x.user_id === u)!.character_id,
      };
    })();
    for (let i = 0; i < 3; i++)
      await call(player(P1), "create_group", {
        p_room: roomId,
        p_name: `g${i}`,
        p_secret: false,
        p_characters: [charOf(P2)],
      });
    await expect(
      call(player(P1), "create_group", {
        p_room: roomId,
        p_name: "g3",
        p_secret: false,
        p_characters: [charOf(P2)],
      }),
    ).rejects.toThrow(/too_many_groups/);
  });
});

// ---------------------------------------------------------------------------
describe("GM 채팅 제어", () => {
  it("채팅을 막으면 참가자는 말할 수 없고 GM 공지는 가능하다", async () => {
    const { roomId, charOf } = await newGame();
    await startRound(roomId);
    await call(gm, "set_chat_blocked", { p_room: roomId, p_blocked: true });
    await expect(say(player(P1), roomId, "x")).rejects.toThrow(/chat_blocked/);
    await expect(
      say(player(P1), roomId, "x", {
        p_channel: "whisper",
        p_target: charOf(P2),
      }),
    ).rejects.toThrow(/chat_blocked/);
    await say(gm, roomId, "조용히");

    await call(gm, "set_chat_blocked", { p_room: roomId, p_blocked: false });
    await say(player(P1), roomId, "다시 말함");
  });

  it("GM 만 채팅을 막거나 음소거할 수 있다", async () => {
    const { roomId } = await newGame();
    await startRound(roomId);
    await expect(
      call(player(P1), "set_chat_blocked", { p_room: roomId, p_blocked: true }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(P1), "set_muted", {
        p_room: roomId,
        p_user: P2,
        p_muted: true,
      }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(P1), "set_whisper_notice", { p_room: roomId, p_on: true }),
    ).rejects.toThrow(/forbidden/);
  });

  it("음소거한 참가자만 말할 수 없다", async () => {
    const { roomId } = await newGame();
    await startRound(roomId);
    await call(gm, "set_muted", { p_room: roomId, p_user: P1, p_muted: true });
    await expect(say(player(P1), roomId, "x")).rejects.toThrow(/muted/);
    await say(player(P2), roomId, "나는 말할 수 있음");

    await call(gm, "set_muted", { p_room: roomId, p_user: P1, p_muted: false });
    await say(player(P1), roomId, "풀림");
    await expect(
      call(gm, "set_muted", {
        p_room: roomId,
        p_user: OUTSIDER,
        p_muted: true,
      }),
    ).rejects.toThrow(/player not found/);
  });

  it("귓속말 알림을 켜면 전체에게 알림이 가고, 내용은 새지 않는다", async () => {
    const { roomId, charOf } = await newGame();
    await startRound(roomId);
    await say(player(P1), roomId, "알림 없음", {
      p_channel: "whisper",
      p_target: charOf(P2),
    });
    const notices = async () =>
      (
        await rows(
          player(P3),
          "select body from public.room_messages where kind = 'system' and body like '누군가%'",
        )
      ).length;
    expect(await notices()).toBe(0);

    await call(gm, "set_whisper_notice", { p_room: roomId, p_on: true });
    await say(player(P1), roomId, "비밀 하나", {
      p_channel: "whisper",
      p_target: charOf(P2),
    });
    await say(player(P2), roomId, "비밀 둘", {
      p_channel: "whisper",
      p_target: charOf(P1),
    });
    expect(await notices()).toBe(1); // 20초 안에는 한 번만
    expect(await bodiesFor(player(P3), roomId)).toEqual([]);
  });

  it("종료 후에는 결말을 끝까지 공개해야 참가자가 전체 로그를 본다", async () => {
    const { roomId, charOf } = await newGame();
    await startRound(roomId);
    await say(player(P1), roomId, "지난 귓속말", {
      p_channel: "whisper",
      p_target: charOf(P2),
    });
    await call(gm, "end_round", { p_room: roomId });
    await call(gm, "finish_game", { p_room: roomId });

    expect(await bodiesFor(player(P3), roomId)).toEqual([]);
    await call(gm, "advance_ending", { p_room: roomId }); // 2
    expect(await bodiesFor(player(P3), roomId)).toEqual([]);
    await call(gm, "advance_ending", { p_room: roomId }); // 3
    expect(await bodiesFor(player(P3), roomId)).toContain("지난 귓속말");
    expect(await bodiesFor(player(OUTSIDER), roomId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("미션", () => {
  async function missionGame() {
    const g = await newGame();
    await startRound(g.roomId);
    return g;
  }

  it("내 개인 미션과 공통 미션만 보이고 숨김 미션은 보이지 않는다", async () => {
    const { roomId, charOf } = await missionGame();
    const butler = PLAYERS.find((u) => charOf(u) === C_BUTLER)!;
    const maid = PLAYERS.find((u) => charOf(u) === C_MAID)!;
    const culprit = PLAYERS.find((u) => charOf(u) === C_CULPRIT)!;

    const titles = async (u: string) =>
      (
        await call<{ title: string }[]>(player(u), "get_my_missions", {
          p_room: roomId,
        })
      ).map((m) => m.title);

    expect(await titles(butler)).toEqual([
      "집사의 미션",
      "공통 미션",
      "GM 판정 미션",
    ]);
    expect(await titles(culprit)).toEqual(["공통 미션", "GM 판정 미션"]);
    const maidMissions = JSON.stringify(
      await call(player(maid), "get_my_missions", { p_room: roomId }),
    );
    expect(maidMissions).not.toContain("숨겨진 미션");
    expect(maidMissions).not.toContain("DESC-숨김");
    expect(maidMissions).not.toContain("집사의 미션");
  });

  it("GM·방 밖 사용자·대기실에서는 내 미션을 받을 수 없다", async () => {
    const { roomId } = await missionGame();
    await expect(
      call(gm, "get_my_missions", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(OUTSIDER), "get_my_missions", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);

    await db.query("delete from public.rooms where gm_id = $1", [GM]);
    const { roomId: lobby, code } = await call<{
      roomId: string;
      code: string;
    }>(gm, "create_room", { p_version_id: VERSION });
    await call(player(P1), "join_room", { p_code: code, p_nickname: "x" });
    await expect(
      call(player(P1), "get_my_missions", { p_room: lobby }),
    ).rejects.toThrow(/invalid_state/);
  });

  it("자가 보고 미션만 보고할 수 있고, 남의 미션·숨김·GM 판정 미션은 보고할 수 없다", async () => {
    const { roomId, charOf } = await missionGame();
    const butler = PLAYERS.find((u) => charOf(u) === C_BUTLER)!;
    const culprit = PLAYERS.find((u) => charOf(u) === C_CULPRIT)!;
    const report = (u: string, m: string) =>
      call(player(u), "report_mission", { p_room: roomId, p_mission: m });

    await expect(report(culprit, M_PERSONAL)).rejects.toThrow(
      /mission not found/,
    );
    await expect(report(butler, M_HIDDEN)).rejects.toThrow(/mission not found/);
    await expect(report(butler, M_GM)).rejects.toThrow(
      /mission_not_reportable/,
    );

    await report(butler, M_PERSONAL);
    const mine = await call<{ id: string; status: string }[]>(
      player(butler),
      "get_my_missions",
      { p_room: roomId },
    );
    expect(mine.find((m) => m.id === M_PERSONAL)?.status).toBe("reported");
    // 이미 보고한 미션은 다시 보고할 수 없다
    await expect(report(butler, M_PERSONAL)).rejects.toThrow(/invalid_state/);
    await expect(
      call(gm, "report_mission", { p_room: roomId, p_mission: M_PERSONAL }),
    ).rejects.toThrow(/forbidden/);
  });

  it("공통 미션은 누가 보고해도 모두에게 같은 상태로 보인다", async () => {
    const { roomId } = await missionGame();
    await call(player(P1), "report_mission", {
      p_room: roomId,
      p_mission: M_COMMON,
    });
    for (const u of PLAYERS) {
      const list = await call<{ id: string; status: string }[]>(
        player(u),
        "get_my_missions",
        { p_room: roomId },
      );
      expect(list.find((m) => m.id === M_COMMON)?.status).toBe("reported");
    }
  });

  it("GM 만 미션 결과를 정하고 전체 현황(숨김 포함)을 본다", async () => {
    const { roomId } = await missionGame();
    await expect(
      call(player(P1), "set_mission_status", {
        p_room: roomId,
        p_mission: M_GM,
        p_status: "done",
      }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(P1), "get_gm_missions", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(gm, "set_mission_status", {
        p_room: roomId,
        p_mission: M_GM,
        p_status: "bogus",
      }),
    ).rejects.toThrow(/invalid_status/);
    await expect(
      call(gm, "set_mission_status", {
        p_room: roomId,
        p_mission: "99999999-9999-4999-8999-999999999999",
        p_status: "done",
      }),
    ).rejects.toThrow(/mission not found/);

    await call(gm, "set_mission_status", {
      p_room: roomId,
      p_mission: M_HIDDEN,
      p_status: "done",
    });
    const all = await call<
      {
        id: string;
        hidden: boolean;
        status: string;
        characterName: string | null;
      }[]
    >(gm, "get_gm_missions", { p_room: roomId });
    expect(all).toHaveLength(4);
    const hidden = all.find((m) => m.id === M_HIDDEN)!;
    expect(hidden).toMatchObject({
      hidden: true,
      status: "done",
      characterName: "하녀",
    });
  });

  it("GM 은 승인 대기 보고 수를 개요에서 본다", async () => {
    const { roomId, charOf } = await missionGame();
    const butler = PLAYERS.find((u) => charOf(u) === C_BUTLER)!;
    await call(player(butler), "report_mission", {
      p_room: roomId,
      p_mission: M_PERSONAL,
    });
    const gmView = await call<{ missionReports?: number }>(
      gm,
      "get_room_overview",
      { p_room: roomId },
    );
    expect(gmView.missionReports).toBe(1);
    const pView = await call<Record<string, unknown>>(
      player(P1),
      "get_room_overview",
      { p_room: roomId },
    );
    expect(pView).not.toHaveProperty("missionReports");
  });
});

// ---------------------------------------------------------------------------
describe("결말 판정", () => {
  type Ctx = ReturnType<typeof newGame> extends Promise<infer T> ? T : never;

  /** 투표 단계로 보낸 뒤 표를 던진다. ballots: [투표자 인물, 대상 인물] */
  async function voteGame(ballots: [string, string][]) {
    const g: Ctx = await newGame();
    await startRound(g.roomId);
    await call(gm, "start_vote", { p_room: g.roomId });
    for (const [voter, target] of ballots)
      await call(player(g.userOf(voter)), "cast_vote", {
        p_room: g.roomId,
        p_target: target,
      });
    return g;
  }

  const CAUGHT: [string, string][] = [
    [C_BUTLER, C_CULPRIT],
    [C_MAID, C_CULPRIT],
    [C_CULPRIT, C_BUTLER],
  ];
  const ESCAPED: [string, string][] = [
    [C_CULPRIT, C_MAID],
    [C_BUTLER, C_MAID],
    [C_MAID, C_BUTLER],
  ];
  const TIE: [string, string][] = [
    [C_BUTLER, C_CULPRIT],
    [C_CULPRIT, C_MAID],
    [C_MAID, C_BUTLER],
  ];

  it("TS 판정 엔진과 같은 결과를 낸다 (투표 × 미션 조합 전체)", async () => {
    const rules: EndingRule[] = endings.map((e) => ({
      id: e.id,
      conditionKind: e.conditionKind as EndingRule["conditionKind"],
      conditionMissionId: e.conditionMissionId,
    }));

    for (const [label, ballots] of [
      ["잡음", CAUGHT],
      ["놓침", ESCAPED],
      ["동점", TIE],
      ["투표 없음", []],
    ] as const) {
      for (const hiddenDone of [false, true]) {
        for (const commonDone of [false, true]) {
          const g = await voteGame([...ballots]);
          if (hiddenDone)
            await call(gm, "set_mission_status", {
              p_room: g.roomId,
              p_mission: M_HIDDEN,
              p_status: "done",
            });
          if (commonDone)
            await call(gm, "set_mission_status", {
              p_room: g.roomId,
              p_mission: M_COMMON,
              p_status: "done",
            });

          const votes: Record<string, number> = {};
          for (const [, t] of ballots) votes[t] = (votes[t] ?? 0) + 1;
          const expected = resolveEnding(rules, {
            votes,
            culpritIds: new Set([C_CULPRIT]),
            doneMissionIds: new Set([
              ...(hiddenDone ? [M_HIDDEN] : []),
              ...(commonDone ? [M_COMMON] : []),
            ]),
            missionIds: new Set([M_PERSONAL, M_COMMON, M_HIDDEN, M_GM]),
          });

          const preview = await call<{ endingId: string }>(
            gm,
            "preview_ending",
            { p_room: g.roomId },
          );
          expect(
            preview.endingId,
            `${label} hidden=${hiddenDone} common=${commonDone}`,
          ).toBe(expected);

          // 결말을 지정하지 않으면 같은 결말로 끝난다
          await call(gm, "finish_game", { p_room: g.roomId });
          const [room] = await rows(
            gm,
            "select ending_id from public.rooms where id = $1",
            [g.roomId],
          );
          expect(room.ending_id).toBe(expected);
        }
      }
    }
  }, 120_000);

  it("GM 이 결말을 직접 지정하면 판정보다 우선한다", async () => {
    const g = await voteGame(CAUGHT);
    await call(gm, "finish_game", { p_room: g.roomId, p_ending_id: E_DEFAULT });
    const [room] = await rows(
      gm,
      "select ending_id from public.rooms where id = $1",
      [g.roomId],
    );
    expect(room.ending_id).toBe(E_DEFAULT);
  });

  it("판정 미리보기는 GM 만, 투표·휴식 단계에서만 쓸 수 있다", async () => {
    const g = await voteGame(CAUGHT);
    await expect(
      call(player(P1), "preview_ending", { p_room: g.roomId }),
    ).rejects.toThrow(/forbidden/);

    const lobby = await newGame();
    await expect(
      call(gm, "preview_ending", { p_room: lobby.roomId }),
    ).rejects.toThrow(/invalid_state/);
  });

  it("미션 달성표는 결말 2단계부터, 숨김 미션도 이때 공개된다", async () => {
    const g = await voteGame(CAUGHT);
    await call(gm, "set_mission_status", {
      p_room: g.roomId,
      p_mission: M_HIDDEN,
      p_status: "done",
    });
    await call(gm, "finish_game", { p_room: g.roomId });

    const step1 = await call<Record<string, unknown>>(
      player(P1),
      "get_ending",
      {
        p_room: g.roomId,
      },
    );
    expect(step1).not.toHaveProperty("missions");
    expect(JSON.stringify(step1)).not.toContain("숨겨진 미션");

    await call(gm, "advance_ending", { p_room: g.roomId });
    const step2 = await call<{
      missions: { title: string; character: string | null; status: string }[];
      culpritCaught: boolean;
      ending: { name: string };
    }>(player(P1), "get_ending", { p_room: g.roomId });
    expect(step2.ending.name).toBe("숨은 미션 결말");
    expect(step2.culpritCaught).toBe(true);
    expect(step2.missions).toHaveLength(4);
    expect(step2.missions.find((m) => m.title === "숨겨진 미션")).toEqual({
      title: "숨겨진 미션",
      scope: "personal",
      character: "하녀",
      status: "done",
    });

    // 후일담은 판정된 결말의 것만 나온다
    await call(gm, "advance_ending", { p_room: g.roomId });
    const step3 = await call<{ epilogues: { name: string; text: string }[] }>(
      player(P1),
      "get_ending",
      { p_room: g.roomId },
    );
    expect(step3.epilogues).toEqual([{ name: "하녀", text: "EPI-하녀-숨은" }]);
  });

  it("같은 시나리오라도 미션 결과에 따라 다른 후일담이 나온다", async () => {
    const epilogueOf = async (hiddenDone: boolean) => {
      const g = await voteGame(CAUGHT);
      await call(gm, "set_mission_status", {
        p_room: g.roomId,
        p_mission: M_COMMON,
        p_status: "done",
      });
      if (hiddenDone)
        await call(gm, "set_mission_status", {
          p_room: g.roomId,
          p_mission: M_HIDDEN,
          p_status: "done",
        });
      await call(gm, "finish_game", { p_room: g.roomId });
      await call(gm, "advance_ending", { p_room: g.roomId });
      await call(gm, "advance_ending", { p_room: g.roomId });
      const e = await call<{ epilogues: { text: string }[] }>(
        player(P1),
        "get_ending",
        { p_room: g.roomId },
      );
      return e.epilogues.map((x) => x.text);
    };
    expect(await epilogueOf(true)).toEqual(["EPI-하녀-숨은"]);
    expect(await epilogueOf(false)).toEqual(["EPI-정원사-검거"]);
  });
});
