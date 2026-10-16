"use client";

import { useEffect, useState } from "react";

import {
  LABELS,
  type Character,
  type ScenarioBundle,
} from "@/lib/schemas/scenario";
import { cn } from "@/lib/utils";

import { getImageUrl } from "./image-client";

type Viewer = { kind: "gm" } | { kind: "character"; id: string };

/**
 * 테스트 플레이: 인물을 바꿔가며 "그 플레이어에게 무엇이 보이는지"를 확인한다.
 * 실제 게임방(R3)과 같은 원칙 — 인물 본인에게는 자기 비밀 정보만, GM 에게는 진실 전체를 보여준다.
 */
export function PreviewClient({ bundle }: { bundle: ScenarioBundle }) {
  const [viewer, setViewer] = useState<Viewer>({ kind: "gm" });
  const { scenario: s } = bundle;
  const character =
    viewer.kind === "character"
      ? bundle.characters.find((c) => c.id === viewer.id)
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="보는 사람"
        className="flex flex-wrap gap-2"
      >
        <Chip
          active={viewer.kind === "gm"}
          onClick={() => setViewer({ kind: "gm" })}
        >
          GM (진실 전체)
        </Chip>
        {bundle.characters.map((c, i) => (
          <Chip
            key={c.id}
            active={viewer.kind === "character" && viewer.id === c.id}
            onClick={() => setViewer({ kind: "character", id: c.id })}
          >
            {c.name.trim() || `인물 ${i + 1}`}
          </Chip>
        ))}
      </div>

      <Card title="공통 정보 (모든 참가자)">
        <Row label="제목">{s.title}</Row>
        <Row label="피해자">{s.victim}</Row>
        <Row label="사건 시각 / 장소">
          {[s.incidentTime, s.incidentPlace].filter(Boolean).join(" / ")}
        </Row>
        <Row label="오프닝">{s.openingText}</Row>
      </Card>

      {character ? (
        <PlayerView bundle={bundle} character={character} />
      ) : (
        <GmView bundle={bundle} />
      )}
    </div>
  );
}

function PlayerView({
  bundle,
  character: c,
}: {
  bundle: ScenarioBundle;
  character: Character;
}) {
  const nameOf = (id: string) =>
    bundle.characters.find((x) => x.id === id)?.name || "이름 없음";
  const missions = bundle.missions.filter(
    (m) => !m.hidden && (m.scope === "common" || m.characterId === c.id),
  );

  return (
    <>
      <Card title={`내 인물: ${c.name || "이름 없음"}`}>
        <CharacterImage path={c.imagePath} alt={c.name} />
        <Row label="역할">{LABELS.roleType[c.roleType]}</Row>
        <Row label="공개 정보">{c.publicInfo}</Row>
        <Row label="비밀 정보">{c.secretInfo}</Row>
        <Row label="배경">{c.background}</Row>
        <Row label="개인 목표">{c.personalGoal}</Row>
        <Row label="거짓말">
          {LABELS.liePolicy[c.liePolicy]}
          {c.lieNote ? ` — ${c.lieNote}` : ""}
        </Row>
        {c.relations.length > 0 && (
          <Row label="관계">
            {c.relations
              .map((r) => `${nameOf(r.targetId)}: ${r.description || "-"}`)
              .join("\n")}
          </Row>
        )}
      </Card>

      {bundle.rounds.some((r) => c.roundInfos[r.id]) && (
        <Card title="라운드별 추가 정보 (해당 라운드 시작 시 공개)">
          {bundle.rounds.map((r) =>
            c.roundInfos[r.id] ? (
              <Row key={r.id} always label={r.name}>
                {c.roundInfos[r.id]}
              </Row>
            ) : null,
          )}
        </Card>
      )}

      <Card title="내 미션 (숨김 미션 제외)">
        {missions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            표시되는 미션이 없습니다.
          </p>
        ) : (
          missions.map((m) => (
            <Row
              key={m.id}
              always
              label={`${m.title || "제목 없음"} · ${LABELS.judgeType[m.judgeType]}`}
            >
              {m.description}
            </Row>
          ))
        )}
      </Card>

      <p className="text-muted-foreground text-xs">
        다른 인물의 비밀 정보, 아직 얻지 못한 힌트카드, 결말은 플레이어에게
        보이지 않습니다.
      </p>
    </>
  );
}

function GmView({ bundle }: { bundle: ScenarioBundle }) {
  const culprits = bundle.characters.filter((c) => c.roleType === "culprit");
  const nameOf = (id: string | null) =>
    id ? bundle.characters.find((x) => x.id === id)?.name || "이름 없음" : "-";
  return (
    <>
      <Card title="진실">
        <Row label="범인">
          {culprits.map((c) => c.name || "이름 없음").join(", ") ||
            "지정되지 않음"}
        </Row>
        <Row label="타임라인">
          {bundle.scenario.timeline
            .map(
              (t) =>
                `${t.time || "--:--"} ${nameOf(t.characterId)} @ ${t.place || "-"}: ${t.description}`,
            )
            .join("\n")}
        </Row>
      </Card>
      <Card title="라운드">
        {bundle.rounds.map((r, i) => (
          <Row
            key={r.id}
            always
            label={`${i + 1}. ${r.name || "이름 없음"}${r.timeLimitSeconds != null ? ` (${r.timeLimitSeconds}초)` : ""}`}
          >
            {[
              r.goal,
              r.allowedActions.map((a) => LABELS.allowedAction[a]).join(", "),
            ]
              .filter(Boolean)
              .join("\n")}
          </Row>
        ))}
      </Card>
      <Card title={`힌트카드 ${bundle.clues.length}장`}>
        {bundle.clues.map((c) => (
          <Row
            key={c.id}
            always
            label={`${c.title || "제목 없음"} · ${LABELS.clueKind[c.kind]}${c.isTrue ? "" : " · 거짓"}`}
          >
            {c.body}
          </Row>
        ))}
      </Card>
      <Card title="결말">
        {bundle.endings.map((e) => (
          <Row
            key={e.id}
            always
            label={`${e.name || "이름 없음"} · ${LABELS.endingCondition[e.conditionKind]}`}
          >
            {[e.resultText, e.truthText].filter(Boolean).join("\n\n")}
          </Row>
        ))}
      </Card>
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted hover:bg-muted/70",
      )}
    >
      {children}
    </button>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
  always = false,
}: {
  label: string;
  children?: React.ReactNode;
  /** true 면 내용이 비어 있어도 라벨은 보여준다 (미션·힌트처럼 제목 자체가 정보인 항목) */
  always?: boolean;
}) {
  const empty = children === "" || children === null || children === undefined;
  if (empty && !always) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {!empty && <p className="text-sm whitespace-pre-wrap">{children}</p>}
    </div>
  );
}

function CharacterImage({ path, alt }: { path: string | null; alt: string }) {
  const [resolved, setResolved] = useState<{
    path: string;
    url: string | null;
  } | null>(null);
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
  if (!url) return null;
  return (
    // 비공개 버킷의 임시(서명) 주소라 next/image 최적화 대상이 아니다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt || "인물 일러스트"}
      className="size-32 rounded-lg border object-cover"
    />
  );
}
