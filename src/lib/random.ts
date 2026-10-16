/** 암호학적으로 안전한 난수 유틸. Math.random은 사용하지 않는다. */

const UINT32_RANGE = 0x1_0000_0000;

/** 0 이상 max 미만의 정수를 편향 없이(rejection sampling) 뽑는다. */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > UINT32_RANGE) {
    throw new RangeError(`max must be an integer in 1..${UINT32_RANGE}`);
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % max);
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

/** Fisher–Yates 셔플. 원본은 건드리지 않고 새 배열을 반환한다. */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 배열에서 하나를 무작위로 고른다. 빈 배열이면 undefined. */
export function pickRandom<T>(items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(items.length)];
}
