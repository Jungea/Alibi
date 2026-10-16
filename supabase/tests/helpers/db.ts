import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

/**
 * 로컬 Postgres(PGlite)에서 supabase/migrations 를 그대로 적용해 RLS를 검증하기 위한 하네스.
 * Docker / Supabase 프로젝트가 없어도 돌아가도록 Supabase가 제공하는 최소 요소
 * (auth.uid(), auth.jwt(), anon/authenticated 역할, storage 스키마)를 같은 동작으로 흉내 낸다.
 */

const SUPABASE_STUB = `
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create role anon nologin;
create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects, storage.buckets to anon, authenticated;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);

  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

export interface Actor {
  /** null 이면 anon 역할 (로그인하지 않은 요청) */
  userId: string | null;
  /** Supabase 익명 로그인 사용자 (role 은 authenticated 지만 is_anonymous 클레임이 true) */
  anonymous?: boolean;
}

type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

/** 지정한 사용자로서 RLS가 적용된 상태로 쿼리를 실행한다. 항상 롤백한다. */
export async function as<T>(
  db: PGlite,
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const ROLLBACK = Symbol("rollback");
  let result: T | undefined;
  try {
    await db.transaction(async (tx) => {
      const role = actor.userId === null ? "anon" : "authenticated";
      await tx.exec(`set local role ${role}`);
      if (actor.userId !== null) {
        const claims = JSON.stringify({
          sub: actor.userId,
          role,
          is_anonymous: actor.anonymous ?? false,
        });
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [
          actor.userId,
        ]);
        await tx.query("select set_config('request.jwt.claims', $1, true)", [
          claims,
        ]);
      }
      result = await fn(tx);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return result as T;
}

/** 쿼리가 오류(권한 거부 등)로 실패하는지 확인하기 위한 헬퍼. 오류 메시지를 반환하고 없으면 null. */
export async function errorOf(
  db: PGlite,
  actor: Actor,
  fn: (tx: Tx) => Promise<unknown>,
): Promise<string | null> {
  try {
    await as(db, actor, fn);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
