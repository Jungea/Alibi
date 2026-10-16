import { describe, expect, it } from "vitest";

import {
  availableEvents,
  computeServerOffset,
  formatRemaining,
  normalizeInviteCode,
  timerView,
  transition,
  validateNickname,
  type RoomProgress,
} from "./room-state";

const base: RoomProgress = {
  status: "lobby",
  currentRoundIndex: -1,
  roundCount: 3,
};

describe("transition", () => {
  it("대기실에서는 게임 시작만 가능하다", () => {
    expect(availableEvents(base)).toEqual(["start_game"]);
  });

  it("인물 확인 후 첫 라운드를 시작한다", () => {
    const p = { ...base, status: "intro" as const };
    expect(transition(p, "start_round")).toBe("round");
    expect(transition(p, "end_round")).toBeNull();
  });

  it("투표가 허용된 라운드는 voting 단계가 된다", () => {
    const p = {
      ...base,
      status: "break" as const,
      currentRoundIndex: 1,
      nextRoundAllowsVote: true,
    };
    expect(transition(p, "start_round")).toBe("voting");
  });

  it("마지막 라운드 뒤에는 더 시작할 수 없다", () => {
    const p = { ...base, status: "break" as const, currentRoundIndex: 2 };
    expect(transition(p, "start_round")).toBeNull();
    expect(transition(p, "finish_game")).toBe("ended");
  });

  it("진행 중인 라운드는 끝낼 수 있고 바로 종료할 수는 없다", () => {
    const p = { ...base, status: "round" as const, currentRoundIndex: 0 };
    expect(transition(p, "end_round")).toBe("break");
    expect(transition(p, "finish_game")).toBeNull();
    expect(transition(p, "start_vote")).toBe("voting");
  });

  it("종료된 방에서는 아무것도 할 수 없다", () => {
    expect(availableEvents({ ...base, status: "ended" })).toEqual([]);
  });
});

describe("timerView", () => {
  const now = Date.parse("2026-10-17T10:00:00Z");

  it("타이머가 없으면 none", () => {
    expect(
      timerView({ timerEndsAt: null, timerPausedRemaining: null }, now),
    ).toEqual({ kind: "none" });
  });

  it("종료 시각까지 남은 시간을 계산한다", () => {
    const v = timerView(
      { timerEndsAt: "2026-10-17T10:01:30Z", timerPausedRemaining: null },
      now,
    );
    expect(v).toEqual({ kind: "running", remainingMs: 90_000 });
  });

  it("지난 시각은 0 으로 고정한다", () => {
    const v = timerView(
      { timerEndsAt: "2026-10-17T09:00:00Z", timerPausedRemaining: null },
      now,
    );
    expect(v).toEqual({ kind: "running", remainingMs: 0 });
  });

  it("일시정지면 저장된 남은 초를 그대로 쓴다", () => {
    const v = timerView({ timerEndsAt: null, timerPausedRemaining: 42 }, now);
    expect(v).toEqual({ kind: "paused", remainingMs: 42_000 });
  });

  it("기기 시계가 틀려도 서버 기준으로 계산한다", () => {
    const serverNow = "2026-10-17T10:00:00Z";
    const wrongClient = now + 5 * 60_000; // 기기가 5분 빠름
    const offset = computeServerOffset(serverNow, wrongClient);
    const v = timerView(
      { timerEndsAt: "2026-10-17T10:01:00Z", timerPausedRemaining: null },
      wrongClient,
      offset,
    );
    expect(v).toEqual({ kind: "running", remainingMs: 60_000 });
  });
});

describe("formatRemaining", () => {
  it("올림해서 mm:ss 로 표시한다", () => {
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(61_000)).toBe("01:01");
    expect(formatRemaining(59_001)).toBe("01:00");
  });
});

describe("초대 코드와 닉네임", () => {
  it("공백과 소문자를 정리한다", () => {
    expect(normalizeInviteCode(" ab c2 3d ")).toBe("ABC23D");
  });

  it("헷갈리는 글자(I, O, 0, 1)나 길이가 다르면 거부한다", () => {
    expect(normalizeInviteCode("ABCDE0")).toBeNull();
    expect(normalizeInviteCode("ABCDEI")).toBeNull();
    expect(normalizeInviteCode("ABC")).toBeNull();
  });

  it("닉네임을 검사한다", () => {
    expect(validateNickname("  ")).not.toBeNull();
    expect(validateNickname("가".repeat(21))).not.toBeNull();
    expect(validateNickname("탐정\u0007")).not.toBeNull();
    expect(validateNickname(" 탐정 ")).toBeNull();
  });
});
