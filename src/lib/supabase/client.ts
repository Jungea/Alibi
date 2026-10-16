import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv, SupabaseNotConfiguredError } from "./env";

/** 브라우저용 클라이언트. anon key 만 사용하며 service_role 키는 절대 쓰지 않는다. */
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new SupabaseNotConfiguredError();
  return createBrowserClient(env.url, env.key);
}
