import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { loadBundle, loadVersionSnapshot } from "@/features/builder/server/db";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** 시나리오(또는 발행본)를 JSON 파일로 내려준다. 백업과 가져오기에 쓴다. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/builder/[id]/export">,
) {
  if (!getSupabaseEnv())
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims || data.claims.is_anonymous === true) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const versionParam = request.nextUrl.searchParams.get("version");
  let bundle;
  let suffix = "";
  if (versionParam) {
    const versionNo = Number(versionParam);
    if (!Number.isInteger(versionNo) || versionNo < 1)
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    bundle = await loadVersionSnapshot(supabase, id, versionNo);
    suffix = `-v${versionNo}`;
  } else {
    bundle = (await loadBundle(supabase, id))?.bundle ?? null;
  }
  if (!bundle)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const title = bundle.scenario.title.trim() || "scenario";
  const safeName = `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60)}${suffix}.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
