import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bundleSchema,
  BUNDLE_FORMAT_VERSION,
  type ScenarioBundle,
  type Section,
  type Visibility,
} from "@/lib/schemas/scenario";

/**
 * 시나리오 DB 접근 계층. 항상 사용자의 세션으로 만든 클라이언트를 받으므로 RLS 가 적용된다.
 * 앱 코드는 camelCase, DB 컬럼은 snake_case 이며 최상위 키만 변환한다 (jsonb 안쪽 키는 그대로).
 */

type Sb = SupabaseClient;
type Row = Record<string, unknown>;

export const MAX_SCENARIOS_PER_USER = 50;

const toSnake = (key: string) =>
  key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) =>
  key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function snakeKeys(obj: Row): Row {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [toSnake(k), v]),
  );
}

function camelKeys(obj: Row, drop: readonly string[]): Row {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => !drop.includes(k))
      .map(([k, v]) => [toCamel(k), v]),
  );
}

const LIST_TABLES = {
  rounds: "rounds",
  characters: "characters",
  clues: "clues",
  missions: "missions",
  endings: "endings",
} as const;
type ListSection = keyof typeof LIST_TABLES;

const SCENARIO_FIELD_KEYS: Record<
  "basic" | "world" | "timeline",
  readonly string[]
> = {
  basic: [
    "title",
    "genre",
    "min_players",
    "max_players",
    "estimated_minutes",
    "difficulty",
    "online_supported",
    "offline_supported",
    "run_mode",
  ],
  world: [
    "background",
    "victim",
    "incident_time",
    "incident_place",
    "opening_text",
  ],
  timeline: ["timeline"],
};
const ALL_SCENARIO_KEYS = Object.values(SCENARIO_FIELD_KEYS).flat();
const ROW_META = [
  "scenario_id",
  "position",
  "created_at",
  "updated_at",
] as const;

export function isListSection(section: Section): section is ListSection {
  return section in LIST_TABLES;
}

function fail(context: string, error: { message: string } | null): never {
  // 상세 메시지는 서버 로그에만 남기고, 호출한 쪽에는 일반적인 오류만 던진다.
  console.error(`[builder] ${context}:`, error?.message);
  throw new Error(context);
}

export interface ScenarioMeta {
  id: string;
  ownerId: string;
  updatedAt: string;
}

export async function loadBundle(
  sb: Sb,
  scenarioId: string,
): Promise<{ meta: ScenarioMeta; bundle: ScenarioBundle } | null> {
  const [scenario, ...lists] = await Promise.all([
    sb.from("scenarios").select("*").eq("id", scenarioId).maybeSingle(),
    ...(Object.keys(LIST_TABLES) as ListSection[]).map((t) =>
      sb
        .from(LIST_TABLES[t])
        .select("*")
        .eq("scenario_id", scenarioId)
        .order("position"),
    ),
  ]);
  if (scenario.error) fail("시나리오를 불러오지 못했습니다.", scenario.error);
  if (!scenario.data) return null;
  for (const l of lists)
    if (l.error) fail("시나리오를 불러오지 못했습니다.", l.error);

  const [rounds, characters, clues, missions, endings] = lists.map((l) =>
    (l.data ?? []).map((row) => camelKeys(row as Row, ROW_META)),
  );
  const row = scenario.data as Row;
  const parsed = bundleSchema.safeParse({
    formatVersion: BUNDLE_FORMAT_VERSION,
    scenario: camelKeys(
      Object.fromEntries(
        Object.entries(row).filter(([k]) => ALL_SCENARIO_KEYS.includes(k)),
      ),
      [],
    ),
    rounds,
    characters,
    clues,
    missions,
    endings,
  });
  if (!parsed.success)
    fail("저장된 시나리오 형식이 올바르지 않습니다.", {
      message: parsed.error.message,
    });

  return {
    meta: {
      id: row.id as string,
      ownerId: row.owner_id as string,
      updatedAt: row.updated_at as string,
    },
    bundle: parsed.data,
  };
}

export async function saveFields(
  sb: Sb,
  scenarioId: string,
  section: "basic" | "world" | "timeline",
  data: Row,
) {
  const { data: updated, error } = await sb
    .from("scenarios")
    .update(snakeKeys(data))
    .eq("id", scenarioId)
    .select("id");
  if (error) fail("저장하지 못했습니다.", error);
  if (!updated || updated.length === 0)
    throw new Error("시나리오를 찾을 수 없습니다.");
}

/** 목록을 통째로 저장한다: 보낸 항목은 upsert 하고, 목록에 없는 기존 항목은 삭제한다. */
export async function saveList(
  sb: Sb,
  scenarioId: string,
  section: ListSection,
  rows: Row[],
) {
  const table = LIST_TABLES[section];
  if (rows.length > 0) {
    const payload = rows.map((r, i) => ({
      ...snakeKeys(r),
      scenario_id: scenarioId,
      position: i,
    }));
    const { error } = await sb
      .from(table)
      .upsert(payload, { onConflict: "id" });
    if (error) fail("저장하지 못했습니다.", error);
  }
  // id 는 Zod(uuid)로 검증된 값이라 필터 문자열에 안전하게 넣을 수 있다.
  const ids = rows.map((r) => r.id as string);
  let del = sb.from(table).delete().eq("scenario_id", scenarioId);
  if (ids.length > 0) del = del.not("id", "in", `(${ids.join(",")})`);
  const { error } = await del;
  if (error) fail("저장하지 못했습니다.", error);
}

export async function countScenarios(sb: Sb): Promise<number> {
  const { count, error } = await sb
    .from("scenarios")
    .select("id", { count: "exact", head: true });
  if (error) fail("시나리오 수를 확인하지 못했습니다.", error);
  return count ?? 0;
}

/** 번들을 새 시나리오로 저장한다. 중간에 실패하면 만들던 시나리오를 지운다. */
export async function insertBundle(
  sb: Sb,
  ownerId: string,
  bundle: ScenarioBundle,
): Promise<string> {
  const { data, error } = await sb
    .from("scenarios")
    .insert({ ...snakeKeys(bundle.scenario), owner_id: ownerId })
    .select("id")
    .single();
  if (error || !data) fail("시나리오를 만들지 못했습니다.", error);
  const id = data.id as string;

  try {
    // 외래키 순서: 라운드/인물/미션 → 힌트/결말
    await saveList(sb, id, "rounds", bundle.rounds);
    await saveList(sb, id, "characters", bundle.characters);
    await saveList(sb, id, "missions", bundle.missions);
    await saveList(sb, id, "clues", bundle.clues);
    await saveList(sb, id, "endings", bundle.endings);
  } catch (e) {
    await sb.from("scenarios").delete().eq("id", id);
    throw e;
  }
  return id;
}

export interface ScenarioListItem {
  id: string;
  title: string;
  genre: string;
  minPlayers: number;
  maxPlayers: number;
  updatedAt: string;
  latestVersion: {
    id: string;
    versionNo: number;
    visibility: Visibility;
  } | null;
}

export async function listScenarios(sb: Sb): Promise<ScenarioListItem[]> {
  const [scenarios, versions] = await Promise.all([
    sb
      .from("scenarios")
      .select("id, title, genre, min_players, max_players, updated_at")
      .order("updated_at", { ascending: false }),
    sb
      .from("scenario_versions")
      .select("id, scenario_id, version_no, visibility")
      .order("version_no", { ascending: false }),
  ]);
  if (scenarios.error) fail("목록을 불러오지 못했습니다.", scenarios.error);
  if (versions.error) fail("목록을 불러오지 못했습니다.", versions.error);

  const latest = new Map<
    string,
    { id: string; versionNo: number; visibility: Visibility }
  >();
  for (const v of versions.data ?? []) {
    if (!latest.has(v.scenario_id)) {
      latest.set(v.scenario_id, {
        id: v.id,
        versionNo: v.version_no,
        visibility: v.visibility as Visibility,
      });
    }
  }
  return (scenarios.data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    genre: s.genre,
    minPlayers: s.min_players,
    maxPlayers: s.max_players,
    updatedAt: s.updated_at,
    latestVersion: latest.get(s.id) ?? null,
  }));
}

export interface VersionItem {
  id: string;
  versionNo: number;
  visibility: Visibility;
  createdAt: string;
}

export async function listVersions(
  sb: Sb,
  scenarioId: string,
): Promise<VersionItem[]> {
  const { data, error } = await sb
    .from("scenario_versions")
    .select("id, version_no, visibility, created_at")
    .eq("scenario_id", scenarioId)
    .order("version_no", { ascending: false });
  if (error) fail("발행 이력을 불러오지 못했습니다.", error);
  return (data ?? []).map((v) => ({
    id: v.id,
    versionNo: v.version_no,
    visibility: v.visibility as Visibility,
    createdAt: v.created_at,
  }));
}

export async function loadVersionSnapshot(
  sb: Sb,
  scenarioId: string,
  versionNo: number,
): Promise<ScenarioBundle | null> {
  const { data, error } = await sb
    .from("scenario_versions")
    .select("snapshot")
    .eq("scenario_id", scenarioId)
    .eq("version_no", versionNo)
    .maybeSingle();
  if (error) fail("발행본을 불러오지 못했습니다.", error);
  if (!data) return null;
  const parsed = bundleSchema.safeParse(data.snapshot);
  return parsed.success ? parsed.data : null;
}

export async function publishVersion(
  sb: Sb,
  scenarioId: string,
  visibility: Visibility,
  snapshot: ScenarioBundle,
): Promise<number> {
  const { data, error } = await sb.rpc("publish_scenario", {
    p_scenario_id: scenarioId,
    p_visibility: visibility,
    p_snapshot: snapshot,
  });
  if (error) fail("발행하지 못했습니다.", error);
  const row = Array.isArray(data) ? data[0] : data;
  return row.version_no as number;
}

export async function deleteScenario(sb: Sb, scenarioId: string) {
  const { error } = await sb.from("scenarios").delete().eq("id", scenarioId);
  if (error) fail("삭제하지 못했습니다.", error);
}
