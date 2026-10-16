import { describe, expect, it } from "vitest";

import { buildImagePath, fitWithin, validateImageFile } from "./image-upload";

describe("validateImageFile", () => {
  it("허용된 형식과 크기는 통과한다", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateImageFile({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateImageFile({ type: "image/webp", size: 1000 })).toBeNull();
  });

  it("이미지가 아니거나 SVG/GIF 는 거부한다", () => {
    expect(
      validateImageFile({ type: "image/svg+xml", size: 1000 }),
    ).not.toBeNull();
    expect(validateImageFile({ type: "image/gif", size: 1000 })).not.toBeNull();
    expect(
      validateImageFile({ type: "application/pdf", size: 1000 }),
    ).not.toBeNull();
  });

  it("너무 크거나 빈 파일은 거부한다", () => {
    expect(
      validateImageFile({ type: "image/png", size: 11 * 1024 * 1024 }),
    ).not.toBeNull();
    expect(validateImageFile({ type: "image/png", size: 0 })).not.toBeNull();
  });
});

describe("fitWithin", () => {
  it("긴 변이 한도를 넘으면 비율을 유지해 줄인다", () => {
    expect(fitWithin(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
    expect(fitWithin(2000, 4000, 1000)).toEqual({ width: 500, height: 1000 });
  });

  it("이미 작으면 그대로 둔다", () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it("극단적인 비율에서도 최소 1px 을 유지한다", () => {
    expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe("buildImagePath", () => {
  it("본인 폴더 아래 경로를 만든다", () => {
    expect(buildImagePath("u1", "s1", "f1")).toBe("u1/s1/f1.webp");
  });
});
