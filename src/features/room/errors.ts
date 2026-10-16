/** 방 RPC 가 돌려주는 오류 메시지를 사용자용 한국어 문구로 바꾼다. 알 수 없는 오류는 일반 문구로. */

const MESSAGES: [pattern: RegExp, message: string][] = [
  [/invalid_state/, "지금 단계에서는 할 수 없는 동작입니다."],
  [/players_not_ready/, "모든 참가자가 준비를 마쳐야 시작할 수 있습니다."],
  [/unassigned_players/, "인물이 배정되지 않은 참가자가 있습니다."],
  [
    /not_enough_players/,
    "참가자가 2명 이상이어야 합니다. (강제 시작은 1명부터)",
  ],
  [/not_enough_characters/, "배정할 수 있는 인물이 부족합니다."],
  [/character_taken/, "이미 다른 참가자에게 배정된 인물입니다."],
  [
    /no_more_rounds/,
    "진행할 라운드가 더 없습니다. 투표 또는 게임 종료를 진행해 주세요.",
  ],
  [/no_timer/, "이 라운드에는 타이머가 없습니다."],
  [/too_many_rooms/, "진행 중인 방은 최대 10개까지 만들 수 있습니다."],
  [
    /scenario is not playable/,
    "인물과 라운드가 각각 1개 이상 있어야 방을 만들 수 있습니다.",
  ],
  [
    /forbidden|not authenticated|42501|28000/,
    "권한이 없거나 로그인이 필요합니다.",
  ],
];

export const GENERIC_ROOM_ERROR =
  "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function roomErrorMessage(message: string | undefined | null): string {
  if (!message) return GENERIC_ROOM_ERROR;
  return MESSAGES.find(([p]) => p.test(message))?.[1] ?? GENERIC_ROOM_ERROR;
}

/** join_room 이 돌려주는 error 코드 */
export const JOIN_ERRORS: Record<string, string> = {
  not_found: "초대 코드를 찾을 수 없습니다. 코드를 다시 확인해 주세요.",
  rate_limited:
    "초대 코드를 너무 많이 틀렸습니다. 10분 뒤에 다시 시도해 주세요.",
  invalid_nickname: "닉네임을 확인해 주세요. (1~20자, 제어문자 불가)",
  nickname_taken: "이미 같은 닉네임을 쓰는 참가자가 있습니다.",
  full: "방이 가득 찼습니다.",
  already_started: "이미 게임이 시작된 방입니다.",
};
