/** 인물 일러스트 업로드용 순수 검증/계산 함수. (브라우저 API 를 쓰는 부분은 image-client.ts) */

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // 원본 선택 한도 (리사이즈 후에는 Storage 한도 5MB 이하가 된다)
export const MAX_IMAGE_EDGE = 1024;

export function validateImageFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "JPG, PNG, WebP 이미지만 올릴 수 있습니다.";
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return "이미지는 10MB 이하만 올릴 수 있습니다.";
  }
  if (file.size === 0) return "빈 파일입니다.";
  return null;
}

/** 긴 변이 maxEdge 를 넘지 않도록 비율을 유지해 줄인다. 이미 작으면 그대로 둔다. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function buildImagePath(
  userId: string,
  scenarioId: string,
  fileId: string,
) {
  return `${userId}/${scenarioId}/${fileId}.webp`;
}
