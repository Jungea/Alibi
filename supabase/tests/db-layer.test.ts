import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCharacter,
  createClue,
  createEmptyBundle,
  createEnding,
  createMission,
  createTimelineEntry,
  remapIds,
} from "@/features/builder/bundle";
import {
  countScenarios,
  deleteScenario,
  insertBundle,
  listScenarios,
  listVersions,
  loadBundle,
  loadVersionSnapshot,
  publishVersion,
  saveFields,
  saveList,
} from "@/features/builder/server/db";
import { bundleSchema, type ScenarioBundle } from "@/lib/schemas/scenario";

import { createTestDb } from "./helpers/db";
import { createFakeSupabase } from "./helpers/fake-supabase";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: PGlite;
const asA = () => createFakeSupabase(db, { userId: A });
const asB = () => createFakeSupabase(db, { userId: B });

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@test'), ('${B}', 'b@test')`,
  );
}, 120_000);
afterAll(async () => {
  await db.close();
});

/** 모든 종류의 필드를 채운 시나리오 */
function fullBundle(): ScenarioBundle {
  const b = createEmptyBundle();
  const butler = {
    ...createCharacter(),
    name: "집사",
    roleType: "culprit" as const,
    secretInfo: "범인",
    imagePath: `${A}/s/face.webp`,
  };
  const doctor = { ...createCharacter(), name: "의사", publicInfo: "공개" };
  butler.relations = [{ targetId: doctor.id, description: "오랜 친구" }];
  butler.roundInfos = { [b.rounds[2].id]: "탐색 정보" };
  const mission = {
    ...createMission(),
    title: "미션",
    characterId: doctor.id,
    judgeType: "auto" as const,
  };
  return {
    ...b,
    scenario: {
      ...b.scenario,
      title: "저택 살인 사건",
      genre: "클래식",
      minPlayers: 2,
      maxPlayers: 5,
      runMode: "both",
      timeline: [
        {
          ...createTimelineEntry(),
          time: "21:00",
          characterId: butler.id,
          place: "서재",
          description: "범행",
        },
      ],
    },
    characters: [butler, doctor],
    clues: [
      {
        ...createClue(),
        title: "칼",
        acquireRoundId: b.rounds[2].id,
        linkedCharacterId: butler.id,
        isTrue: false,
      },
    ],
    missions: [mission],
    endings: [
      {
        ...createEnding(),
        name: "진실",
        conditionKind: "mission_done",
        conditionMissionId: mission.id,
        truthText: "집사",
        epilogues: { [butler.id]: "체포" },
      },
    ],
  };
}

describe("insertBundle / loadBundle", () => {
  it("저장했다가 불러오면 모든 필드가 그대로 돌아온다 (왕복)", async () => {
    const original = fullBundle();
    const id = await insertBundle(asA(), A, original);
    const loaded = await loadBundle(asA(), id);
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.ownerId).toBe(A);
    expect(loaded!.bundle).toEqual(original);
  });

  it("목록 순서(position)를 유지한다", async () => {
    const original = fullBundle();
    const id = await insertBundle(asA(), A, original);
    const loaded = await loadBundle(asA(), id);
    expect(loaded!.bundle.rounds.map((r) => r.name)).toEqual(
      original.rounds.map((r) => r.name),
    );
  });

  it("다른 사용자는 불러올 수 없다", async () => {
    const id = await insertBundle(asA(), A, fullBundle());
    expect(await loadBundle(asB(), id)).toBeNull();
  });

  it("존재하지 않는 id 는 null", async () => {
    expect(await loadBundle(asA(), crypto.randomUUID())).toBeNull();
  });

  it("중간에 실패하면 만들던 시나리오를 남기지 않는다", async () => {
    const before = await countScenarios(asA());
    const broken = fullBundle();
    // 존재하지 않는 인물을 가리키는 힌트 → 외래키 위반
    broken.clues[0].linkedCharacterId = crypto.randomUUID();
    await expect(insertBundle(asA(), A, broken)).rejects.toThrow();
    expect(await countScenarios(asA())).toBe(before);
  });

  it("다른 사람 명의로는 시나리오를 만들 수 없다", async () => {
    await expect(insertBundle(asB(), A, fullBundle())).rejects.toThrow();
  });

  it("복제(remapIds)한 번들도 저장되고 원본과 독립적이다", async () => {
    const original = fullBundle();
    const id1 = await insertBundle(asA(), A, original);
    const id2 = await insertBundle(asA(), A, remapIds(original));
    const [one, two] = await Promise.all([
      loadBundle(asA(), id1),
      loadBundle(asA(), id2),
    ]);
    expect(two!.bundle.characters[0].id).not.toBe(one!.bundle.characters[0].id);
    expect(two!.bundle.endings[0].conditionMissionId).toBe(
      two!.bundle.missions[0].id,
    );
    expect(bundleSchema.safeParse(two!.bundle).success).toBe(true);
  });
});

describe("saveFields", () => {
  it("기본 정보 / 세계관 / 타임라인을 저장한다", async () => {
    const id = await insertBundle(asA(), A, createEmptyBundle());
    const entry = { ...createTimelineEntry(), time: "10:00", place: "정원" };
    await saveFields(asA(), id, "basic", {
      title: "새 제목",
      minPlayers: 3,
      maxPlayers: 7,
      runMode: "auto_possible",
    });
    await saveFields(asA(), id, "world", {
      victim: "백작",
      openingText: "어느 밤",
    });
    await saveFields(asA(), id, "timeline", { timeline: [entry] });
    const { bundle } = (await loadBundle(asA(), id))!;
    expect(bundle.scenario).toMatchObject({
      title: "새 제목",
      minPlayers: 3,
      maxPlayers: 7,
      runMode: "auto_possible",
      victim: "백작",
      openingText: "어느 밤",
    });
    expect(bundle.scenario.timeline).toEqual([entry]);
  });

  it("다른 사용자의 시나리오는 저장할 수 없다", async () => {
    const id = await insertBundle(asA(), A, createEmptyBundle());
    await expect(
      saveFields(asB(), id, "basic", { title: "해킹" }),
    ).rejects.toThrow("시나리오를 찾을 수 없습니다.");
    expect((await loadBundle(asA(), id))!.bundle.scenario.title).toBe("");
  });
});

describe("saveList", () => {
  it("추가·수정·순서 변경·삭제를 한 번에 반영한다", async () => {
    const id = await insertBundle(asA(), A, fullBundle());
    const current = (await loadBundle(asA(), id))!.bundle;
    const [butler, doctor] = current.characters;
    const added = { ...createCharacter(), name: "화가" };
    // 의사 삭제, 집사 수정, 화가 추가, 순서 뒤집기
    const next = [added, { ...butler, name: "수석 집사" }];
    await saveList(asA(), id, "characters", next);

    const after = (await loadBundle(asA(), id))!.bundle;
    expect(after.characters.map((c) => c.name)).toEqual(["화가", "수석 집사"]);
    expect(after.characters.find((c) => c.id === doctor.id)).toBeUndefined();
    // 삭제된 인물을 가리키던 미션 참조는 set null 로 비워진다
    expect(after.missions[0].characterId).toBeNull();
  });

  it("빈 목록을 저장하면 기존 항목을 모두 지운다", async () => {
    const id = await insertBundle(asA(), A, fullBundle());
    await saveList(asA(), id, "clues", []);
    expect((await loadBundle(asA(), id))!.bundle.clues).toEqual([]);
  });

  it("라운드를 지우면 힌트의 획득 라운드가 비워진다", async () => {
    const original = fullBundle();
    const id = await insertBundle(asA(), A, original);
    await saveList(
      asA(),
      id,
      "rounds",
      original.rounds.filter((r) => r.id !== original.rounds[2].id),
    );
    const after = (await loadBundle(asA(), id))!.bundle;
    expect(after.rounds).toHaveLength(6);
    expect(after.clues[0].acquireRoundId).toBeNull();
  });

  it("같은 id 를 다시 저장해도(upsert) 중복되지 않는다", async () => {
    const original = fullBundle();
    const id = await insertBundle(asA(), A, original);
    await saveList(asA(), id, "characters", original.characters);
    await saveList(asA(), id, "characters", original.characters);
    expect((await loadBundle(asA(), id))!.bundle.characters).toHaveLength(2);
  });

  it("다른 사용자의 시나리오에는 저장할 수 없고, 기존 데이터도 지워지지 않는다", async () => {
    const original = fullBundle();
    const id = await insertBundle(asA(), A, original);
    await expect(
      saveList(asB(), id, "characters", [createCharacter()]),
    ).rejects.toThrow();
    // RLS 때문에 삭제도 0행이어야 한다
    await saveList(asB(), id, "clues", []).catch(() => {});
    const after = (await loadBundle(asA(), id))!.bundle;
    expect(after.characters).toHaveLength(2);
    expect(after.clues).toHaveLength(1);
  });

  it("다른 사용자의 행 id 를 자기 시나리오로 끌어와 덮어쓸 수 없다", async () => {
    const original = fullBundle();
    await insertBundle(asA(), A, original);
    const idB = await insertBundle(asB(), B, createEmptyBundle());
    await expect(
      saveList(asB(), idB, "characters", [
        { ...original.characters[0], name: "탈취" },
      ]),
    ).rejects.toThrow();
    const stolen = await db.query(
      "select name from public.characters where name = '탈취'",
    );
    expect(stolen.rows).toHaveLength(0);
  });
});

describe("발행", () => {
  it("버전이 순서대로 올라가고 스냅샷이 그대로 저장된다", async () => {
    const original = fullBundle();
    const id = await insertBundle(asA(), A, original);
    const v1 = await publishVersion(
      asA(),
      id,
      "private",
      (await loadBundle(asA(), id))!.bundle,
    );
    const edited = {
      ...original,
      scenario: { ...original.scenario, title: "수정본" },
    };
    const v2 = await publishVersion(asA(), id, "public", edited);
    expect([v1, v2]).toEqual([1, 2]);

    // 발행 후 원본을 고쳐도 v1 스냅샷은 그대로다 (불변)
    await saveFields(asA(), id, "basic", {
      title: "또 수정",
      minPlayers: 2,
      maxPlayers: 5,
    });
    const snap1 = await loadVersionSnapshot(asA(), id, 1);
    expect(snap1!.scenario.title).toBe("저택 살인 사건");
    const snap2 = await loadVersionSnapshot(asA(), id, 2);
    expect(snap2!.scenario.title).toBe("수정본");
    expect(await loadVersionSnapshot(asA(), id, 99)).toBeNull();
  });

  it("목록과 이력이 최신 버전을 보여준다", async () => {
    const id = await insertBundle(asA(), A, fullBundle());
    await publishVersion(asA(), id, "private", fullBundle());
    await publishVersion(asA(), id, "public", fullBundle());
    const versions = await listVersions(asA(), id);
    expect(versions.map((v) => [v.versionNo, v.visibility])).toEqual([
      [2, "public"],
      [1, "private"],
    ]);
    const item = (await listScenarios(asA())).find((s) => s.id === id);
    expect(item!.latestVersion).toMatchObject({
      versionNo: 2,
      visibility: "public",
    });
  });

  it("다른 사용자는 발행할 수도, 스냅샷을 읽을 수도 없다", async () => {
    const id = await insertBundle(asA(), A, fullBundle());
    await publishVersion(asA(), id, "public", fullBundle());
    await expect(
      publishVersion(asB(), id, "private", fullBundle()),
    ).rejects.toThrow();
    expect(await loadVersionSnapshot(asB(), id, 1)).toBeNull();
    expect(await listVersions(asB(), id)).toEqual([]);
  });
});

describe("목록 / 삭제", () => {
  it("본인 시나리오만 목록에 나오고 최근 수정순이다", async () => {
    const list = await listScenarios(asB());
    expect(list.every((s) => s.id.length > 0)).toBe(true);
    const aList = await listScenarios(asA());
    const ids = new Set(aList.map((s) => s.id));
    for (const s of list) expect(ids.has(s.id)).toBe(false);
    const times = aList.map((s) => Date.parse(s.updatedAt));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it("삭제하면 하위 데이터와 발행본도 함께 사라진다", async () => {
    const id = await insertBundle(asA(), A, fullBundle());
    await publishVersion(asA(), id, "private", fullBundle());
    await deleteScenario(asA(), id);
    expect(await loadBundle(asA(), id)).toBeNull();
    const left = await db.query(
      "select 1 from public.characters where scenario_id = $1",
      [id],
    );
    const leftV = await db.query(
      "select 1 from public.scenario_versions where scenario_id = $1",
      [id],
    );
    expect(left.rows).toHaveLength(0);
    expect(leftV.rows).toHaveLength(0);
  });

  it("다른 사용자의 시나리오는 삭제되지 않는다", async () => {
    const id = await insertBundle(asA(), A, fullBundle());
    await deleteScenario(asB(), id);
    expect(await loadBundle(asA(), id)).not.toBeNull();
  });
});
