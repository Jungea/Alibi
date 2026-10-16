/**
 * 게임방 상태 머신 (순수 함수). DB 의 전환 RPC 와 같은 규칙을 가지며,
 * 화면에서 "지금 누를 수 있는 버튼"을 정하는 데 쓴다. 실제 권한·단계 검사는 항상 DB 가 한다.
 */

export const ROOM_STATUSES = [
  "lobby",
  "intro",
  "round",
  "break",
  "voting",
  "ended",
] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export type RoomEvent =
  "start_game" | "start_round" | "end_round" | "start_vote" | "finish_game";

export interface RoomProgress {
  status: RoomStatus;
  /** 지금까지 시작한 마지막 라운드의 인덱스 (시작 전이면 -1) */
  currentRoundIndex: number;
  roundCount: number;
  /** 다음 라운드에 투표가 허용되는지 */
  nextRoundAllowsVote?: boolean;
}

export const STATUS_LABELS: Record<RoomStatus, string> = {
  lobby: "대기실",
  intro: "인물 확인",
  round: "라운드 진행 중",
  break: "라운드 사이",
  voting: "투표",
  ended: "종료",
};

/** 해당 단계에서 일어날 수 있는 이벤트 → 전환 결과. 불가능하면 null. */
export function transition(
  progress: RoomProgress,
  event: RoomEvent,
): RoomStatus | null {
  const { status } = progress;
  const hasNextRound = progress.currentRoundIndex + 1 < progress.roundCount;

  switch (event) {
    case "start_game":
      return status === "lobby" ? "intro" : null;
    case "start_round":
      if ((status !== "intro" && status !== "break") || !hasNextRound)
        return null;
      return progress.nextRoundAllowsVote ? "voting" : "round";
    case "end_round":
      return status === "round" || status === "voting" ? "break" : null;
    case "start_vote":
      return status === "round" || status === "break" ? "voting" : null;
    case "finish_game":
      return status === "break" || status === "voting" ? "ended" : null;
  }
}

export function availableEvents(progress: RoomProgress): RoomEvent[] {
  const all: RoomEvent[] = [
    "start_game",
    "start_round",
    "end_round",
    "start_vote",
    "finish_game",
  ];
  return all.filter((e) => transition(progress, e) !== null);
}

/** 타이머가 켜져 있을 수 있는 단계 */
export function hasTimerPhase(status: RoomStatus): boolean {
  return status === "round" || status === "voting";
}

// ---------------------------------------------------------------------------
// 타이머: 종료 시각 + 서버 시각 기준으로 남은 시간을 계산한다.
// ---------------------------------------------------------------------------

export interface RoomTimer {
  /** 실행 중이면 ISO 종료 시각 */
  timerEndsAt: string | null;
  /** 일시정지 중이면 남은 초 */
  timerPausedRemaining: number | null;
}

export type TimerView =
  | { kind: "none" }
  | { kind: "running"; remainingMs: number }
  | { kind: "paused"; remainingMs: number };

/**
 * @param serverOffsetMs 서버 시각 - 이 기기 시각 (조회 시점에 한 번 계산). 기기 시계가 틀려도 같은 값을 보게 한다.
 */
export function timerView(
  timer: RoomTimer,
  nowMs: number,
  serverOffsetMs = 0,
): TimerView {
  if (timer.timerPausedRemaining !== null)
    return { kind: "paused", remainingMs: timer.timerPausedRemaining * 1000 };
  if (timer.timerEndsAt === null) return { kind: "none" };
  const end = Date.parse(timer.timerEndsAt);
  if (Number.isNaN(end)) return { kind: "none" };
  return {
    kind: "running",
    remainingMs: Math.max(0, end - (nowMs + serverOffsetMs)),
  };
}

export function computeServerOffset(serverNowIso: string, clientNowMs: number) {
  const server = Date.parse(serverNowIso);
  return Number.isNaN(server) ? 0 : server - clientNowMs;
}

export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// 초대 코드 / 닉네임 (DB 와 같은 규칙)
// ---------------------------------------------------------------------------

export const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const NICKNAME_MAX = 20;

/** 입력값을 코드 형태로 정리한다 (공백 제거, 대문자). 형식이 맞지 않으면 null. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.replace(/\s+/g, "").toUpperCase();
  return INVITE_CODE_PATTERN.test(code) ? code : null;
}

export function validateNickname(input: string): string | null {
  const nick = input.trim();
  if (nick.length < 1) return "닉네임을 입력해 주세요.";
  if (nick.length > NICKNAME_MAX)
    return `닉네임은 ${NICKNAME_MAX}자 이하여야 합니다.`;
  if (/[\u0000-\u001f\u007f]/.test(nick))
    return "닉네임에 사용할 수 없는 문자가 있습니다.";
  return null;
}
