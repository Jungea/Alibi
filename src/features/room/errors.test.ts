import { describe, expect, it } from "vitest";

import { GENERIC_ROOM_ERROR, roomErrorMessage } from "./errors";

describe("roomErrorMessage", () => {
  it("알려진 오류를 한국어로 바꾼다", () => {
    expect(roomErrorMessage("players_not_ready")).toContain("준비");
    expect(roomErrorMessage("error: character_taken")).toContain("배정");
    expect(roomErrorMessage("forbidden")).toContain("권한");
  });

  it("알 수 없는 오류는 내부 메시지를 노출하지 않는다", () => {
    expect(roomErrorMessage("relation public.x does not exist")).toBe(
      GENERIC_ROOM_ERROR,
    );
    expect(roomErrorMessage(undefined)).toBe(GENERIC_ROOM_ERROR);
  });
});
