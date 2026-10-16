import { pickRandom, shuffle } from "@/lib/random";

/** 줄바꿈 또는 쉼표로 구분된 입력을 항목 배열로 바꾼다. 빈 항목은 버린다. */
export function parseList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface Assignment {
  player: string;
  character: string;
}

export type AssignResult =
  { ok: true; assignments: Assignment[] } | { ok: false; error: string };

/** 참가자에게 인물을 중복 없이 무작위로 배정한다. 두 목록의 길이가 같아야 한다. */
export function assignCharacters(
  players: readonly string[],
  characters: readonly string[],
): AssignResult {
  if (players.length === 0) {
    return { ok: false, error: "참가자 이름을 입력해 주세요." };
  }
  if (players.length !== characters.length) {
    return {
      ok: false,
      error: `참가자(${players.length}명)와 인물(${characters.length}명)의 수가 같아야 합니다.`,
    };
  }
  const shuffled = shuffle(characters);
  return {
    ok: true,
    assignments: players.map((player, i) => ({
      player,
      character: shuffled[i],
    })),
  };
}

export interface DrawResult {
  card: string;
  /** 뽑은 뒤 남은 카드 (excludeDrawn이 false면 그대로) */
  remaining: string[];
}

/** 카드 한 장을 무작위로 뽑는다. excludeDrawn이면 뽑은 카드는 남은 목록에서 빠진다. */
export function drawCard(
  pool: readonly string[],
  excludeDrawn: boolean,
): DrawResult | null {
  const card = pickRandom(pool);
  if (card === undefined) return null;
  if (!excludeDrawn) return { card, remaining: [...pool] };
  // 같은 이름의 카드가 여러 장일 수 있어 한 장만 제거한다.
  const idx = pool.indexOf(card);
  const remaining = [...pool.slice(0, idx), ...pool.slice(idx + 1)];
  return { card, remaining };
}

/** 발언 순서를 무작위로 정한다. */
export function speakingOrder(names: readonly string[]): string[] {
  return shuffle(names);
}
