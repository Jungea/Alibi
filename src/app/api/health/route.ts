import { timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

function json(status: "ok" | "error", statusCode: number) {
  return Response.json(
    { status },
    { status: statusCode, headers: RESPONSE_HEADERS },
  );
}

function hasValidToken(request: Request, expected: string) {
  const provided = request.headers.get("x-health-token");
  if (!provided) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/** cron-job.org가 호출하는 비공개 Supabase 연결 확인 엔드포인트. */
export async function GET(request: Request) {
  const expectedToken = process.env.HEALTH_CHECK_TOKEN;
  if (!expectedToken || !hasValidToken(request, expectedToken)) {
    return json("error", 401);
  }

  const env = getSupabaseEnv();
  if (!env) return json("error", 503);

  try {
    const supabase = createClient(env.url, env.key, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { data, error } = await supabase
      .rpc("health_check")
      .abortSignal(AbortSignal.timeout(10_000));

    if (error || data !== true) return json("error", 503);
    return json("ok", 200);
  } catch {
    return json("error", 503);
  }
}
