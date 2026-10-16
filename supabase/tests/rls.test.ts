import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, errorOf } from "./helpers/db";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SCENARIO_A = "a0000000-0000-4000-8000-000000000001";
const SCENARIO_B = "b0000000-0000-4000-8000-000000000001";
const ROUND_A = "a0000000-0000-4000-8000-000000000011";
const CHAR_A = "a0000000-0000-4000-8000-000000000022";
const MISSION_A = "a0000000-0000-4000-8000-000000000033";

const CHILD_TABLES = [
  "characters",
  "rounds",
  "clues",
  "missions",
  "endings",
] as const;

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  // 시드 데이터는 RLS 를 우회하는 기본(슈퍼유저) 연결로 넣는다.
  await db.exec(`
    insert into auth.users (id, email) values ('${A}', 'a@test'), ('${B}', 'b@test');
    insert into public.scenarios (id, owner_id, title, run_mode) values
      ('${SCENARIO_A}', '${A}', 'A의 비밀 시나리오', 'both'),
      ('${SCENARIO_B}', '${B}', 'B의 시나리오', 'both');
    insert into public.rounds (id, scenario_id, name) values ('${ROUND_A}', '${SCENARIO_A}', '탐색');
    insert into public.characters (id, scenario_id, name, secret_info, role_type)
      values ('${CHAR_A}', '${SCENARIO_A}', '집사', '사실은 범인이다', 'culprit');
    insert into public.clues (scenario_id, title) values ('${SCENARIO_A}', '피 묻은 칼');
    insert into public.missions (id, scenario_id, title) values ('${MISSION_A}', '${SCENARIO_A}'::uuid, '미션');
    insert into public.endings (scenario_id, name, truth_text)
      values ('${SCENARIO_A}', '진실 결말', '범인은 집사');
    insert into public.scenario_versions (scenario_id, owner_id, version_no, visibility, snapshot)
      values ('${SCENARIO_A}', '${A}', 1, 'public', '{"culprit":"집사"}');
    insert into storage.objects (bucket_id, name, owner)
      values ('scenario-images', '${A}/${SCENARIO_A}/face.webp', '${A}');
  `);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe("시나리오 조회 격리", () => {
  it("제작자 본인은 자기 시나리오를 조회한다", async () => {
    const r = await as(db, { userId: A }, (tx) =>
      tx.query("select id from public.scenarios"),
    );
    expect(r.rows).toHaveLength(1);
  });

  it("다른 사용자는 내 시나리오를 조회할 수 없다", async () => {
    const r = await as(db, { userId: B }, (tx) =>
      tx.query("select id from public.scenarios where id = $1", [SCENARIO_A]),
    );
    expect(r.rows).toHaveLength(0);
  });

  it("로그인하지 않은 요청(anon)은 아무것도 조회할 수 없다", async () => {
    for (const table of ["scenarios", ...CHILD_TABLES, "scenario_versions"]) {
      const r = await as(db, { userId: null }, (tx) =>
        tx.query(`select 1 from public.${table}`),
      );
      expect(r.rows, table).toHaveLength(0);
    }
  });

  it.each(CHILD_TABLES)(
    "다른 사용자는 %s 를 조회할 수 없다 (범인/진실 보호)",
    async (table) => {
      const r = await as(db, { userId: B }, (tx) =>
        tx.query(`select 1 from public.${table} where scenario_id = $1`, [
          SCENARIO_A,
        ]),
      );
      expect(r.rows).toHaveLength(0);
    },
  );

  it("다른 사용자는 발행본 스냅샷도 조회할 수 없다 (공개 발행이어도)", async () => {
    const r = await as(db, { userId: B }, (tx) =>
      tx.query("select snapshot from public.scenario_versions"),
    );
    expect(r.rows).toHaveLength(0);
  });

  it("제작자 본인은 인물의 비밀 정보와 발행본을 조회한다", async () => {
    const chars = await as(db, { userId: A }, (tx) =>
      tx.query<{ secret_info: string }>(
        "select secret_info from public.characters",
      ),
    );
    expect(chars.rows[0].secret_info).toBe("사실은 범인이다");
    const versions = await as(db, { userId: A }, (tx) =>
      tx.query("select id from public.scenario_versions"),
    );
    expect(versions.rows).toHaveLength(1);
  });
});

describe("시나리오 수정·삭제 격리", () => {
  it("다른 사용자는 내 시나리오를 수정할 수 없다 (0행)", async () => {
    const r = await as(db, { userId: B }, (tx) =>
      tx.query("update public.scenarios set title = '해킹' where id = $1", [
        SCENARIO_A,
      ]),
    );
    expect(r.affectedRows).toBe(0);
    const check = await db.query<{ title: string }>(
      "select title from public.scenarios where id = $1",
      [SCENARIO_A],
    );
    expect(check.rows[0].title).toBe("A의 비밀 시나리오");
  });

  it("다른 사용자는 내 시나리오를 삭제할 수 없다 (0행)", async () => {
    const r = await as(db, { userId: B }, (tx) =>
      tx.query("delete from public.scenarios where id = $1", [SCENARIO_A]),
    );
    expect(r.affectedRows).toBe(0);
    const check = await db.query(
      "select 1 from public.scenarios where id = $1",
      [SCENARIO_A],
    );
    expect(check.rows).toHaveLength(1);
  });

  it.each(CHILD_TABLES)(
    "다른 사용자는 내 %s 를 수정·삭제할 수 없다",
    async (table) => {
      const upd = await as(db, { userId: B }, (tx) =>
        tx.query(
          `update public.${table} set position = 99 where scenario_id = $1`,
          [SCENARIO_A],
        ),
      );
      expect(upd.affectedRows).toBe(0);
      const del = await as(db, { userId: B }, (tx) =>
        tx.query(`delete from public.${table} where scenario_id = $1`, [
          SCENARIO_A,
        ]),
      );
      expect(del.affectedRows).toBe(0);
    },
  );

  it("다른 사용자는 내 시나리오에 하위 데이터를 추가할 수 없다", async () => {
    const inserts: Record<(typeof CHILD_TABLES)[number], string> = {
      characters:
        "insert into public.characters (scenario_id, name) values ($1, 'x')",
      rounds: "insert into public.rounds (scenario_id, name) values ($1, 'x')",
      clues: "insert into public.clues (scenario_id, title) values ($1, 'x')",
      missions:
        "insert into public.missions (scenario_id, title) values ($1, 'x')",
      endings:
        "insert into public.endings (scenario_id, name) values ($1, 'x')",
    };
    for (const table of CHILD_TABLES) {
      const err = await errorOf(db, { userId: B }, (tx) =>
        tx.query(inserts[table], [SCENARIO_A]),
      );
      expect(err, table).toMatch(/row-level security/i);
    }
  });

  it("내 하위 데이터를 다른 사람의 시나리오로 옮길 수 없다", async () => {
    const err = await errorOf(db, { userId: A }, (tx) =>
      tx.query("update public.characters set scenario_id = $1 where id = $2", [
        SCENARIO_B,
        CHAR_A,
      ]),
    );
    expect(err).toMatch(/row-level security/i);
  });

  it("다른 사람 명의(owner_id)로 시나리오를 만들 수 없다", async () => {
    const err = await errorOf(db, { userId: B }, (tx) =>
      tx.query(
        "insert into public.scenarios (owner_id, title) values ($1, 'x')",
        [A],
      ),
    );
    expect(err).toMatch(/row-level security/i);
  });

  it("anon 요청은 시나리오를 만들 수 없다", async () => {
    const err = await errorOf(db, { userId: null }, (tx) =>
      tx.query(
        "insert into public.scenarios (owner_id, title) values ($1, 'x')",
        [A],
      ),
    );
    expect(err).not.toBeNull();
  });

  it("익명 로그인 사용자는 시나리오를 만들 수 없다", async () => {
    const err = await errorOf(db, { userId: B, anonymous: true }, (tx) =>
      tx.query(
        "insert into public.scenarios (owner_id, title) values ($1, 'x')",
        [B],
      ),
    );
    expect(err).toMatch(/row-level security/i);
  });
});

describe("제작자 본인 CRUD", () => {
  it("본인 시나리오와 하위 데이터를 만들고 고치고 지운다", async () => {
    await as(db, { userId: A }, async (tx) => {
      const ins = await tx.query<{ id: string }>(
        "insert into public.scenarios (owner_id, title) values ($1, '새 시나리오') returning id",
        [A],
      );
      const id = ins.rows[0].id;
      await tx.query(
        "insert into public.characters (scenario_id, name) values ($1, '탐정')",
        [id],
      );
      const upd = await tx.query(
        "update public.scenarios set title = '수정됨' where id = $1",
        [id],
      );
      expect(upd.affectedRows).toBe(1);
      const del = await tx.query("delete from public.scenarios where id = $1", [
        id,
      ]);
      expect(del.affectedRows).toBe(1);
      const left = await tx.query(
        "select 1 from public.characters where scenario_id = $1",
        [id],
      );
      expect(left.rows).toHaveLength(0); // cascade
    });
  });

  it("updated_at 이 수정 시 갱신된다", async () => {
    await db.exec(
      `update public.scenarios set updated_at = '2000-01-01' where id = '${SCENARIO_B}'`,
    );
    await as(db, { userId: B }, async (tx) => {
      await tx.query(
        "update public.scenarios set title = '바뀜' where id = $1",
        [SCENARIO_B],
      );
      const r = await tx.query<{ ok: boolean }>(
        "select updated_at > '2020-01-01' as ok from public.scenarios where id = $1",
        [SCENARIO_B],
      );
      expect(r.rows[0].ok).toBe(true);
    });
  });
});

describe("데이터 제약", () => {
  it("최소 인원이 최대 인원보다 크면 거부한다", async () => {
    const err = await errorOf(db, { userId: A }, (tx) =>
      tx.query(
        "update public.scenarios set min_players = 8, max_players = 4 where id = $1",
        [SCENARIO_A],
      ),
    );
    expect(err).toMatch(/scenarios_players_range/);
  });

  it("허용되지 않은 역할유형을 거부한다", async () => {
    const err = await errorOf(db, { userId: A }, (tx) =>
      tx.query(
        "update public.characters set role_type = 'boss' where id = $1",
        [CHAR_A],
      ),
    );
    expect(err).toMatch(/role_type/);
  });

  it("라운드를 지우면 연결된 힌트의 획득 라운드는 비워진다 (set null)", async () => {
    await as(db, { userId: A }, async (tx) => {
      await tx.query(
        "update public.clues set acquire_round_id = $1 where scenario_id = $2",
        [ROUND_A, SCENARIO_A],
      );
      await tx.query("delete from public.rounds where id = $1", [ROUND_A]);
      const r = await tx.query<{ acquire_round_id: string | null }>(
        "select acquire_round_id from public.clues where scenario_id = $1",
        [SCENARIO_A],
      );
      expect(r.rows[0].acquire_round_id).toBeNull();
    });
  });
});

describe("발행 (publish_scenario)", () => {
  const publish = (
    tx: Parameters<Parameters<typeof as>[2]>[0],
    scenarioId: string,
    visibility = "private",
  ) =>
    tx.query<{ version_id: string; version_no: number }>(
      "select * from public.publish_scenario($1, $2, $3::jsonb)",
      [scenarioId, visibility, JSON.stringify({ title: "스냅샷" })],
    );

  it("제작자는 발행할 수 있고 버전 번호가 순서대로 올라간다", async () => {
    await as(db, { userId: A }, async (tx) => {
      const v2 = await publish(tx, SCENARIO_A);
      const v3 = await publish(tx, SCENARIO_A, "public");
      expect(v2.rows[0].version_no).toBe(2); // 시드에 1이 이미 있다
      expect(v3.rows[0].version_no).toBe(3);
    });
  });

  it("다른 사용자는 내 시나리오를 발행할 수 없다", async () => {
    const err = await errorOf(db, { userId: B }, (tx) =>
      publish(tx, SCENARIO_A),
    );
    expect(err).toMatch(/scenario not found/);
  });

  it("anon 요청은 발행 함수를 호출할 수 없다", async () => {
    const err = await errorOf(db, { userId: null }, (tx) =>
      publish(tx, SCENARIO_A),
    );
    expect(err).toMatch(/permission denied/i);
  });

  it("잘못된 공개 범위를 거부한다", async () => {
    const err = await errorOf(db, { userId: A }, (tx) =>
      publish(tx, SCENARIO_A, "friends"),
    );
    expect(err).toMatch(/invalid visibility/);
  });

  it("직접 INSERT 로 다른 사람 명의의 발행본을 만들 수 없다", async () => {
    const err = await errorOf(db, { userId: B }, (tx) =>
      tx.query(
        `insert into public.scenario_versions (scenario_id, owner_id, version_no, visibility, snapshot)
         values ($1, $2, 99, 'private', '{}')`,
        [SCENARIO_A, B],
      ),
    );
    expect(err).toMatch(/row-level security/i);
  });

  it("발행본은 수정할 수 없다 (불변)", async () => {
    const r = await as(db, { userId: A }, (tx) =>
      tx.query(
        "update public.scenario_versions set snapshot = '{}'::jsonb where scenario_id = $1",
        [SCENARIO_A],
      ),
    );
    expect(r.affectedRows).toBe(0);
  });

  it("발행본은 삭제할 수 없다 (불변)", async () => {
    const r = await as(db, { userId: A }, (tx) =>
      tx.query("delete from public.scenario_versions where scenario_id = $1", [
        SCENARIO_A,
      ]),
    );
    expect(r.affectedRows).toBe(0);
  });
});

describe("이미지 Storage 정책", () => {
  it("버킷은 비공개이고 크기·형식 제한이 있다", async () => {
    const r = await db.query<{
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'scenario-images'",
    );
    expect(r.rows[0].public).toBe(false);
    expect(Number(r.rows[0].file_size_limit)).toBe(5 * 1024 * 1024);
    expect(r.rows[0].allowed_mime_types).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("본인 폴더에는 업로드할 수 있다", async () => {
    const err = await errorOf(db, { userId: A }, (tx) =>
      tx.query(
        "insert into storage.objects (bucket_id, name) values ('scenario-images', $1)",
        [`${A}/${SCENARIO_A}/new.webp`],
      ),
    );
    expect(err).toBeNull();
  });

  it("다른 사용자의 폴더에는 업로드할 수 없다", async () => {
    const err = await errorOf(db, { userId: B }, (tx) =>
      tx.query(
        "insert into storage.objects (bucket_id, name) values ('scenario-images', $1)",
        [`${A}/${SCENARIO_A}/evil.webp`],
      ),
    );
    expect(err).toMatch(/row-level security/i);
  });

  it("익명 로그인 사용자는 업로드할 수 없다", async () => {
    const err = await errorOf(db, { userId: B, anonymous: true }, (tx) =>
      tx.query(
        "insert into storage.objects (bucket_id, name) values ('scenario-images', $1)",
        [`${B}/x/face.webp`],
      ),
    );
    expect(err).toMatch(/row-level security/i);
  });

  it("다른 사용자는 내 이미지를 조회·수정·삭제할 수 없다", async () => {
    const sel = await as(db, { userId: B }, (tx) =>
      tx.query(
        "select 1 from storage.objects where bucket_id = 'scenario-images'",
      ),
    );
    expect(sel.rows).toHaveLength(0);
    const upd = await as(db, { userId: B }, (tx) =>
      tx.query(
        "update storage.objects set name = 'x' where bucket_id = 'scenario-images'",
      ),
    );
    expect(upd.affectedRows).toBe(0);
    const del = await as(db, { userId: B }, (tx) =>
      tx.query(
        "delete from storage.objects where bucket_id = 'scenario-images'",
      ),
    );
    expect(del.affectedRows).toBe(0);
  });

  it("본인은 자기 이미지를 조회할 수 있다", async () => {
    const sel = await as(db, { userId: A }, (tx) =>
      tx.query(
        "select 1 from storage.objects where bucket_id = 'scenario-images'",
      ),
    );
    expect(sel.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("다른 버킷에는 정책이 적용되지 않아 접근할 수 없다", async () => {
    await db.exec(
      "insert into storage.buckets (id, name) values ('other', 'other')",
    );
    const err = await errorOf(db, { userId: A }, (tx) =>
      tx.query(
        "insert into storage.objects (bucket_id, name) values ('other', $1)",
        [`${A}/x.webp`],
      ),
    );
    expect(err).toMatch(/row-level security/i);
  });
});
