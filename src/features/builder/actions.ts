"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/features/auth/session";
import {
  bundleSchema,
  SECTIONS,
  validateSection,
  VISIBILITIES,
  type Section,
  type Visibility,
} from "@/lib/schemas/scenario";

import { createEmptyBundle, remapIds, sanitizeImagePaths } from "./bundle";
import { reviewScenario, countIssues } from "./review";
import {
  countScenarios,
  deleteScenario,
  insertBundle,
  isListSection,
  loadBundle,
  MAX_SCENARIOS_PER_USER,
  publishVersion,
  saveFields,
  saveList,
} from "./server/db";

export type ActionResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: string };

const idSchema = z.uuid();
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const GENERIC_ERROR = "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 서버 액션의 내부 오류가 그대로 노출되지 않도록 사용자용 메시지로 바꾼다. */
async function guarded<T extends object>(
  fn: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect() 등 Next 내부 제어 흐름
    const known =
      e instanceof Error && /[가-힣]/.test(e.message)
        ? e.message
        : GENERIC_ERROR;
    return { ok: false, error: known };
  }
}

async function ensureCanCreate(supabase: Parameters<typeof countScenarios>[0]) {
  if ((await countScenarios(supabase)) >= MAX_SCENARIOS_PER_USER) {
    throw new Error(
      `시나리오는 최대 ${MAX_SCENARIOS_PER_USER}개까지 만들 수 있습니다.`,
    );
  }
}

export async function createScenarioAction() {
  const { supabase, userId } = await requireUser();
  await ensureCanCreate(supabase);
  const id = await insertBundle(supabase, userId, createEmptyBundle());
  redirect(`/builder/${id}/edit`);
}

/** 자동 임시저장: 한 섹션(단계)의 데이터를 검증하고 저장한다. */
export async function saveSectionAction(
  scenarioId: string,
  section: string,
  payload: unknown,
): Promise<ActionResult> {
  return guarded(async () => {
    const { supabase, userId } = await requireUser();
    if (!idSchema.safeParse(scenarioId).success)
      return { ok: false, error: "잘못된 요청입니다." };
    if (!(SECTIONS as readonly string[]).includes(section))
      return { ok: false, error: "잘못된 요청입니다." };

    const validated = validateSection(section as Section, payload);
    if (!validated.ok) return { ok: false, error: validated.error };

    if (section === "characters") {
      // 이미지 경로는 본인 폴더({userId}/...)만 허용한다.
      const rows = validated.data as { imagePath: string | null }[];
      const prefix = `${userId}/`;
      if (rows.some((r) => r.imagePath && !r.imagePath.startsWith(prefix))) {
        return { ok: false, error: "허용되지 않은 이미지 경로입니다." };
      }
    }

    if (isListSection(section as Section)) {
      await saveList(
        supabase,
        scenarioId,
        section as "rounds",
        validated.data as Record<string, unknown>[],
      );
    } else {
      await saveFields(
        supabase,
        scenarioId,
        section as "basic",
        validated.data as Record<string, unknown>,
      );
    }
    return { ok: true };
  });
}

export async function publishAction(
  scenarioId: string,
  visibility: string,
): Promise<ActionResult<{ versionNo: number }>> {
  return guarded<{ versionNo: number }>(async () => {
    const { supabase } = await requireUser();
    if (!idSchema.safeParse(scenarioId).success)
      return { ok: false, error: "잘못된 요청입니다." };
    if (!(VISIBILITIES as readonly string[]).includes(visibility))
      return { ok: false, error: "잘못된 공개 범위입니다." };

    // 클라이언트가 보낸 내용이 아니라 DB 에 저장된 최신 내용을 서버에서 다시 검수하고 발행한다.
    const loaded = await loadBundle(supabase, scenarioId);
    if (!loaded) return { ok: false, error: "시나리오를 찾을 수 없습니다." };
    const { errors } = countIssues(reviewScenario(loaded.bundle));
    if (errors > 0)
      return {
        ok: false,
        error: `검수 오류 ${errors}건을 먼저 해결해 주세요.`,
      };

    const versionNo = await publishVersion(
      supabase,
      scenarioId,
      visibility as Visibility,
      loaded.bundle,
    );
    return { ok: true, versionNo };
  });
}

export async function duplicateAction(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) redirect("/builder");
  await ensureCanCreate(supabase);

  const loaded = await loadBundle(supabase, id.data);
  if (!loaded) redirect("/builder");
  const copy = remapIds(loaded.bundle);
  copy.scenario.title = `${copy.scenario.title || "제목 없음"} (복사본)`.slice(
    0,
    100,
  );
  const newId = await insertBundle(supabase, userId, copy);
  redirect(`/builder/${newId}/edit`);
}

export async function deleteScenarioAction(formData: FormData) {
  const { supabase } = await requireUser();
  const id = idSchema.safeParse(formData.get("id"));
  if (id.success) await deleteScenario(supabase, id.data);
  redirect("/builder");
}

/** JSON 가져오기: 내보낸 파일을 검증하고 id 를 새로 발급해 새 시나리오로 저장한다. */
export async function importScenarioAction(
  jsonText: string,
): Promise<ActionResult<{ id: string }>> {
  return guarded<{ id: string }>(async () => {
    const { supabase, userId } = await requireUser();
    if (typeof jsonText !== "string" || jsonText.length > MAX_IMPORT_BYTES) {
      return { ok: false, error: "파일이 너무 큽니다. (최대 2MB)" };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(jsonText);
    } catch {
      return { ok: false, error: "JSON 형식이 올바르지 않습니다." };
    }
    const parsed = bundleSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        error: `알리바이 시나리오 파일이 아닙니다. (${issue.path.join(".") || "형식"}: ${issue.message})`,
      };
    }
    await ensureCanCreate(supabase);

    const bundle = remapIds(sanitizeImagePaths(parsed.data, userId));
    bundle.scenario.title =
      `${bundle.scenario.title || "제목 없음"} (가져옴)`.slice(0, 100);
    const id = await insertBundle(supabase, userId, bundle);
    return { ok: true, id };
  });
}
