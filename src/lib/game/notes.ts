/**
 * 추리노트 (순수 함수). 노트는 참가자 본인만 읽고 쓰며, 서버에는 이 모양의 JSON 한 덩어리로 저장된다.
 * 모든 편집 함수는 새 객체를 돌려주고, 한도(칸 수·글자 수)는 여기서 한 번에 지킨다.
 */
import { z } from "zod";

export const NOTES_LIMITS = {
  memo: 4000,
  slots: 8,
  slotLabel: 10,
  cellClues: 6,
  cellNote: 100,
  tags: 100,
  tagLabel: 80,
  edges: 60,
  edgeLabel: 20,
} as const;

export const TAGS = ["suspect", "contradiction"] as const;
export type NoteTag = (typeof TAGS)[number];
export const TAG_LABELS: Record<NoteTag, string> = {
  suspect: "의심",
  contradiction: "모순",
};

const uuid = z.uuid();
/** 힌트·발언을 가리키는 키: clue:<uuid> / msg:<번호> */
const TAG_KEY = /^(clue:[0-9a-f-]{36}|msg:\d{1,15})$/;
const GRID_KEY = /^[0-9a-f-]{36}\|[0-7]$/;

export const cellSchema = z.object({
  clues: z.array(uuid).max(NOTES_LIMITS.cellClues),
  conflict: z.boolean(),
  note: z.string().max(NOTES_LIMITS.cellNote),
});
export type NoteCell = z.infer<typeof cellSchema>;

export const notesSchema = z.object({
  v: z.literal(1),
  /** 인물 ID → 의심도 0~100 */
  suspicion: z.record(uuid, z.number().int().min(0).max(100)),
  tags: z.record(
    z.string().regex(TAG_KEY),
    z.object({
      tag: z.enum(TAGS),
      label: z.string().max(NOTES_LIMITS.tagLabel),
    }),
  ),
  /** 알리바이 표의 시간 칸 이름 */
  slots: z
    .array(z.string().max(NOTES_LIMITS.slotLabel))
    .max(NOTES_LIMITS.slots),
  /** "인물ID|시간칸번호" → 칸 내용 */
  grid: z.record(z.string().regex(GRID_KEY), cellSchema),
  edges: z
    .array(
      z.object({
        a: uuid,
        b: uuid,
        label: z.string().max(NOTES_LIMITS.edgeLabel),
      }),
    )
    .max(NOTES_LIMITS.edges),
  memo: z.string().max(NOTES_LIMITS.memo),
});
export type Notes = z.infer<typeof notesSchema>;

export const emptyNotes = (): Notes => ({
  v: 1,
  suspicion: {},
  tags: {},
  slots: ["", "", ""],
  grid: {},
  edges: [],
  memo: "",
});

/** 서버에서 받은 값을 안전하게 읽는다. 모양이 맞지 않으면 빈 노트로 시작한다. */
export function parseNotes(data: unknown): Notes {
  const r = notesSchema.safeParse(data);
  return r.success ? r.data : emptyNotes();
}

export const gridKey = (characterId: string, slot: number) =>
  `${characterId}|${slot}`;

export function setSuspicion(
  n: Notes,
  characterId: string,
  value: number,
): Notes {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return { ...n, suspicion: { ...n.suspicion, [characterId]: v } };
}

/** 같은 태그를 다시 누르면 지우고, 다른 태그를 누르면 바꾼다. 한도를 넘으면 새 태그는 무시한다. */
export function toggleTag(
  n: Notes,
  key: string,
  tag: NoteTag,
  label: string,
): Notes {
  const current = n.tags[key];
  if (current?.tag === tag) {
    const rest = { ...n.tags };
    delete rest[key];
    return { ...n, tags: rest };
  }
  if (!current && Object.keys(n.tags).length >= NOTES_LIMITS.tags) return n;
  return {
    ...n,
    tags: {
      ...n.tags,
      [key]: { tag, label: label.slice(0, NOTES_LIMITS.tagLabel) },
    },
  };
}

export function setSlotLabel(n: Notes, index: number, label: string): Notes {
  if (index < 0 || index >= n.slots.length) return n;
  const slots = n.slots.slice();
  slots[index] = label.slice(0, NOTES_LIMITS.slotLabel);
  return { ...n, slots };
}

export function addSlot(n: Notes): Notes {
  if (n.slots.length >= NOTES_LIMITS.slots) return n;
  return { ...n, slots: [...n.slots, ""] };
}

/** 마지막 시간 칸을 지우고 그 칸에 있던 내용도 함께 지운다. */
export function removeLastSlot(n: Notes): Notes {
  if (n.slots.length <= 1) return n;
  const last = n.slots.length - 1;
  const grid = Object.fromEntries(
    Object.entries(n.grid).filter(([k]) => Number(k.split("|")[1]) !== last),
  );
  return { ...n, slots: n.slots.slice(0, last), grid };
}

const emptyCell = (): NoteCell => ({ clues: [], conflict: false, note: "" });

function withCell(
  n: Notes,
  key: string,
  update: (c: NoteCell) => NoteCell,
): Notes {
  const next = update(n.grid[key] ?? emptyCell());
  const grid = { ...n.grid };
  if (next.clues.length === 0 && !next.conflict && !next.note) delete grid[key];
  else grid[key] = next;
  return { ...n, grid };
}

/** 힌트를 칸에 놓는다. 이미 다른 칸에 있으면 옮긴다(한 힌트는 한 칸에만). 칸이 가득 차면 무시한다. */
export function placeClue(
  n: Notes,
  characterId: string,
  slot: number,
  clueId: string,
): Notes {
  if (slot < 0 || slot >= n.slots.length) return n;
  const key = gridKey(characterId, slot);
  const target = n.grid[key];
  if (target?.clues.includes(clueId)) return n;
  if ((target?.clues.length ?? 0) >= NOTES_LIMITS.cellClues) return n;

  let next = n;
  for (const [k, cell] of Object.entries(n.grid)) {
    if (cell.clues.includes(clueId))
      next = withCell(next, k, (c) => ({
        ...c,
        clues: c.clues.filter((x) => x !== clueId),
      }));
  }
  return withCell(next, key, (c) => ({ ...c, clues: [...c.clues, clueId] }));
}

export function removeClueFromGrid(n: Notes, clueId: string): Notes {
  let next = n;
  for (const [k, cell] of Object.entries(n.grid)) {
    if (cell.clues.includes(clueId))
      next = withCell(next, k, (c) => ({
        ...c,
        clues: c.clues.filter((x) => x !== clueId),
      }));
  }
  return next;
}

export function toggleConflict(n: Notes, key: string): Notes {
  return withCell(n, key, (c) => ({ ...c, conflict: !c.conflict }));
}

export function setCellNote(n: Notes, key: string, note: string): Notes {
  return withCell(n, key, (c) => ({
    ...c,
    note: note.slice(0, NOTES_LIMITS.cellNote),
  }));
}

const sameEdge = (e: Notes["edges"][number], a: string, b: string) =>
  (e.a === a && e.b === b) || (e.a === b && e.b === a);

/** 두 인물 사이의 선을 켜고 끈다(순서 무관, 자기 자신과는 연결하지 않는다). */
export function toggleEdge(n: Notes, a: string, b: string): Notes {
  if (a === b) return n;
  if (n.edges.some((e) => sameEdge(e, a, b)))
    return { ...n, edges: n.edges.filter((e) => !sameEdge(e, a, b)) };
  if (n.edges.length >= NOTES_LIMITS.edges) return n;
  return { ...n, edges: [...n.edges, { a, b, label: "" }] };
}

export function setEdgeLabel(
  n: Notes,
  a: string,
  b: string,
  label: string,
): Notes {
  return {
    ...n,
    edges: n.edges.map((e) =>
      sameEdge(e, a, b)
        ? { ...e, label: label.slice(0, NOTES_LIMITS.edgeLabel) }
        : e,
    ),
  };
}

export function setMemo(n: Notes, memo: string): Notes {
  return { ...n, memo: memo.slice(0, NOTES_LIMITS.memo) };
}

/** 더 이상 없는 인물·힌트를 가리키는 항목을 정리한다. */
export function pruneNotes(
  n: Notes,
  validCharacterIds: ReadonlySet<string>,
  validClueIds: ReadonlySet<string>,
): Notes {
  const grid: Notes["grid"] = {};
  for (const [k, cell] of Object.entries(n.grid)) {
    const [charId, slot] = k.split("|");
    if (!validCharacterIds.has(charId) || Number(slot) >= n.slots.length)
      continue;
    const clues = cell.clues.filter((c) => validClueIds.has(c));
    if (clues.length || cell.conflict || cell.note)
      grid[k] = { ...cell, clues };
  }
  return {
    ...n,
    suspicion: Object.fromEntries(
      Object.entries(n.suspicion).filter(([id]) => validCharacterIds.has(id)),
    ),
    edges: n.edges.filter(
      (e) => validCharacterIds.has(e.a) && validCharacterIds.has(e.b),
    ),
    grid,
  };
}
