/**
 * 종료 시각(endAt) 기반 타이머 계산.
 * setInterval 틱을 누적하지 않고 항상 "종료 시각 - 현재 시각"으로 남은 시간을 구하므로
 * 백그라운드 탭에서 틱이 느려져도 오차가 쌓이지 않는다.
 * 모든 함수는 순수 함수이며 현재 시각(now)은 인자로 받는다.
 */

export type TimerStatus = "idle" | "running" | "paused";

export interface TimerModel {
  id: string;
  name: string;
  durationMs: number;
  status: TimerStatus;
  /** running일 때만 의미 있는 종료 시각 (epoch ms) */
  endAt: number | null;
  /** idle/paused일 때의 남은 시간 */
  remainingMs: number;
}

export type AlertKey = "minute" | "thirty" | "end";

export const ALERT_THRESHOLDS: Record<AlertKey, number> = {
  minute: 60_000,
  thirty: 30_000,
  end: 0,
};

export function createTimer(
  id: string,
  name: string,
  durationMs: number,
): TimerModel {
  return {
    id,
    name,
    durationMs,
    status: "idle",
    endAt: null,
    remainingMs: durationMs,
  };
}

export function getRemainingMs(timer: TimerModel, now: number): number {
  if (timer.status === "running" && timer.endAt !== null) {
    return Math.max(0, timer.endAt - now);
  }
  return timer.remainingMs;
}

export function isFinished(timer: TimerModel, now: number): boolean {
  return (
    timer.status === "running" && timer.endAt !== null && timer.endAt <= now
  );
}

export function startTimer(timer: TimerModel, now: number): TimerModel {
  if (timer.status === "running") return timer;
  const remaining =
    timer.remainingMs > 0 ? timer.remainingMs : timer.durationMs;
  return {
    ...timer,
    status: "running",
    endAt: now + remaining,
    remainingMs: remaining,
  };
}

export function pauseTimer(timer: TimerModel, now: number): TimerModel {
  if (timer.status !== "running") return timer;
  return {
    ...timer,
    status: "paused",
    endAt: null,
    remainingMs: getRemainingMs(timer, now),
  };
}

export function resetTimer(timer: TimerModel): TimerModel {
  return {
    ...timer,
    status: "idle",
    endAt: null,
    remainingMs: timer.durationMs,
  };
}

/** 남은 시간을 ms만큼 늘린다. 이미 끝난 타이머는 지금부터 ms만큼 다시 돈다. */
export function extendTimer(
  timer: TimerModel,
  ms: number,
  now: number,
): TimerModel {
  if (timer.status === "running" && timer.endAt !== null) {
    return { ...timer, endAt: Math.max(timer.endAt, now) + ms };
  }
  return { ...timer, remainingMs: timer.remainingMs + ms };
}

/**
 * 남은 시간 기준으로 이미 지나간 경고 키를 반환한다.
 * 전체 시간이 임계값 이하인 타이머에서는 해당 사전 경고를 건너뛴다.
 */
export function dueAlerts(remainingMs: number, durationMs: number): AlertKey[] {
  const due: AlertKey[] = [];
  if (
    durationMs > ALERT_THRESHOLDS.minute &&
    remainingMs <= ALERT_THRESHOLDS.minute
  ) {
    due.push("minute");
  }
  if (
    durationMs > ALERT_THRESHOLDS.thirty &&
    remainingMs <= ALERT_THRESHOLDS.thirty
  ) {
    due.push("thirty");
  }
  if (remainingMs <= ALERT_THRESHOLDS.end) due.push("end");
  return due;
}

/** 표시용 포맷. 남은 시간은 올림해서 0초가 되는 순간에 00:00이 된다. */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
