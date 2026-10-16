"use client";

import { LABELS } from "@/lib/schemas/scenario";

import type { RoomContext } from "./room-client";
import { fetchMyCharacter } from "./state";
import { useRemote } from "./use-remote";

function Row({ label, children }: { label: string; children?: string }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="text-sm whitespace-pre-wrap">{children}</p>
    </div>
  );
}

const label = <T extends Record<string, string>>(map: T, key: string) =>
  (map as Record<string, string>)[key] ?? key;

/** 내 인물 카드. 서버가 본인 것만 돌려주므로 다른 인물의 비밀은 이 화면에 오지 않는다. */
export function CharacterCardPanel({ ctx }: { ctx: RoomContext }) {
  const { data: card, error } = useRemote(
    () => fetchMyCharacter(ctx.supabase, ctx.roomId),
    ctx.pulse,
  );

  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">내 인물</h2>
        <span className="text-muted-foreground text-xs">
          다른 사람에게 화면을 보여주지 마세요
        </span>
      </div>
      {error && !card && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {card === null && !error && (
        <p className="text-muted-foreground text-sm">불러오는 중…</p>
      )}
      {card && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold">{card.name || "이름 없음"}</p>
            <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs">
              {label(LABELS.roleType, card.roleType)}
            </span>
          </div>
          <Row label="공개 정보">{card.publicInfo}</Row>
          <Row label="나만 아는 비밀">{card.secretInfo}</Row>
          <Row label="배경">{card.background}</Row>
          <Row label="개인 목표">{card.personalGoal}</Row>
          <Row label="거짓말 규칙">
            {`${label(LABELS.liePolicy, card.liePolicy)}${card.lieNote ? ` — ${card.lieNote}` : ""}`}
          </Row>
          {card.relations.length > 0 && (
            <Row label="관계">
              {card.relations
                .map(
                  (r) =>
                    `${r.targetName ?? "알 수 없음"}: ${r.description || "-"}`,
                )
                .join("\n")}
            </Row>
          )}
          {card.roundInfos.length > 0 && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <span className="text-muted-foreground text-xs">
                라운드별 추가 정보
              </span>
              {card.roundInfos.map((r) => (
                <Row key={r.roundName} label={r.roundName}>
                  {r.text}
                </Row>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
