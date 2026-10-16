import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Actor } from "./db";

/**
 * supabase-js 쿼리 빌더 중 앱이 쓰는 부분만 PGlite 위에서 흉내 낸 테스트용 어댑터.
 * PostgREST 와 같은 방식(jsonb_populate_recordset)으로 SQL 을 만들고, 호출마다 지정한 사용자로
 * RLS 를 적용해 실행한 뒤 커밋한다. 앱의 DB 계층(server/db.ts)을 실제 Postgres 로 검증하는 용도다.
 */

type Json = Record<string, unknown>;
type Result = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (s: string) => {
  if (!IDENT.test(s)) throw new Error(`bad identifier: ${s}`);
  return s;
};

class Builder implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private cols = "*";
  private payload: Json | Json[] | null = null;
  private onConflict = "id";
  private filters: { sql: (n: number) => string; value: unknown }[] = [];
  private orderBy: string | null = null;
  private returning = false;
  private single: "one" | "maybe" | null = null;
  private head = false;
  private wantCount = false;

  constructor(
    private db: PGlite,
    private actor: Actor,
    private table: string,
  ) {}

  select(cols = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.cols = cols;
    if (this.op === "select") {
      this.head = !!opts?.head;
      this.wantCount = !!opts?.count;
    } else {
      this.returning = true;
    }
    return this;
  }
  insert(p: Json | Json[]) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: Json) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  upsert(p: Json | Json[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = p;
    this.onConflict = opts?.onConflict ?? "id";
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  eq(col: string, value: unknown) {
    this.filters.push({ sql: (n) => `${ident(col)} = $${n}`, value });
    return this;
  }
  not(col: string, operator: string, value: string) {
    if (operator !== "in") throw new Error("only not-in is supported");
    const list = value
      .replace(/^\(|\)$/g, "")
      .split(",")
      .filter(Boolean);
    this.filters.push({
      sql: (n) => `${ident(col)}::text <> all($${n}::text[])`,
      value: list,
    });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = `${ident(col)} ${opts?.ascending === false ? "desc" : "asc"}`;
    return this;
  }
  maybeSingle() {
    this.single = "maybe";
    return this;
  }
  // 삽입 직후 .single() 은 반환 행을 하나로 받는다
  // (insert().select().single() 체인에서 호출된다)
  singleRow() {
    this.single = "one";
    return this;
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private columnList() {
    return this.cols === "*"
      ? "*"
      : this.cols
          .split(",")
          .map((c) => ident(c.trim()))
          .join(", ");
  }

  private async run(): Promise<Result> {
    const t = `public.${ident(this.table)}`;
    const params: unknown[] = [];
    const where = () => {
      if (this.filters.length === 0) return "";
      return ` where ${this.filters
        .map((f) => {
          params.push(f.value);
          return f.sql(params.length);
        })
        .join(" and ")}`;
    };
    const returning = this.returning ? ` returning ${this.columnList()}` : "";

    let sql: string;
    switch (this.op) {
      case "select": {
        const w = where();
        const order = this.orderBy ? ` order by ${this.orderBy}` : "";
        sql = this.head
          ? `select count(*)::int as c from ${t}${w}`
          : `select ${this.columnList()} from ${t}${w}${order}`;
        break;
      }
      case "insert":
      case "upsert": {
        const rows = Array.isArray(this.payload)
          ? this.payload
          : [this.payload as Json];
        const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].map(
          ident,
        );
        params.push(JSON.stringify(rows));
        const cols = keys.join(", ");
        sql = `insert into ${t} (${cols}) select ${cols} from jsonb_populate_recordset(null::${t}, $1::jsonb)`;
        if (this.op === "upsert") {
          const sets = keys
            .filter((k) => k !== this.onConflict)
            .map((k) => `${k} = excluded.${k}`);
          sql += ` on conflict (${ident(this.onConflict)}) do update set ${sets.join(", ")}`;
        }
        sql += returning;
        break;
      }
      case "update": {
        const keys = Object.keys(this.payload as Json).map(ident);
        params.push(JSON.stringify(this.payload));
        const w = where();
        sql = `update ${t} as u set ${keys.map((k) => `${k} = r.${k}`).join(", ")} from (select ${keys.join(", ")} from jsonb_populate_record(null::${t}, $1::jsonb)) r${w}${returning}`;
        break;
      }
      case "delete":
        sql = `delete from ${t}${where()}${returning}`;
        break;
    }

    try {
      const rows = await this.exec(sql, params);
      if (this.head)
        return { data: null, error: null, count: (rows[0] as { c: number }).c };
      if (this.op === "select" || this.returning) {
        if (this.single === "maybe")
          return { data: rows[0] ?? null, error: null };
        if (this.single === "one") {
          return rows.length === 1
            ? { data: rows[0], error: null }
            : {
                data: null,
                error: {
                  message:
                    "JSON object requested, multiple (or no) rows returned",
                },
              };
        }
        return { data: rows, error: null };
      }
      return { data: null, error: null };
    } catch (e) {
      return {
        data: null,
        error: { message: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  private async exec(sql: string, params: unknown[]) {
    return runAs(this.db, this.actor, sql, params);
  }
}

async function runAs(db: PGlite, actor: Actor, sql: string, params: unknown[]) {
  return db.transaction(async (tx) => {
    const role = actor.userId === null ? "anon" : "authenticated";
    await tx.exec(`set local role ${role}`);
    if (actor.userId !== null) {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [
        actor.userId,
      ]);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          sub: actor.userId,
          role,
          is_anonymous: actor.anonymous ?? false,
        }),
      ]);
    }
    const r = await tx.query(sql, params);
    return r.rows as unknown[];
  });
}

export function createFakeSupabase(db: PGlite, actor: Actor): SupabaseClient {
  // insert().select().single() 과 select().maybeSingle() 모두 지원하기 위해 single 도 노출한다.
  const from = (table: string) => {
    const b = new Builder(db, actor, table);
    return Object.assign(b, { single: () => b.singleRow() });
  };
  const rpc = async (fn: string, args: Json): Promise<Result> => {
    try {
      const names = Object.keys(args).map(ident);
      const placeholders = names.map(
        (n, i) => `${n} => $${i + 1}${n === "p_snapshot" ? "::jsonb" : ""}`,
      );
      const values = names.map((n) =>
        n === "p_snapshot" ? JSON.stringify(args[n]) : args[n],
      );
      const rows = await runAs(
        db,
        actor,
        `select * from public.${ident(fn)}(${placeholders.join(", ")})`,
        values,
      );
      return { data: rows, error: null };
    } catch (e) {
      return {
        data: null,
        error: { message: e instanceof Error ? e.message : String(e) },
      };
    }
  };
  return { from, rpc } as unknown as SupabaseClient;
}
