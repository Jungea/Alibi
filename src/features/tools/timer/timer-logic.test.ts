import { describe, expect, it } from "vitest";

import {
  createTimer,
  dueAlerts,
  extendTimer,
  formatTime,
  getRemainingMs,
  isFinished,
  pauseTimer,
  resetTimer,
  startTimer,
} from "./timer-logic";

const T0 = 1_700_000_000_000;
const base = () => createTimer("t1", "토론", 10 * 60_000);

describe("타이머 계산", () => {
  it("시작 후 남은 시간은 경과한 실제 시간만큼 줄어든다", () => {
    const t = startTimer(base(), T0);
    expect(getRemainingMs(t, T0)).toBe(600_000);
    expect(getRemainingMs(t, T0 + 1000)).toBe(599_000);
  });

  it("틱이 오래 멈춰 있다가(백그라운드 탭) 재개돼도 오차가 없다", () => {
    const t = startTimer(base(), T0);
    // 5분 동안 틱이 한 번도 없었던 상황
    expect(getRemainingMs(t, T0 + 300_000)).toBe(300_000);
  });

  it("종료 시각이 지나면 남은 시간은 0이고 끝난 상태다", () => {
    const t = startTimer(base(), T0);
    expect(getRemainingMs(t, T0 + 700_000)).toBe(0);
    expect(isFinished(t, T0 + 599_999)).toBe(false);
    expect(isFinished(t, T0 + 600_000)).toBe(true);
  });

  it("idle/paused 상태는 isFinished가 아니다", () => {
    expect(isFinished(base(), T0)).toBe(false);
  });

  it("일시정지하면 시간이 멈추고, 재개하면 남은 시간부터 다시 센다", () => {
    let t = startTimer(base(), T0);
    t = pauseTimer(t, T0 + 100_000);
    expect(t.status).toBe("paused");
    expect(getRemainingMs(t, T0 + 999_999)).toBe(500_000);
    t = startTimer(t, T0 + 200_000);
    expect(getRemainingMs(t, T0 + 200_000)).toBe(500_000);
    expect(getRemainingMs(t, T0 + 260_000)).toBe(440_000);
  });

  it("running이 아닌 타이머를 pause해도 그대로다", () => {
    const t = base();
    expect(pauseTimer(t, T0)).toBe(t);
  });

  it("이미 running인 타이머를 다시 start해도 그대로다", () => {
    const t = startTimer(base(), T0);
    expect(startTimer(t, T0 + 5000)).toBe(t);
  });

  it("초기화하면 처음 시간으로 돌아간다", () => {
    let t = startTimer(base(), T0);
    t = resetTimer(t);
    expect(t.status).toBe("idle");
    expect(getRemainingMs(t, T0 + 50_000)).toBe(600_000);
  });

  it("끝난 타이머를 다시 시작하면 처음 시간부터 돈다", () => {
    let t = startTimer(base(), T0);
    t = pauseTimer({ ...t, endAt: T0 }, T0 + 1000);
    expect(t.remainingMs).toBe(0);
    t = startTimer(t, T0 + 2000);
    expect(getRemainingMs(t, T0 + 2000)).toBe(600_000);
  });
});

describe("연장", () => {
  it("실행 중 연장하면 종료 시각이 늘어난다", () => {
    let t = startTimer(base(), T0);
    t = extendTimer(t, 60_000, T0 + 1000);
    expect(getRemainingMs(t, T0 + 1000)).toBe(659_000);
  });

  it("이미 끝난 타이머를 연장하면 지금부터 ms만큼 돈다", () => {
    let t = startTimer(base(), T0);
    t = extendTimer(t, 60_000, T0 + 700_000);
    expect(getRemainingMs(t, T0 + 700_000)).toBe(60_000);
    expect(isFinished(t, T0 + 700_000)).toBe(false);
  });

  it("정지 상태에서 연장하면 남은 시간이 늘어난다", () => {
    const t = extendTimer(base(), 60_000, T0);
    expect(t.remainingMs).toBe(660_000);
  });
});

describe("경고", () => {
  it("1분 전, 30초 전, 종료 경고가 순서대로 도래한다", () => {
    const d = 600_000;
    expect(dueAlerts(61_000, d)).toEqual([]);
    expect(dueAlerts(60_000, d)).toEqual(["minute"]);
    expect(dueAlerts(30_000, d)).toEqual(["minute", "thirty"]);
    expect(dueAlerts(0, d)).toEqual(["minute", "thirty", "end"]);
  });

  it("전체 시간이 짧은 타이머는 해당 사전 경고를 건너뛴다", () => {
    expect(dueAlerts(20_000, 45_000)).toEqual(["thirty"]);
    expect(dueAlerts(0, 20_000)).toEqual(["end"]);
  });
});

describe("formatTime", () => {
  it("mm:ss 형식이고 올림 처리한다", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(1)).toBe("00:01");
    expect(formatTime(59_001)).toBe("01:00");
    expect(formatTime(125_000)).toBe("02:05");
  });

  it("1시간 이상이면 h:mm:ss", () => {
    expect(formatTime(3_600_000)).toBe("1:00:00");
    expect(formatTime(3_725_000)).toBe("1:02:05");
  });

  it("음수는 0으로 처리한다", () => {
    expect(formatTime(-500)).toBe("00:00");
  });
});
