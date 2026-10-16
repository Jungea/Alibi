"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ALLOWED_ACTIONS,
  CLUE_KINDS,
  CLUE_VISIBILITIES,
  DIFFICULTIES,
  ENDING_CONDITIONS,
  JUDGE_TYPES,
  LABELS,
  LIE_POLICIES,
  LIST_LIMITS,
  MISSION_SCOPES,
  ROLE_TYPES,
  RUN_MODES,
  type Basic,
  type Character,
  type Clue,
  type Ending,
  type Mission,
  type Round,
  type ScenarioBundle,
  type Section,
  type TimelineEntry,
  type World,
} from "@/lib/schemas/scenario";

import {
  createCharacter,
  createClue,
  createEnding,
  createMission,
  createRound,
  createTimelineEntry,
  removeCharacter,
  removeMission,
  removeRound,
} from "./bundle";
import { CharacterExtras } from "./character-extras";
import {
  FieldGrid,
  type FieldDef,
  type Option,
  type RefOptions,
} from "./fields";
import { ListEditor } from "./list-editor";

export interface StepContext {
  bundle: ScenarioBundle;
  userId: string;
  scenarioId: string;
  /** 번들을 바꾸고, 영향받는 저장 단위를 표시한다 */
  edit: (
    mutate: (b: ScenarioBundle) => ScenarioBundle,
    sections: Section[],
  ) => void;
}

const opts = <K extends string>(
  values: readonly K[],
  labels: Record<K, string>,
): Option[] => values.map((v) => ({ value: v, label: labels[v] }));

function buildRefs(b: ScenarioBundle): RefOptions {
  return {
    characters: b.characters.map((c, i) => ({
      value: c.id,
      label: c.name.trim() || `인물 ${i + 1}`,
    })),
    rounds: b.rounds.map((r, i) => ({
      value: r.id,
      label: r.name.trim() || `라운드 ${i + 1}`,
    })),
    missions: b.missions.map((m, i) => ({
      value: m.id,
      label: m.title.trim() || `미션 ${i + 1}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// 1. 기본 정보
// ---------------------------------------------------------------------------
const BASIC_FIELDS: FieldDef<Basic>[] = [
  { type: "text", key: "title", label: "제목", maxLength: 100, full: true },
  {
    type: "text",
    key: "genre",
    label: "장르",
    maxLength: 50,
    placeholder: "예: 클래식 추리, 호러",
  },
  {
    type: "select",
    key: "difficulty",
    label: "난이도",
    options: opts(DIFFICULTIES, LABELS.difficulty),
  },
  {
    type: "number",
    key: "minPlayers",
    label: "최소 인원",
    min: 1,
    max: 20,
    suffix: "명",
  },
  {
    type: "number",
    key: "maxPlayers",
    label: "최대 인원",
    min: 1,
    max: 20,
    suffix: "명",
  },
  {
    type: "number",
    key: "estimatedMinutes",
    label: "예상 소요 시간",
    min: 5,
    max: 1440,
    suffix: "분",
  },
  {
    type: "select",
    key: "runMode",
    label: "진행 방식",
    options: opts(RUN_MODES, LABELS.runMode),
  },
  {
    type: "checkbox",
    key: "onlineSupported",
    label: "온라인",
    text: "온라인 플레이 지원",
  },
  {
    type: "checkbox",
    key: "offlineSupported",
    label: "오프라인",
    text: "오프라인(대면) 플레이 지원",
  },
];

export function BasicStep({ bundle, edit }: StepContext) {
  return (
    <FieldGrid
      fields={BASIC_FIELDS}
      item={bundle.scenario as Basic}
      refs={buildRefs(bundle)}
      onChange={(key, value) =>
        edit(
          (b) => ({ ...b, scenario: { ...b.scenario, [key]: value } }),
          ["basic"],
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// 2. 세계관과 사건 개요
// ---------------------------------------------------------------------------
const WORLD_FIELDS: FieldDef<World>[] = [
  {
    type: "textarea",
    key: "background",
    label: "세계관 / 배경",
    rows: 6,
    full: true,
  },
  { type: "text", key: "victim", label: "피해자", maxLength: 500 },
  {
    type: "text",
    key: "incidentTime",
    label: "사건 발생 시각",
    maxLength: 100,
    placeholder: "예: 21:30경",
  },
  {
    type: "text",
    key: "incidentPlace",
    label: "사건 발생 장소",
    maxLength: 200,
    full: true,
  },
  {
    type: "textarea",
    key: "openingText",
    label: "공통 오프닝 텍스트",
    rows: 6,
    full: true,
    hint: "게임 시작 시 모든 참가자에게 보여줄 글입니다. 범인이나 진실을 적지 마세요.",
  },
];

export function WorldStep({ bundle, edit }: StepContext) {
  return (
    <FieldGrid
      fields={WORLD_FIELDS}
      item={bundle.scenario as World}
      refs={buildRefs(bundle)}
      onChange={(key, value) =>
        edit(
          (b) => ({ ...b, scenario: { ...b.scenario, [key]: value } }),
          ["world"],
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// 3. 인물
// ---------------------------------------------------------------------------
const CHARACTER_FIELDS: FieldDef<Character>[] = [
  { type: "text", key: "name", label: "이름", maxLength: 50 },
  {
    type: "select",
    key: "roleType",
    label: "역할 유형",
    options: opts(ROLE_TYPES, LABELS.roleType),
  },
  {
    type: "textarea",
    key: "publicInfo",
    label: "공개 정보",
    rows: 3,
    full: true,
    hint: "모든 참가자가 볼 수 있습니다.",
  },
  {
    type: "textarea",
    key: "secretInfo",
    label: "비밀 정보",
    rows: 4,
    full: true,
    hint: "이 인물을 맡은 사람만 볼 수 있습니다.",
  },
  {
    type: "textarea",
    key: "background",
    label: "배경 스토리",
    rows: 4,
    full: true,
  },
  {
    type: "textarea",
    key: "personalGoal",
    label: "개인 목표",
    rows: 2,
    full: true,
  },
  {
    type: "select",
    key: "liePolicy",
    label: "거짓말 허용 범위",
    options: opts(LIE_POLICIES, LABELS.liePolicy),
  },
  { type: "text", key: "lieNote", label: "거짓말 관련 메모", maxLength: 2000 },
];

export function CharactersStep({
  bundle,
  edit,
  userId,
  scenarioId,
}: StepContext) {
  const refs = buildRefs(bundle);
  return (
    <ListEditor<Character>
      items={bundle.characters}
      fields={CHARACTER_FIELDS}
      refs={refs}
      max={LIST_LIMITS.characters}
      addLabel="인물 추가"
      emptyText="인물을 추가해 주세요. 참가자 수만큼 인물이 필요합니다."
      itemTitle={(c, i) =>
        `${i + 1}. ${c.name.trim() || "이름 없음"} · ${LABELS.roleType[c.roleType]}`
      }
      createItem={createCharacter}
      onChange={(characters) =>
        edit((b) => ({ ...b, characters }), ["characters"])
      }
      onRemove={(id) =>
        edit(
          (b) => removeCharacter(b, id),
          ["characters", "timeline", "clues", "missions", "endings"],
        )
      }
      renderExtra={(c, update) => (
        <CharacterExtras
          character={c}
          update={update}
          characters={bundle.characters}
          rounds={bundle.rounds}
          userId={userId}
          scenarioId={scenarioId}
        />
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// 4. 진실 타임라인
// ---------------------------------------------------------------------------
const TIMELINE_FIELDS: FieldDef<TimelineEntry>[] = [
  {
    type: "text",
    key: "time",
    label: "시각",
    maxLength: 20,
    placeholder: "HH:mm (예: 21:30)",
  },
  {
    type: "ref",
    key: "characterId",
    label: "인물",
    refs: "characters",
    emptyLabel: "(인물 없음 / 공통)",
  },
  { type: "text", key: "place", label: "장소", maxLength: 100 },
  {
    type: "textarea",
    key: "description",
    label: "있었던 일 (진실)",
    rows: 2,
    maxLength: 1000,
    full: true,
  },
];

export function TimelineStep({ bundle, edit }: StepContext) {
  const refs = buildRefs(bundle);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        실제로 있었던 일을 시간 순서대로 적습니다. 같은 인물이 같은 시각에 다른
        장소에 있으면 검수에서 경고합니다.
      </p>
      <ListEditor<TimelineEntry>
        items={bundle.scenario.timeline}
        fields={TIMELINE_FIELDS}
        refs={refs}
        max={200}
        addLabel="타임라인 항목 추가"
        emptyText="아직 항목이 없습니다."
        itemTitle={(t, i) =>
          `${i + 1}. ${t.time || "--:--"} ${t.place || ""}`.trim()
        }
        createItem={createTimelineEntry}
        onChange={(timeline) =>
          edit(
            (b) => ({ ...b, scenario: { ...b.scenario, timeline } }),
            ["timeline"],
          )
        }
        onRemove={(id) =>
          edit(
            (b) => ({
              ...b,
              scenario: {
                ...b.scenario,
                timeline: b.scenario.timeline.filter((t) => t.id !== id),
              },
            }),
            ["timeline"],
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. 라운드
// ---------------------------------------------------------------------------
const ROUND_FIELDS: FieldDef<Round>[] = [
  { type: "text", key: "name", label: "이름", maxLength: 50 },
  {
    type: "nullableNumber",
    key: "timeLimitSeconds",
    label: "시간 제한",
    min: 0,
    max: 86400,
    suffix: "초",
    placeholder: "비우면 제한 없음",
  },
  { type: "textarea", key: "goal", label: "목표", rows: 2, full: true },
  {
    type: "multi",
    key: "allowedActions",
    label: "허용 행동",
    options: opts(ALLOWED_ACTIONS, LABELS.allowedAction),
    full: true,
  },
  {
    type: "textarea",
    key: "unlockContent",
    label: "해금 콘텐츠",
    rows: 2,
    full: true,
    hint: "이 라운드가 시작될 때 공개할 내용을 적어 둡니다.",
  },
];

export function RoundsStep({ bundle, edit }: StepContext) {
  return (
    <ListEditor<Round>
      items={bundle.rounds}
      fields={ROUND_FIELDS}
      refs={buildRefs(bundle)}
      max={LIST_LIMITS.rounds}
      addLabel="라운드 추가"
      emptyText="라운드가 없습니다."
      itemTitle={(r, i) => `${i + 1}. ${r.name.trim() || "이름 없음"}`}
      createItem={createRound}
      onChange={(rounds) => edit((b) => ({ ...b, rounds }), ["rounds"])}
      onRemove={(id) =>
        edit((b) => removeRound(b, id), ["rounds", "characters", "clues"])
      }
    />
  );
}

// ---------------------------------------------------------------------------
// 6. 힌트카드
// ---------------------------------------------------------------------------
const CLUE_FIELDS: FieldDef<Clue>[] = [
  { type: "text", key: "title", label: "제목", maxLength: 100 },
  {
    type: "select",
    key: "kind",
    label: "종류",
    options: opts(CLUE_KINDS, LABELS.clueKind),
  },
  { type: "textarea", key: "body", label: "본문", rows: 3, full: true },
  {
    type: "text",
    key: "acquireCondition",
    label: "획득 조건",
    maxLength: 1000,
    full: true,
    placeholder: "예: 서재를 조사한 사람",
  },
  {
    type: "ref",
    key: "acquireRoundId",
    label: "획득 가능 라운드",
    refs: "rounds",
    emptyLabel: "(제한 없음)",
  },
  {
    type: "select",
    key: "visibility",
    label: "공개 범위",
    options: opts(CLUE_VISIBILITIES, LABELS.clueVisibility),
  },
  {
    type: "ref",
    key: "linkedCharacterId",
    label: "연결된 인물",
    refs: "characters",
    emptyLabel: "(없음)",
  },
  {
    type: "checkbox",
    key: "isTrue",
    label: "진위",
    text: "참인 단서 (거짓 단서면 체크 해제)",
  },
];

export function CluesStep({ bundle, edit }: StepContext) {
  return (
    <ListEditor<Clue>
      items={bundle.clues}
      fields={CLUE_FIELDS}
      refs={buildRefs(bundle)}
      max={LIST_LIMITS.clues}
      addLabel="힌트카드 추가"
      emptyText="힌트카드를 추가해 주세요."
      itemTitle={(c, i) =>
        `${i + 1}. ${c.title.trim() || "제목 없음"}${c.isTrue ? "" : " (거짓)"}`
      }
      createItem={createClue}
      onChange={(clues) => edit((b) => ({ ...b, clues }), ["clues"])}
      onRemove={(id) =>
        edit(
          (b) => ({ ...b, clues: b.clues.filter((c) => c.id !== id) }),
          ["clues"],
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// 7. 미션
// ---------------------------------------------------------------------------
const MISSION_FIELDS: FieldDef<Mission>[] = [
  { type: "text", key: "title", label: "제목", maxLength: 100 },
  {
    type: "select",
    key: "scope",
    label: "종류",
    options: opts(MISSION_SCOPES, LABELS.missionScope),
  },
  {
    type: "ref",
    key: "characterId",
    label: "대상 인물 (개인 미션)",
    refs: "characters",
    emptyLabel: "(선택)",
  },
  {
    type: "select",
    key: "judgeType",
    label: "판정 방식",
    options: opts(JUDGE_TYPES, LABELS.judgeType),
  },
  { type: "textarea", key: "description", label: "설명", rows: 3, full: true },
  {
    type: "checkbox",
    key: "hidden",
    label: "숨김 여부",
    text: "숨김 미션 (플레이 중에는 목록에 보이지 않음)",
  },
];

export function MissionsStep({ bundle, edit }: StepContext) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        자동 진행이 가능한 시나리오에서는 &apos;자가 보고&apos; 판정을 쓸 수
        없습니다. (검수에서 확인합니다)
      </p>
      <ListEditor<Mission>
        items={bundle.missions}
        fields={MISSION_FIELDS}
        refs={buildRefs(bundle)}
        max={LIST_LIMITS.missions}
        addLabel="미션 추가"
        emptyText="미션은 선택 사항입니다."
        itemTitle={(m, i) =>
          `${i + 1}. ${m.title.trim() || "제목 없음"} · ${LABELS.missionScope[m.scope]}`
        }
        createItem={createMission}
        onChange={(missions) => edit((b) => ({ ...b, missions }), ["missions"])}
        onRemove={(id) =>
          edit((b) => removeMission(b, id), ["missions", "endings"])
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. 결말
// ---------------------------------------------------------------------------
const ENDING_FIELDS: FieldDef<Ending>[] = [
  { type: "text", key: "name", label: "결말 이름", maxLength: 100 },
  {
    type: "select",
    key: "conditionKind",
    label: "조건",
    options: opts(ENDING_CONDITIONS, LABELS.endingCondition),
  },
  {
    type: "ref",
    key: "conditionMissionId",
    label: "조건에 쓸 미션",
    refs: "missions",
    emptyLabel: "(미션 조건일 때만 선택)",
  },
  {
    type: "textarea",
    key: "resultText",
    label: "1) 투표 결과 공개 텍스트",
    rows: 3,
    full: true,
  },
  {
    type: "textarea",
    key: "truthText",
    label: "2) 진실 공개 텍스트",
    rows: 4,
    full: true,
  },
];

export function EndingsStep({ bundle, edit }: StepContext) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        결말은 투표 결과 → 진실 → 인물별 후일담 순서로 단계별로 공개됩니다.
      </p>
      <ListEditor<Ending>
        items={bundle.endings}
        fields={ENDING_FIELDS}
        refs={buildRefs(bundle)}
        max={LIST_LIMITS.endings}
        addLabel="결말 추가"
        emptyText="결말을 하나 이상 추가해 주세요."
        itemTitle={(e, i) =>
          `${i + 1}. ${e.name.trim() || "이름 없음"} · ${LABELS.endingCondition[e.conditionKind]}`
        }
        createItem={createEnding}
        onChange={(endings) => edit((b) => ({ ...b, endings }), ["endings"])}
        onRemove={(id) =>
          edit(
            (b) => ({ ...b, endings: b.endings.filter((e) => e.id !== id) }),
            ["endings"],
          )
        }
        renderExtra={(e, update) => (
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-medium">3) 인물별 후일담</h4>
            {bundle.characters.length === 0 && (
              <p className="text-muted-foreground text-xs">
                인물을 먼저 추가하면 후일담을 적을 수 있습니다.
              </p>
            )}
            {bundle.characters.map((c, i) => (
              <div key={c.id} className="flex flex-col gap-1.5">
                <Label htmlFor={`epi-${e.id}-${c.id}`}>
                  {c.name.trim() || `인물 ${i + 1}`}
                </Label>
                <Textarea
                  id={`epi-${e.id}-${c.id}`}
                  rows={2}
                  maxLength={5000}
                  value={e.epilogues[c.id] ?? ""}
                  onChange={(ev) =>
                    update({
                      epilogues: { ...e.epilogues, [c.id]: ev.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}
