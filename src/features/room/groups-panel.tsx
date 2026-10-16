"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { RoomContext } from "./room-client";
import { runRoomCommand, type RoomCommandName } from "./state";
import type { RoomGroup } from "./types";

type Args<K extends RoomCommandName> = Parameters<typeof runRoomCommand<K>>[2];

/**
 * 그룹 만들기·참여·멤버 관리. 그룹은 인물 이름으로만 다룬다 (누가 어느 인물인지는 드러나지 않는다).
 * 비밀 그룹은 멤버와 GM 에게만 보이고, 공개 그룹은 누구나 들어올 수 있다.
 */
export function GroupManager({
  ctx,
  groups,
  reload,
}: {
  ctx: RoomContext;
  groups: RoomGroup[];
  reload: () => void;
}) {
  const { overview, supabase } = ctx;
  const isGm = overview.isGm;
  const [name, setName] = useState("");
  const [secret, setSecret] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const nameOf = (id: string) =>
    overview.characters.find((c) => c.id === id)?.name || "이름 없음";
  const others = overview.characters.filter(
    (c) => c.id !== overview.myCharacterId,
  );

  const exec = async <K extends RoomCommandName>(fn: K, args: Args<K>) => {
    setPending(true);
    setError(null);
    const res = await runRoomCommand(supabase, fn, args);
    setPending(false);
    if (!res.ok) setError(res.error);
    reload();
    return res.ok;
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await exec("create_group", {
      p_room: ctx.roomId,
      p_name: name.trim(),
      p_secret: secret,
      p_characters: picked,
    });
    if (ok) {
      setName("");
      setPicked([]);
    }
  };

  const mine = groups.filter((g) => g.isMember);
  const joinable = groups.filter((g) => !g.isMember && !g.isSecret);
  const seenByGm = isGm ? groups : [];

  return (
    <div className="flex flex-col gap-4 text-sm">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}

      {isGm ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">모든 그룹 (GM만 보임)</h3>
          {seenByGm.length === 0 && (
            <p className="text-muted-foreground">만들어진 그룹이 없습니다.</p>
          )}
          <ul className="flex flex-col gap-1">
            {seenByGm.map((g) => (
              <li key={g.id}>
                <span className="font-medium">{g.name}</span>{" "}
                <span className="text-muted-foreground">
                  {g.isSecret ? "비밀" : "공개"} ·{" "}
                  {g.members.map(nameOf).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">내 그룹</h3>
            {mine.length === 0 && (
              <p className="text-muted-foreground">속한 그룹이 없습니다.</p>
            )}
            <ul className="flex flex-col gap-3">
              {mine.map((g) => (
                <li
                  key={g.id}
                  className="flex flex-col gap-1.5 rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {g.isSecret ? "비밀" : "공개"}
                      {g.isOwner ? " · 내가 만듦" : ""}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`'${g.name}' 그룹에서 나갈까요?`))
                          void exec("leave_group", { p_group: g.id });
                      }}
                    >
                      나가기
                    </Button>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {g.members.map((m) => (
                      <li
                        key={m}
                        className="bg-muted flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs"
                      >
                        {nameOf(m)}
                        {g.isOwner && m !== overview.myCharacterId && (
                          <button
                            type="button"
                            aria-label={`${nameOf(m)} 내보내기`}
                            disabled={pending}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              void exec("remove_group_member", {
                                p_group: g.id,
                                p_character: m,
                              })
                            }
                          >
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {g.isOwner && (
                    <AddMember
                      candidates={others.filter(
                        (c) => !g.members.includes(c.id),
                      )}
                      disabled={pending}
                      onAdd={(character) =>
                        void exec("add_group_member", {
                          p_group: g.id,
                          p_character: character,
                        })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>

          {joinable.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="font-medium">참여할 수 있는 공개 그룹</h3>
              <ul className="flex flex-col gap-1.5">
                {joinable.map((g) => (
                  <li key={g.id} className="flex items-center gap-2">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {g.members.map(nameOf).join(", ")}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      disabled={pending}
                      onClick={() => void exec("join_group", { p_group: g.id })}
                    >
                      참여
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <form onSubmit={create} className="flex flex-col gap-2">
            <h3 className="font-medium">새 그룹 만들기</h3>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="그룹 이름 (20자 이내)"
              aria-label="그룹 이름"
            />
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
              <legend className="text-muted-foreground mb-1 text-xs">
                함께할 인물 (1명 이상)
              </legend>
              {others.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={picked.includes(c.id)}
                    onChange={(e) =>
                      setPicked((p) =>
                        e.target.checked
                          ? [...p, c.id]
                          : p.filter((x) => x !== c.id),
                      )
                    }
                  />
                  {c.name || "이름 없음"}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={secret}
                onChange={(e) => setSecret(e.target.checked)}
              />
              비밀 그룹 (초대받은 사람만 보이고, 스스로 들어올 수 없음)
            </label>
            <Button
              type="submit"
              className="self-start"
              disabled={pending || !name.trim() || picked.length === 0}
            >
              만들기
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

function AddMember({
  candidates,
  disabled,
  onAdd,
}: {
  candidates: { id: string; name: string }[];
  disabled: boolean;
  onAdd: (characterId: string) => void;
}) {
  const [value, setValue] = useState("");
  if (candidates.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="추가할 인물"
        className="bg-background rounded-md border px-2 py-1 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">멤버 추가…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || "이름 없음"}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !value}
        onClick={() => {
          onAdd(value);
          setValue("");
        }}
      >
        추가
      </Button>
    </div>
  );
}
