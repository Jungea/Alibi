import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, errorOf, type Actor } from "./helpers/db";
import { createFakeSupabase } from "./helpers/fake-supabase";

const GM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";

const SCENARIO = "a0000000-0000-4000-8000-000000000001";
const VERSION = "a0000000-0000-4000-8000-0000000000a1";

const C_BUTLER = "c0000000-0000-4000-8000-000000000002";
const C_CULPRIT = "c0000000-0000-4000-8000-000000000001";
const C_MAID = "c0000000-0000-4000-8000-000000000003";

const R1 = "d0000000-0000-4000-8000-000000000001";
const R2 = "d0000000-0000-4000-8000-000000000002";
const R3 = "d0000000-0000-4000-8000-000000000003";

const CLUE_PUBLIC = "e0000000-0000-4000-8000-000000000001";
const CLUE_PRIVATE = "e0000000-0000-4000-8000-000000000002";
const CLUE_R2_ONLY = "e0000000-0000-4000-8000-000000000003";

const E1 = "f0000000-0000-4000-8000-000000000001";
const E2 = "f0000000-0000-4000-8000-000000000002";

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
    {
      id: C_BUTLER,
      name: "집사",
      publicInfo: "오래 일한 집사",
      secretInfo: "SECRET-집사",
      background: "BG-집사",
      personalGoal: "GOAL-집사",
      roleType: "suspect",
      liePolicy: "partial",
      lieNote: "",
      relations: [{ targetId: C_MAID, description: "REL-하녀를 아낀다" }],
      roundInfos: { [R1]: "INFO-집사-1", [R2]: "INFO-집사-2" },
    },
    {
      id: C_CULPRIT,
      name: "정원사",
      publicInfo: "정원을 가꾼다",
      secretInfo: "SECRET-범인",
      background: "",
      personalGoal: "GOAL-범인",
      roleType: "culprit",
      liePolicy: "free",
      lieNote: "",
      relations: [],
      roundInfos: {},
    },
    {
      id: C_MAID,
      name: "하녀",
      publicInfo: "새로 온 하녀",
      secretInfo: "SECRET-하녀",
      background: "",
      personalGoal: "",
      roleType: "witness",
      liePolicy: "none",
      lieNote: "",
      relations: [],
      roundInfos: {},
    },
  ],
  rounds: [
    {
      id: R1,
      name: "탐색",
      goal: "단서를 찾는다",
      timeLimitSeconds: 600,
      allowedActions: ["chat", "draw_card"],
      unlockContent: "UNLOCK-1",
    },
    {
      id: R2,
      name: "토론",
      goal: "",
      timeLimitSeconds: null,
      allowedActions: ["chat"],
      unlockContent: "UNLOCK-2",
    },
    {
      id: R3,
      name: "투표",
      goal: "",
      timeLimitSeconds: 180,
      allowedActions: ["vote"],
      unlockContent: "UNLOCK-3",
    },
  ],
  clues: [
    {
      id: CLUE_PUBLIC,
      title: "공개 단서",
      body: "PUBLIC-BODY",
      kind: "evidence",
      acquireRoundId: R1,
      visibility: "everyone",
      isTrue: true,
    },
    {
      id: CLUE_PRIVATE,
      title: "비밀 단서",
      body: "PRIVATE-BODY",
      kind: "testimony",
      acquireRoundId: null,
      visibility: "acquirer",
      isTrue: false,
    },
    {
      id: CLUE_R2_ONLY,
      title: "토론 단서",
      body: "R2-BODY",
      kind: "document",
      acquireRoundId: R2,
      visibility: "acquirer",
      isTrue: true,
    },
  ],
  endings: [
    {
      id: E1,
      name: "진실 결말",
      conditionKind: "default",
      resultText: "RESULT-1",
      truthText: "TRUTH-범인은 정원사",
      epilogues: {
        [C_BUTLER]: "EPI-집사",
        [C_CULPRIT]: "EPI-정원사",
      },
    },
    {
      id: E2,
      name: "다른 결말",
      conditionKind: "default",
      resultText: "RESULT-2",
      truthText: "TRUTH-2",
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

async function rows(actor: Actor, sql: string, params: unknown[] = []) {
  const r = await as(db, actor, (tx) => tx.query(sql, params));
  return r.rows as Record<string, unknown>[];
}

/** 3명이 입장해 강제 시작(인물 확인 단계)까지 진행한 방. 쓰고 난 방은 다음 호출에서 정리한다. */
async function newGame() {
  await db.query("delete from public.rooms where gm_id = $1", [GM]);
  const { roomId, code } = await call<{ roomId: string; code: string }>(
    gm,
    "create_room",
    { p_version_id: VERSION },
  );
  for (const [i, u] of [P1, P2, P3].entries()) {
    await call(player(u), "join_room", { p_code: code, p_nickname: `p${i}` });
  }
  await call(gm, "start_game", { p_room: roomId, p_force: true });
  const a = await db.query<{ user_id: string; character_id: string }>(
    "select user_id, character_id from public.room_assignments where room_id = $1",
    [roomId],
  );
  const charOf = (u: string) =>
    a.rows.find((x) => x.user_id === u)!.character_id;
  return { roomId, charOf };
}

const startRound = (roomId: string) =>
  call(gm, "start_round", { p_room: roomId });

async function messages(roomId: string) {
  return rows(
    gm,
    "select kind, character_id, body from public.room_messages where room_id = $1 order by id",
    [roomId],
  );
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

describe("내 인물 카드", () => {
  it("본인의 비밀 정보와 목표를 받고 다른 인물의 비밀은 받지 않는다", async () => {
    const { roomId, charOf } = await newGame();
    for (const u of [P1, P2, P3]) {
      const card = await call<Record<string, unknown>>(
        player(u),
        "get_my_character",
        { p_room: roomId },
      );
      expect(card.id).toBe(charOf(u));
      const text = JSON.stringify(card);
      const mine = snapshot.characters.find((c) => c.id === charOf(u))!;
      expect(text).toContain(mine.secretInfo);
      for (const other of snapshot.characters.filter((c) => c.id !== mine.id))
        expect(text, other.name).not.toContain(other.secretInfo);
      expect(text).not.toContain("TRUTH");
    }
  });

  it("관계는 상대 이름으로, 라운드 추가 정보는 시작한 라운드까지만 준다", async () => {
    const { roomId, charOf } = await newGame();
    const butler = [P1, P2, P3].find((u) => charOf(u) === C_BUTLER)!;
    let card = await call<{
      relations: { targetName: string }[];
      roundInfos: { text: string }[];
    }>(player(butler), "get_my_character", { p_room: roomId });
    expect(card.relations[0].targetName).toBe("하녀");
    expect(card.roundInfos).toEqual([]);

    await startRound(roomId);
    card = await call(player(butler), "get_my_character", { p_room: roomId });
    expect(card.roundInfos.map((r) => r.text)).toEqual(["INFO-집사-1"]);
    expect(JSON.stringify(card)).not.toContain("INFO-집사-2");
  });

  it("대기실, 방 밖 사용자, GM 은 받을 수 없다", async () => {
    const { roomId } = await newGame();
    await expect(
      call(player(OUTSIDER), "get_my_character", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(gm, "get_my_character", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
  });

  it("GM 진행 자료는 GM 만 받는다", async () => {
    const { roomId } = await newGame();
    const guide = await call<{ endings: unknown[] }>(gm, "get_gm_guide", {
      p_room: roomId,
    });
    expect(guide.endings).toHaveLength(2);
    await expect(
      call(player(P1), "get_gm_guide", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
  });
});

describe("힌트 카드", () => {
  it("라운드 밖이거나 뽑기가 허용되지 않은 라운드에서는 뽑을 수 없다", async () => {
    const { roomId } = await newGame();
    await expect(
      call(player(P1), "draw_card", { p_room: roomId }),
    ).rejects.toThrow(/invalid_state/);
    await startRound(roomId); // R1: 뽑기 허용
    await call(gm, "end_round", { p_room: roomId });
    await startRound(roomId); // R2: chat 만
    await expect(
      call(player(P1), "draw_card", { p_room: roomId }),
    ).rejects.toThrow(/action_not_allowed/);
  });

  it("GM 과 방 밖 사용자는 뽑을 수 없다", async () => {
    const { roomId } = await newGame();
    await startRound(roomId);
    await expect(call(gm, "draw_card", { p_room: roomId })).rejects.toThrow(
      /forbidden/,
    );
    await expect(
      call(player(OUTSIDER), "draw_card", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
  });

  it("획득 라운드가 다른 힌트는 뽑히지 않고, 같은 힌트는 두 번 나오지 않는다", async () => {
    const { roomId } = await newGame();
    await startRound(roomId);
    const got: string[] = [];
    for (const u of [P1, P2]) {
      const c = await call<{ id: string }>(player(u), "draw_card", {
        p_room: roomId,
      });
      got.push(c.id);
    }
    expect(new Set(got).size).toBe(2);
    expect(got).not.toContain(CLUE_R2_ONLY);
    // R1 에서 뽑을 수 있는 건 2장뿐이다
    await expect(
      call(player(P3), "draw_card", { p_room: roomId }),
    ).rejects.toThrow(/no_clues/);
  });

  it("미획득 힌트는 보이지 않고, 개인 힌트는 획득자에게만 보인다", async () => {
    const { roomId } = await newGame();
    await startRound(roomId);
    expect(
      await call<unknown[]>(player(P1), "get_my_clues", { p_room: roomId }),
    ).toEqual([]);

    // 두 장을 모두 P1 이 뽑는다
    const a = await call<{ id: string }>(player(P1), "draw_card", {
      p_room: roomId,
    });
    const b = await call<{ id: string }>(player(P1), "draw_card", {
      p_room: roomId,
    });
    expect(new Set([a.id, b.id])).toEqual(new Set([CLUE_PUBLIC, CLUE_PRIVATE]));

    const mine = await call<{ id: string }[]>(player(P1), "get_my_clues", {
      p_room: roomId,
    });
    expect(mine).toHaveLength(2);

    const others = await call<{ id: string; body: string }[]>(
      player(P2),
      "get_my_clues",
      { p_room: roomId },
    );
    expect(others.map((c) => c.id)).toEqual([CLUE_PUBLIC]);
    expect(JSON.stringify(others)).not.toContain("PRIVATE-BODY");
    expect(JSON.stringify(others)).not.toContain("R2-BODY");
    expect(JSON.stringify(others)).not.toContain("isTrue");
  });

  it("GM 은 획득된 힌트의 참/거짓까지 보지만 미획득 힌트는 보지 못한다", async () => {
    const { roomId } = await newGame();
    await startRound(roomId);
    await call(player(P1), "draw_card", { p_room: roomId });
    const list = await call<
      { id: string; isTrue: boolean; holderName: string }[]
    >(gm, "get_my_clues", { p_room: roomId });
    expect(list).toHaveLength(1);
    expect(typeof list[0].isTrue).toBe("boolean");
    expect(list[0].holderName).toBeTruthy();
  });

  it("한 라운드에 한 사람이 뽑을 수 있는 횟수는 3장이다", async () => {
    // 이 시나리오는 라운드 1에서 뽑을 수 있는 카드가 2장이라 한도에 닿기 전에 소진된다.
    // 한도 자체는 카드가 충분한 방으로 확인한다.
    const { roomId } = await newGame();
    await db.query(
      `update public.scenario_versions
          set snapshot = jsonb_set(snapshot, '{clues}', snapshot -> 'clues' || $1::jsonb)
        where id = $2`,
      [
        JSON.stringify(
          [1, 2, 3].map((i) => ({
            id: `e0000000-0000-4000-8000-0000000001${i}0`,
            title: `추가${i}`,
            body: "x",
            kind: "other",
            acquireRoundId: null,
            visibility: "acquirer",
            isTrue: true,
          })),
        ),
        VERSION,
      ],
    );
    try {
      await startRound(roomId);
      for (let i = 0; i < 3; i++)
        await call(player(P1), "draw_card", { p_room: roomId });
      await expect(
        call(player(P1), "draw_card", { p_room: roomId }),
      ).rejects.toThrow(/draw_limit/);
    } finally {
      await db.query(
        "update public.scenario_versions set snapshot = $1::jsonb where id = $2",
        [JSON.stringify(snapshot), VERSION],
      );
    }
  });

  it("뽑으면 시스템 메시지가 남고 개인 힌트의 제목은 노출되지 않는다", async () => {
    const { roomId } = await newGame();
    await startRound(roomId);
    await call(player(P1), "draw_card", { p_room: roomId });
    const system = (await messages(roomId)).filter((m) => m.kind === "system");
    expect(system.map((m) => m.body).join("\n")).toMatch(/단서를 얻었습니다/);
    expect(system.map((m) => m.body).join("\n")).not.toContain("비밀 단서");
  });

  it("room_clues 는 누구도 직접 읽거나 쓸 수 없다", async () => {
    const { roomId } = await newGame();
    for (const actor of [gm, player(P1), player(OUTSIDER)]) {
      for (const sql of [
        "select * from public.room_clues",
        `insert into public.room_clues (room_id, clue_id, holder_id, is_public, round_index) values ('${roomId}', '${CLUE_PUBLIC}', '${P1}', true, 0)`,
      ]) {
        expect(await errorOf(db, actor, (tx) => tx.query(sql))).toMatch(
          /permission denied/,
        );
      }
    }
  });
});

describe("채팅", () => {
  it("인물 ID 로만 저장되어 참가자는 보낸 사람의 계정을 알 수 없다", async () => {
    const cols = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'room_messages'",
    );
    expect(cols.rows.map((c) => c.column_name).sort()).toEqual(
      ["body", "character_id", "created_at", "id", "kind", "room_id"].sort(),
    );
  });

  it("라운드가 채팅을 허용하면 보낼 수 있고 참가자 모두와 GM 이 읽는다", async () => {
    const { roomId, charOf } = await newGame();
    await startRound(roomId);
    await call(player(P1), "send_message", {
      p_room: roomId,
      p_body: "  안녕하세요  ",
    });
    for (const actor of [gm, player(P2), player(P1)]) {
      const msgs = await rows(
        actor,
        "select kind, character_id, body from public.room_messages where room_id = $1 and kind = 'chat'",
        [roomId],
      );
      expect(msgs).toEqual([
        { kind: "chat", character_id: charOf(P1), body: "안녕하세요" },
      ]);
    }
  });

  it("방 밖 사용자와 로그인하지 않은 요청은 읽지 못하고, 직접 쓰기도 막힌다", async () => {
    const { roomId } = await newGame();
    await startRound(roomId);
    await call(player(P1), "send_message", { p_room: roomId, p_body: "hi" });
    expect(
      await rows(player(OUTSIDER), "select 1 from public.room_messages"),
    ).toHaveLength(0);
    expect(
      await errorOf(db, { userId: null }, (tx) =>
        tx.query("select 1 from public.room_messages"),
      ),
    ).toMatch(/permission denied/);
    for (const actor of [player(P1), gm]) {
      expect(
        await errorOf(db, actor, (tx) =>
          tx.query(
            `insert into public.room_messages (room_id, kind, body) values ('${roomId}', 'system', 'fake')`,
          ),
        ),
      ).toMatch(/permission denied/);
    }
    await expect(
      call(player(OUTSIDER), "send_message", { p_room: roomId, p_body: "x" }),
    ).rejects.toThrow(/forbidden/);
  });

  it("대기실에서는 참가자가 말할 수 없고, 채팅이 막힌 라운드에서도 말할 수 없다", async () => {
    const { roomId } = await newGame();
    // 인물 확인 단계는 허용
    await call(player(P1), "send_message", { p_room: roomId, p_body: "ok" });
    await startRound(roomId);
    await call(gm, "end_round", { p_room: roomId });
    await startRound(roomId);
    await call(gm, "end_round", { p_room: roomId });
    await startRound(roomId); // R3: 투표 라운드, chat 없음
    await expect(
      call(player(P1), "send_message", { p_room: roomId, p_body: "no" }),
    ).rejects.toThrow(/chat_not_allowed/);

    const lobby = await call<{ roomId: string; code: string }>(
      gm,
      "create_room",
      {
        p_version_id: VERSION,
      },
    );
    await call(player(P1), "join_room", {
      p_code: lobby.code,
      p_nickname: "x",
    });
    await expect(
      call(player(P1), "send_message", { p_room: lobby.roomId, p_body: "no" }),
    ).rejects.toThrow(/invalid_state/);
  });

  it("빈 메시지, 너무 긴 메시지, 제어문자는 거부한다", async () => {
    const { roomId } = await newGame();
    for (const body of ["   ", "가".repeat(501), "a\u0007b"]) {
      await expect(
        call(player(P1), "send_message", { p_room: roomId, p_body: body }),
      ).rejects.toThrow(/invalid_message/);
    }
    // 줄바꿈은 허용
    await call(player(P1), "send_message", { p_room: roomId, p_body: "a\nb" });
  });

  it("5초 안에 5개를 넘기면 도배로 막는다", async () => {
    const { roomId } = await newGame();
    for (let i = 0; i < 5; i++)
      await call(player(P1), "send_message", {
        p_room: roomId,
        p_body: `m${i}`,
      });
    await expect(
      call(player(P1), "send_message", { p_room: roomId, p_body: "spam" }),
    ).rejects.toThrow(/rate_limited/);
    // 다른 참가자는 영향이 없다
    await call(player(P2), "send_message", { p_room: roomId, p_body: "ok" });
  });

  it("GM 은 공지로 말하고 시스템 메시지가 진행에 맞춰 남는다", async () => {
    const { roomId } = await newGame();
    await call(gm, "send_message", { p_room: roomId, p_body: "공지입니다" });
    await startRound(roomId);
    const all = await messages(roomId);
    expect(all.find((m) => m.kind === "gm")).toMatchObject({
      character_id: null,
      body: "공지입니다",
    });
    const sys = all.filter((m) => m.kind === "system").map((m) => m.body);
    expect(sys[0]).toMatch(/게임이 시작/);
    expect(sys.join("\n")).toContain("1라운드 시작: 탐색");
  });
});

describe("투표", () => {
  async function votingRoom() {
    const g = await newGame();
    await startRound(g.roomId);
    await call(gm, "end_round", { p_room: g.roomId });
    await startRound(g.roomId);
    await call(gm, "end_round", { p_room: g.roomId });
    await startRound(g.roomId); // R3 → voting
    return g;
  }

  it("투표 단계가 아니면 거부된다", async () => {
    const { roomId } = await newGame();
    await expect(
      call(player(P1), "cast_vote", { p_room: roomId, p_target: C_CULPRIT }),
    ).rejects.toThrow(/invalid_state/);
  });

  it("1인 1표: 두 번째 투표는 거부되고 표는 바뀌지 않는다", async () => {
    const { roomId, charOf } = await votingRoom();
    const target = [C_BUTLER, C_CULPRIT, C_MAID].find((c) => c !== charOf(P1))!;
    const other = [C_BUTLER, C_CULPRIT, C_MAID].find(
      (c) => c !== charOf(P1) && c !== target,
    )!;
    await call(player(P1), "cast_vote", { p_room: roomId, p_target: target });
    await expect(
      call(player(P1), "cast_vote", { p_room: roomId, p_target: other }),
    ).rejects.toThrow(/already_voted/);
    const v = await db.query<{ target_character_id: string }>(
      "select target_character_id from public.room_votes where room_id = $1 and voter_id = $2",
      [roomId, P1],
    );
    expect(v.rows).toEqual([{ target_character_id: target }]);
  });

  it("DB 제약만으로도 같은 사람의 이중 투표가 막힌다", async () => {
    const { roomId } = await votingRoom();
    await db.query(
      "insert into public.room_votes (room_id, voter_id, target_character_id) values ($1, $2, $3)",
      [roomId, P1, C_CULPRIT],
    );
    await expect(
      db.query(
        "insert into public.room_votes (room_id, voter_id, target_character_id) values ($1, $2, $3)",
        [roomId, P1, C_MAID],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("자기 자신, 없는 인물, 참가자가 아닌 사람, GM 은 투표할 수 없다", async () => {
    const { roomId, charOf } = await votingRoom();
    await expect(
      call(player(P1), "cast_vote", { p_room: roomId, p_target: charOf(P1) }),
    ).rejects.toThrow(/cannot_vote_self/);
    await expect(
      call(player(P1), "cast_vote", {
        p_room: roomId,
        p_target: "c0000000-0000-4000-8000-0000000000ff",
      }),
    ).rejects.toThrow(/character not found/);
    for (const actor of [player(OUTSIDER), gm]) {
      await expect(
        call(actor, "cast_vote", { p_room: roomId, p_target: C_CULPRIT }),
      ).rejects.toThrow(/forbidden/);
    }
  });

  it("현황: 본인 표만 보이고 미투표자 명단은 GM 에게만 보이며 직접 조회는 막힌다", async () => {
    const { roomId, charOf } = await votingRoom();
    const target = [C_BUTLER, C_CULPRIT, C_MAID].find((c) => c !== charOf(P1))!;
    await call(player(P1), "cast_vote", { p_room: roomId, p_target: target });

    const mine = await call<Record<string, unknown>>(
      player(P1),
      "get_vote_status",
      { p_room: roomId },
    );
    expect(mine).toMatchObject({ total: 3, voted: 1, myVote: target });
    expect(mine.pending).toBeNull();

    const other = await call<Record<string, unknown>>(
      player(P2),
      "get_vote_status",
      { p_room: roomId },
    );
    expect(other.myVote).toBeNull();
    expect(JSON.stringify(other)).not.toContain(target);

    const asGm = await call<{ pending: string[] }>(gm, "get_vote_status", {
      p_room: roomId,
    });
    expect(asGm.pending.sort()).toEqual(["p1", "p2"]);

    for (const actor of [player(P2), gm, player(OUTSIDER)]) {
      expect(
        await errorOf(db, actor, (tx) =>
          tx.query("select * from public.room_votes"),
        ),
      ).toMatch(/permission denied/);
    }
    await expect(
      call(player(OUTSIDER), "get_vote_status", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
  });

  it("전원이 투표하면 시스템 메시지가 남는다", async () => {
    const { roomId, charOf } = await votingRoom();
    for (const u of [P1, P2, P3]) {
      const t = [C_BUTLER, C_CULPRIT, C_MAID].find((c) => c !== charOf(u))!;
      await call(player(u), "cast_vote", { p_room: roomId, p_target: t });
    }
    const sys = (await messages(roomId)).map((m) => m.body).join("\n");
    expect(sys).toContain("모든 참가자가 투표를 마쳤습니다");
  });
});

describe("결말 공개", () => {
  async function endedRoom(endingId?: string) {
    const g = await newGame();
    await startRound(g.roomId);
    await call(gm, "end_round", { p_room: g.roomId });
    await startRound(g.roomId);
    await call(gm, "end_round", { p_room: g.roomId });
    await startRound(g.roomId); // voting
    // P1, P2 → 정원사(범인) / P3 → 집사. (자기 자신이면 하녀로)
    for (const u of [P1, P2, P3]) {
      const t = g.charOf(u) !== C_CULPRIT ? C_CULPRIT : C_BUTLER;
      await call(player(u), "cast_vote", { p_room: g.roomId, p_target: t });
    }
    await call(gm, "finish_game", {
      p_room: g.roomId,
      ...(endingId ? { p_ending_id: endingId } : {}),
    });
    return g;
  }

  it("게임이 끝나기 전에는 누구도 결말을 받을 수 없다", async () => {
    const { roomId } = await newGame();
    for (const actor of [player(P1), gm]) {
      await expect(
        call(actor, "get_ending", { p_room: roomId }),
      ).rejects.toThrow(/invalid_state/);
    }
    // 투표 중에도 마찬가지
    await startRound(roomId);
    await call(gm, "start_vote", { p_room: roomId });
    await expect(
      call(player(P1), "get_ending", { p_room: roomId }),
    ).rejects.toThrow(/invalid_state/);
  });

  it("1단계: 투표 결과만 나오고 진실·범인·후일담은 나오지 않는다", async () => {
    const { roomId } = await endedRoom();
    const e = await call<Record<string, unknown>>(player(P1), "get_ending", {
      p_room: roomId,
    });
    expect(e.step).toBe(1);
    const text = JSON.stringify(e);
    expect(text).not.toMatch(/TRUTH|RESULT|EPI|culprits/);
    const tally = e.tally as { name: string; count: number }[];
    expect(tally[0]).toMatchObject({ count: expect.any(Number) });
    expect((e.ballots as unknown[]).length).toBe(3);
  });

  it("GM 이 단계를 올릴 때마다 진실, 후일담이 차례로 열린다", async () => {
    const { roomId } = await endedRoom();
    await call(gm, "advance_ending", { p_room: roomId });
    let e = await call<Record<string, unknown>>(player(P2), "get_ending", {
      p_room: roomId,
    });
    expect(e.step).toBe(2);
    expect(e.culprits).toEqual(["정원사"]);
    expect(e.ending).toMatchObject({
      name: "진실 결말",
      truthText: "TRUTH-범인은 정원사",
    });
    expect(JSON.stringify(e)).not.toContain("EPI-");

    await call(gm, "advance_ending", { p_room: roomId });
    e = await call(player(P2), "get_ending", { p_room: roomId });
    expect(e.step).toBe(3);
    expect(e.epilogues).toEqual([
      { name: "집사", text: "EPI-집사" },
      { name: "정원사", text: "EPI-정원사" },
    ]);

    await expect(
      call(gm, "advance_ending", { p_room: roomId }),
    ).rejects.toThrow(/invalid_state/);
  });

  it("GM 이 아니거나 방 밖 사용자는 단계를 올리거나 결말을 볼 수 없다", async () => {
    const { roomId } = await endedRoom();
    await expect(
      call(player(P1), "advance_ending", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
    await expect(
      call(player(OUTSIDER), "get_ending", { p_room: roomId }),
    ).rejects.toThrow(/forbidden/);
  });

  it("종료 시 결말을 고를 수 있고, 없는 결말은 거부된다", async () => {
    const g = await newGame();
    await startRound(g.roomId);
    await call(gm, "start_vote", { p_room: g.roomId });
    await expect(
      call(gm, "finish_game", {
        p_room: g.roomId,
        p_ending_id: "f0000000-0000-4000-8000-0000000000ff",
      }),
    ).rejects.toThrow(/ending not found/);
    await call(gm, "finish_game", { p_room: g.roomId, p_ending_id: E2 });
    await call(gm, "advance_ending", { p_room: g.roomId });
    const e = await call<{ ending: { name: string } }>(gm, "get_ending", {
      p_room: g.roomId,
    });
    expect(e.ending.name).toBe("다른 결말");
  });
});

describe("방 개요의 해금 내용", () => {
  it("참가자에게는 시작한 라운드의 해금 내용만 보이고 GM 에게는 전부 보인다", async () => {
    const { roomId } = await newGame();
    await startRound(roomId);
    const p = await call<{ rounds: { unlockContent?: string | null }[] }>(
      player(P1),
      "get_room_overview",
      { p_room: roomId },
    );
    expect(p.rounds.map((r) => r.unlockContent ?? null)).toEqual([
      "UNLOCK-1",
      null,
      null,
    ]);
    const g = await call<{ rounds: { unlockContent: string }[] }>(
      gm,
      "get_room_overview",
      { p_room: roomId },
    );
    expect(g.rounds.map((r) => r.unlockContent)).toEqual([
      "UNLOCK-1",
      "UNLOCK-2",
      "UNLOCK-3",
    ]);
  });
});
