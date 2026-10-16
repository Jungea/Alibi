export interface TallyRow {
  name: string;
  count: number;
}

export interface TallyResult {
  rows: TallyRow[];
  totalVotes: number;
  /** 최다 득표 후보들 (득표가 없으면 빈 배열) */
  winners: string[];
  isTie: boolean;
}

/**
 * 후보별 득표를 집계한다. votes는 candidates의 인덱스 배열이다.
 * 범위를 벗어난 인덱스는 무시한다. 결과는 득표 내림차순, 동률이면 입력 순서를 유지한다.
 */
export function tallyVotes(
  candidates: readonly string[],
  votes: readonly number[],
): TallyResult {
  const counts = candidates.map(() => 0);
  let totalVotes = 0;
  for (const v of votes) {
    if (Number.isInteger(v) && v >= 0 && v < candidates.length) {
      counts[v]++;
      totalVotes++;
    }
  }
  const rows = candidates
    .map((name, i) => ({ name, count: counts[i], order: i }))
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ name, count }) => ({ name, count }));

  const top = rows[0]?.count ?? 0;
  const winners =
    top > 0 ? rows.filter((r) => r.count === top).map((r) => r.name) : [];
  return { rows, totalVotes, winners, isTie: winners.length > 1 };
}
