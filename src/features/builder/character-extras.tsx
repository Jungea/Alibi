"use client";

import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Character, Round } from "@/lib/schemas/scenario";

import { getImageUrl, uploadCharacterImage } from "./image-client";

interface Props {
  character: Character;
  update: (patch: Partial<Character>) => void;
  characters: Character[];
  rounds: Round[];
  userId: string;
  scenarioId: string;
}

export function CharacterExtras({
  character,
  update,
  characters,
  rounds,
  userId,
  scenarioId,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      <ImageField
        character={character}
        update={update}
        userId={userId}
        scenarioId={scenarioId}
      />
      <RelationsField
        character={character}
        update={update}
        characters={characters}
      />
      <RoundInfosField character={character} update={update} rounds={rounds} />
    </div>
  );
}

function ImageField({
  character,
  update,
  userId,
  scenarioId,
}: Pick<Props, "character" | "update" | "userId" | "scenarioId">) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resolved, setResolved] = useState<{
    path: string;
    url: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = character.imagePath;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    getImageUrl(path).then((url) => {
      if (!cancelled) setResolved({ path, url });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const url = path && resolved?.path === path ? resolved.url : null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      update({
        imagePath: await uploadCharacterImage(file, userId, scenarioId),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드하지 못했습니다.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-medium">일러스트</span>
      <div className="flex items-center gap-3">
        <div className="bg-muted text-muted-foreground flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border text-xs">
          {url ? (
            // 비공개 버킷의 임시(서명) 주소라 next/image 최적화 대상이 아니다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`${character.name || "인물"} 일러스트`}
              className="size-full object-cover"
            />
          ) : (
            "없음"
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id={`img-${character.id}`}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus /> {busy ? "올리는 중…" : path ? "바꾸기" : "올리기"}
            </Button>
            {path && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => update({ imagePath: null })}
              >
                <X /> 제거
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            JPG·PNG·WebP, 올리기 전에 브라우저에서 자동으로 줄입니다.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

function RelationsField({
  character,
  update,
  characters,
}: Pick<Props, "character" | "update" | "characters">) {
  const others = characters.filter((c) => c.id !== character.id);
  const used = new Set(character.relations.map((r) => r.targetId));
  const available = others.filter((c) => !used.has(c.id));
  const nameOf = (id: string) =>
    characters.find((c) => c.id === id)?.name.trim() || "이름 없음";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-medium">
        다른 인물과의 관계
      </span>
      {character.relations.map((r) => (
        <div key={r.targetId} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-sm">
            {nameOf(r.targetId)}
          </span>
          <Input
            aria-label={`${nameOf(r.targetId)}와의 관계`}
            value={r.description}
            maxLength={500}
            placeholder="예: 오랜 친구, 채무 관계"
            onChange={(e) =>
              update({
                relations: character.relations.map((x) =>
                  x.targetId === r.targetId
                    ? { ...x, description: e.target.value }
                    : x,
                ),
              })
            }
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="관계 삭제"
            onClick={() =>
              update({
                relations: character.relations.filter(
                  (x) => x.targetId !== r.targetId,
                ),
              })
            }
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {available.length > 0 ? (
        <div>
          <select
            aria-label="관계를 추가할 인물"
            className="border-input bg-background dark:bg-input/30 h-8 rounded-lg border px-2 text-sm"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                update({
                  relations: [
                    ...character.relations,
                    { targetId: e.target.value, description: "" },
                  ],
                });
              }
            }}
          >
            <option value="">
              <Plus /> 관계 추가…
            </option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.trim() || "이름 없음"}
              </option>
            ))}
          </select>
        </div>
      ) : (
        character.relations.length === 0 && (
          <p className="text-muted-foreground text-xs">
            다른 인물을 추가하면 관계를 적을 수 있습니다.
          </p>
        )
      )}
    </div>
  );
}

function RoundInfosField({
  character,
  update,
  rounds,
}: Pick<Props, "character" | "update" | "rounds">) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm leading-none font-medium">
        라운드별 추가 정보
      </span>
      <p className="text-muted-foreground -mt-1 text-xs">
        해당 라운드가 시작될 때 이 인물에게만 추가로 공개됩니다. 비워두면 없음.
      </p>
      {rounds.map((r, i) => (
        <div key={r.id} className="flex flex-col gap-1.5">
          <Label htmlFor={`ri-${character.id}-${r.id}`}>
            {r.name.trim() || `라운드 ${i + 1}`}
          </Label>
          <Textarea
            id={`ri-${character.id}-${r.id}`}
            rows={2}
            maxLength={5000}
            value={character.roundInfos[r.id] ?? ""}
            onChange={(e) =>
              update({
                roundInfos: { ...character.roundInfos, [r.id]: e.target.value },
              })
            }
          />
        </div>
      ))}
    </div>
  );
}
